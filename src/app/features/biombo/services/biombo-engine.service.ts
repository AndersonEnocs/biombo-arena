import { inject, Injectable, NgZone, signal } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RapierLoaderService } from '../../../core/services/rapier-loader.service';
import { SolidEntity } from '../models/solid.entity';
import { BiomboConfig, BiomboState, generateBiomboResults } from '../utilities/biombo.interfaces';

type BallExitAnimation = {
  mesh: THREE.Mesh;
  startAt: number;
  duration: number;
  curve: THREE.CatmullRomCurve3;
  targetSlotPos: THREE.Vector3;
  ballNumber: number;
  hasSettled: boolean;
  onSettled: () => void;
  startRotZ?: number;
  startRotY?: number;
  startRotX?: number;
  targetRotZ?: number;
};

type AgitationBallState = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  phase: number;
  radius: number;
  isDropping?: boolean;
  dropDelay?: number;
};

type SecondaryBiomboRig = {
  config: BiomboConfig;
  root: THREE.Group;
  drumGroup: THREE.Group;
  rotationShaftGroup: THREE.Group;
  mechanismGroup: THREE.Group;
  ballGroup?: THREE.Group;
  agitationBalls: THREE.Mesh[];
  agitationBallStates: AgitationBallState[];
  drawTimers: number[];
  mainRotationAngle: number;
  mechanismBias: number;
};

type TertiaryBiomboRig = SecondaryBiomboRig;
type QuaternaryBiomboRig = SecondaryBiomboRig;

@Injectable()
export class BiomboEngineService {
  public readonly isReady = signal(false);
  public readonly errorMessage = signal<string | null>(null);
  public readonly backgroundError = signal<string | null>(null);
  public readonly backgroundName = signal('Pasillo clásico');
  public readonly isChangingBackground = signal(false);
  public readonly extractedBalls = signal<number[]>([]);
  public readonly state = signal<BiomboState>('IDLE');
  public readonly secondaryExtractedBalls = signal<number[]>([]);
  public readonly secondaryState = signal<BiomboState>('IDLE');
  public readonly tertiaryExtractedBalls = signal<number[]>([]);
  public readonly tertiaryState = signal<BiomboState>('IDLE');
  public readonly quaternaryExtractedBalls = signal<number[]>([]);
  public readonly quaternaryState = signal<BiomboState>('IDLE');

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private backgroundTexture?: THREE.CubeTexture;
  private backdropRoot?: THREE.Group;
  private stagePodium?: THREE.Group;
  private readonly enableDetailedBackdrop = true;
  private readonly backgrounds = [
    { folder: 'hallway', label: 'Pasillo clásico' },
    { folder: 'office', label: 'Oficina moderna' },
  ] as const;
  private currentBackgroundIndex = 0;
  private animFrameId: number | null = null;
  private solids: { [key: string]: SolidEntity } = {};
  private config: BiomboConfig | null = null;
  private machineRoot!: THREE.Group;
  private secondaryRig?: SecondaryBiomboRig;
  private tertiaryRig?: TertiaryBiomboRig;
  private quaternaryRig?: QuaternaryBiomboRig;
  private drawTimers: number[] = [];
  private secondaryDrawTimers: number[] = [];
  private tertiaryDrawTimers: number[] = [];
  private quaternaryDrawTimers: number[] = [];
  private ballEffects: BallExitAnimation[] = [];
  private drumGroup?: THREE.Group;
  private mainRotationShaftGroup?: THREE.Group;
  private mechanismGroup?: THREE.Group;
  private ballGroup?: THREE.Group;
  public mainRotationAngle = 0;
  public mechanismBias = 0;
  private agitationBalls: THREE.Mesh[] = [];
  private agitationBallStates: AgitationBallState[] = [];
  private readonly lotteryTableTemplates = new Map<string, THREE.Object3D>();
  private lastAgitationFrame = 0;
  private readonly shuffleDurationMs = 8000;
  private readonly rotationCenter = new THREE.Vector3(0, 0, 0);

  private baseCameraPosition = new THREE.Vector3(0, 0, 48);
  private baseCameraTarget = new THREE.Vector3(0, 0, 0);
  private currentCameraTarget = new THREE.Vector3(0, 0, 0);
  private activeExtractingRoot: THREE.Group | null = null;
  private cameraSequence: 'overview' | 'shuffle' | 'draw' = 'overview';

  private readonly agitationPalette = [
    0x00d2ff,
    0xffd200,
    0xff3b6f,
    0x00e676,
    0xffffff,
    0x9c27b0,
    0xff9100,
    0x3d5afe,
  ];

  private readonly rapierLoader = inject(RapierLoaderService);
  private readonly ngZone = inject(NgZone);

  public async initialize(
    container: HTMLElement,
    config: BiomboConfig,
    secondaryConfig: BiomboConfig | null = null,
    tertiaryConfig: BiomboConfig | null = null,
    quaternaryConfig: BiomboConfig | null = null,
  ): Promise<void> {
    this.config = config;
    this.secondaryRig = undefined;
    this.tertiaryRig = undefined;
    this.quaternaryRig = undefined;
    this.clearSecondaryTimers();
    this.clearTertiaryTimers();
    this.clearQuaternaryTimers();
    this.extractedBalls.set([]);
    this.state.set('IDLE');
    this.secondaryExtractedBalls.set([]);
    this.secondaryState.set('IDLE');
    this.tertiaryExtractedBalls.set([]);
    this.tertiaryState.set('IDLE');
    this.quaternaryExtractedBalls.set([]);
    this.quaternaryState.set('IDLE');
    this.errorMessage.set(null);
    this.backgroundError.set(null);
    this.backgroundName.set(this.backgrounds[0].label);
    this.currentBackgroundIndex = 0;
    this.isChangingBackground.set(false);
    this.mainRotationAngle = 0;
    this.activeExtractingRoot = null;
    this.cameraSequence = 'overview';
    this.clearBallEffects();

    try {
      const rapier = await (this.rapierLoader as any).getRapier?.() ?? await (this.rapierLoader as any).load?.();

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      this.scene = new THREE.Scene();
      this.backgroundTexture = await this.loadBackgroundTexture(this.backgrounds[0].folder);
      this.scene.background = this.backgroundTexture;
      this.scene.environment = this.backgroundTexture;

      if (this.enableDetailedBackdrop) {
        try {
          this.backdropRoot = await this.loadBackdropScene();
          this.scene.add(this.backdropRoot);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Error al cargar el fondo 3D.';
          this.backgroundError.set(`Fondo 3D desactivado; se conserva el fondo clásico. ${message}`);
          console.error('Error cargando el fondo 3D:', error);
        }
      }

      this.machineRoot = new THREE.Group();
      this.machineRoot.name = 'biombo-machine-alpha';
      this.scene.add(this.machineRoot);

      const aspect = width / height;
      this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
      this.camera.position.set(0, 0, 48);
      this.camera.lookAt(0, 0, 0);

      this.baseCameraPosition.copy(this.camera.position);
      this.baseCameraTarget.set(0, 0, 0);
      this.currentCameraTarget.copy(this.baseCameraTarget);

      const probeCanvas = document.createElement('canvas');
      if (!probeCanvas.getContext('webgl2')) {
        throw new Error('WebGL 2 no disponible.');
      }

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        canvas: probeCanvas,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.25;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      container.replaceChildren(this.renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      this.scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.9);
      mainLight.position.set(15, 30, 25);
      mainLight.castShadow = true;
      this.scene.add(mainLight);

      const frontFillLight = new THREE.DirectionalLight(0xffffff, 0.95);
      frontFillLight.position.set(0, 10, 40);
      this.scene.add(frontFillLight);

      const rimLightLeft = new THREE.PointLight(0x70a0ff, 18, 80);
      rimLightLeft.position.set(-25, 10, 10);
      this.scene.add(rimLightLeft);

      const rimLightRight = new THREE.PointLight(0xffffff, 12, 80);
      rimLightRight.position.set(25, -10, 15);
      this.scene.add(rimLightRight);

      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.0,
        transparent: true,
        opacity: 0.22,
        reflectivity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        side: THREE.FrontSide,
        depthWrite: false,
        envMap: this.backgroundTexture ?? null,
        envMapIntensity: 0.85,
      });

      const rampMaterial = new THREE.MeshStandardMaterial({
        color: 0x111317,
        metalness: 0.75,
        roughness: 0.35,
        envMap: this.backgroundTexture ?? null,
      });

      const [hollow, ramp, lotteryModel] = await Promise.all([
        new SolidEntity(rapier, glassMaterial).load('/assets/hollow_sphere.fbx'),
        new SolidEntity(rapier, rampMaterial).load('/assets/ramp.fbx'),
        new GLTFLoader().loadAsync('/assets/loteria.glb'),
      ]);

      this.solids['hollow'] = hollow;
      this.solids['ramp'] = ramp;

      hollow.center(0);
      this.buildDrumPivot(hollow);

      ramp.meshes.forEach((mesh) => this.machineRoot.add(mesh));

      this.lotteryTableTemplates.clear();
      lotteryModel.scene.traverse((object) => {
        const normalizedName = object.name
          .replace(/[^a-z]/gi, '')
          .toLowerCase()
          .replace(/\d+$/, '');
        const tablePartName = new Map([
          ['base', 'Base'],
          ['backwall', 'Back Wall'],
          ['backpanel', 'Back Panel'],
          ['ballholder', 'Ball Holder'],
          ['ballholderglass', 'Ball Holder Glass'],
        ]).get(normalizedName);
        if (tablePartName && !this.lotteryTableTemplates.has(tablePartName)) {
          this.lotteryTableTemplates.set(tablePartName, object);
        }
      });

      this.machineRoot.add(this.createLotteryTable(0xf4f4f0));
      this.alignLotteryTable(this.machineRoot);

      this.buildInternalMechanismFromGLTF(lotteryModel.scene);

      this.stageBallsInChutes(this.machineRoot, this.agitationBalls, this.agitationBallStates, this.ballGroup);

      if (secondaryConfig) {
        this.createSecondaryRig(secondaryConfig);
      }
      if (tertiaryConfig) {
        this.createTertiaryRig(tertiaryConfig);
      }
      if (quaternaryConfig) {
        this.createQuaternaryRig(quaternaryConfig);
      }
      this.updateSceneLayout(width, height);

      this.ngZone.runOutsideAngular(() => this.animate());
      this.isReady.set(true);
    } catch (err: any) {
      const message = err?.message || 'Error al cargar modelos';
      console.error('Error cargando estructura:', err);
      this.errorMessage.set(message);
      throw new Error(message);
    }
  }

  private createLotteryTable(color: number): THREE.Group {
    const table = new THREE.Group();
    table.name = 'biombo-table-asset';
    const scale = 0.92 / 0.079;
    table.rotation.y = Math.PI / 2;
    table.scale.setScalar(scale);

    const backWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4f4f0,
      roughness: 0.32,
      metalness: 0.1,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 0.8,
    });

    const chuteRailsMaterial = new THREE.MeshStandardMaterial({
      color: 0x353a44,
      metalness: 0.85,
      roughness: 0.25,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 0.9,
    });

    const chuteGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.02,
      metalness: 0.0,
      clearcoat: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 0.75,
    });

    for (const name of ['Base', 'Back Wall', 'Back Panel', 'Ball Holder', 'Ball Holder Glass']) {
      const template = this.lotteryTableTemplates.get(name);
      if (!template) {
        continue;
      }
      const part = template.clone(true);
      part.name = name;
      part.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }

        object.castShadow = true;
        object.receiveShadow = true;

        if (name === 'Back Wall') {
          object.material = backWallMaterial.clone();
        } else if (name === 'Ball Holder') {
          object.material = chuteRailsMaterial.clone();
        } else if (name === 'Ball Holder Glass') {
          object.material = chuteGlassMaterial.clone();
        } else if (name === 'Base') {
          object.material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.45,
            roughness: 0.4,
            envMap: this.backgroundTexture ?? null,
            envMapIntensity: 0.8,
          });
        } else {
          object.material = Array.isArray(object.material)
            ? object.material.map((mat) => mat.clone())
            : object.material.clone();
        }
      });
      table.add(part);
    }

    this.setLotteryTableColor(table, color);
    return table;
  }

  private buildInternalMechanismFromGLTF(lotteryScene: THREE.Group): void {
    const hollowMesh = this.solids['hollow']?.mesh;
    if (!hollowMesh) {
      return;
    }
    hollowMesh.renderOrder = 10;

    const mechanism = new THREE.Group();
    mechanism.name = 'internal-mechanism';
    mechanism.position.set(0, 0, 0);
    mechanism.renderOrder = 2;

    const agitatorAssembly = new THREE.Group();
    agitatorAssembly.name = 'agitator-assembly';

    const scale = 0.92 / 0.079;

    const neonRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00d2ff,
      emissiveIntensity: 3.5,
      roughness: 0.2,
      metalness: 0.1,
    });

    const paddleMaterial = new THREE.MeshStandardMaterial({
      color: 0x62b846,
      emissive: 0x1d4715,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.22,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 1.0,
    });

    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.96,
      roughness: 0.12,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 1.2,
    });

    const paddleTemplate = lotteryScene.getObjectByName('Paddle');
    const paddleRingTemplate = lotteryScene.getObjectByName('Paddle_Ring') || lotteryScene.getObjectByName('Circle002');
    const paddleAxleTemplate = lotteryScene.getObjectByName('Paddle_Axle');
    const paddleEndTemplate = lotteryScene.getObjectByName('Paddle_end');

    const centerOffset = new THREE.Vector3(0.02, 3.03, 0.0);

    const parts = [
      { tmpl: paddleTemplate, mat: paddleMaterial },
      { tmpl: paddleRingTemplate, mat: neonRingMaterial },
      { tmpl: paddleAxleTemplate, mat: chromeMaterial },
      { tmpl: paddleEndTemplate, mat: chromeMaterial },
    ];

    parts.forEach(({ tmpl, mat }) => {
      if (!tmpl) return;
      const clone = tmpl.clone(true);
      clone.position.sub(centerOffset);
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = mat;
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      agitatorAssembly.add(clone);
    });

    agitatorAssembly.scale.setScalar(scale);
    agitatorAssembly.rotation.y = Math.PI / 2;
    mechanism.add(agitatorAssembly);

    hollowMesh.add(mechanism);
    this.mechanismGroup = mechanism;

    const collectorTemplate = lotteryScene.getObjectByName('Collector');
    if (collectorTemplate) {
      const collectorClone = collectorTemplate.clone(true);
      collectorClone.scale.setScalar(scale);
      collectorClone.rotation.y = Math.PI / 2;
      collectorClone.position.set(0, -8.2, 0);
      collectorClone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = chromeMaterial;
        }
      });
      this.machineRoot.add(collectorClone);
    }

    const ballGroup = new THREE.Group();
    ballGroup.name = 'internal-ball-group';
    ballGroup.renderOrder = 3;
    ballGroup.position.set(0, 0, 0);
    this.machineRoot.add(ballGroup);
    this.ballGroup = ballGroup;

    this.buildAgitationBalls();
  }

  public async changeBackground(direction: -1 | 1): Promise<void> {
    if (!this.scene || this.isChangingBackground()) {
      return;
    }

    const nextIndex = (
      this.currentBackgroundIndex + direction + this.backgrounds.length
    ) % this.backgrounds.length;
    if (nextIndex === this.currentBackgroundIndex) {
      return;
    }

    this.isChangingBackground.set(true);
    this.backgroundError.set(null);

    try {
      const nextBackground = this.backgrounds[nextIndex];
      const texture = await this.loadBackgroundTexture(nextBackground.folder);
      const previousTexture = this.backgroundTexture;
      this.backgroundTexture = texture;
      this.scene.background = texture;
      this.scene.environment = texture;

      if (this.backdropRoot) {
        this.backdropRoot.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.envMap = texture ?? null;
            obj.material.needsUpdate = true;
          }
        });
      }

      if (this.stagePodium) {
        this.stagePodium.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.envMap = texture ?? null;
            obj.material.needsUpdate = true;
          }
        });
      }

      this.currentBackgroundIndex = nextIndex;
      this.backgroundName.set(nextBackground.label);
      previousTexture?.dispose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al cambiar fondo.';
      this.backgroundError.set(message);
      console.error(error);
    } finally {
      this.isChangingBackground.set(false);
    }
  }

  private loadBackgroundTexture(folder: string): Promise<THREE.CubeTexture> {
    return new Promise<THREE.CubeTexture>((resolve, reject) => {
      new THREE.CubeTextureLoader()
        .setPath(`/assets/skybox/${folder}/`)
        .load(
          ['posx.png', 'negx.png', 'posy.png', 'negy.png', 'posz.png', 'negz.png'],
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            resolve(texture);
          },
          undefined,
          reject,
        );
    });
  }

  private async loadBackdropScene(): Promise<THREE.Group> {
    const gltf = await new GLTFLoader().loadAsync('/assets/posible-background.glb');
    const root = gltf.scene;
    root.name = 'biombo-backdrop';

    root.position.set(0, -25.6, -4.0);
    root.rotation.set(0, 0, 0);
    root.scale.set(3.2, 2.35, 3.2);

    const floorMeshes: THREE.Mesh[] = [];
    const columnCandidates: THREE.Object3D[] = [];

    root.traverse((object) => {
      if (object.name.toLowerCase() === 'volume') {
        object.visible = false;
        return;
      }
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      object.castShadow = false;
      object.receiveShadow = true;

      const enhanceMaterial = (mat: THREE.Material): THREE.Material => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          const clone = mat.clone();
          clone.envMap = this.backgroundTexture ?? null;
          clone.envMapIntensity = 0.95;
          clone.roughness = Math.min(0.45, Math.max(0.18, clone.roughness * 0.85));
          clone.metalness = Math.min(0.35, clone.metalness);
          return clone;
        }
        return mat;
      };

      object.material = Array.isArray(object.material)
        ? object.material.map(enhanceMaterial)
        : enhanceMaterial(object.material);

      object.geometry.computeBoundingBox();
      const bbox = object.geometry.boundingBox;
      if (bbox) {
        const size = bbox.getSize(new THREE.Vector3());
        if (size.y < 3.0 && (size.x > 8.0 || size.z > 8.0)) {
          floorMeshes.push(object);
        }
      }
    });

    const mainFloor = floorMeshes[0];
    if (mainFloor) {
      mainFloor.name = 'backdrop-main-floor';
    }

    root.updateMatrixWorld(true);
    root.children.forEach((child) => {
      if (child === mainFloor || child.name.toLowerCase() === 'volume') {
        return;
      }
      const childBox = new THREE.Box3().setFromObject(child);
      const childSize = childBox.getSize(new THREE.Vector3());
      const childCenter = childBox.getCenter(new THREE.Vector3());

      if (childSize.y > 3.0) {
        columnCandidates.push(child);
        if (childCenter.x < -0.1) {
          child.position.x -= 4.3;
        } else if (childCenter.x > 0.1) {
          child.position.x += 4.3;
        }
      }
    });

    if (columnCandidates.length === 0) {
      root.traverse((object) => {
        if (object === mainFloor || object.name.toLowerCase() === 'volume' || !(object instanceof THREE.Mesh)) {
          return;
        }
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        if (size.y > 3.0) {
          if (center.x < -0.1) {
            object.position.x -= 4.3;
          } else if (center.x > 0.1) {
            object.position.x += 4.3;
          }
        }
      });
    }

    if (mainFloor) {
      mainFloor.scale.set(4.5, 1.0, 4.5);
      const floorMat = mainFloor.material;
      const mat = Array.isArray(floorMat) ? floorMat[0] : floorMat;

      if (mat && 'map' in mat) {
        const matWithMap = mat as THREE.MeshStandardMaterial;
        if (matWithMap.map) {
          matWithMap.map.wrapS = THREE.RepeatWrapping;
          matWithMap.map.wrapT = THREE.RepeatWrapping;
          matWithMap.map.repeat.set(
            (matWithMap.map.repeat.x || 1) * 4.5,
            (matWithMap.map.repeat.y || 1) * 4.5,
          );
          matWithMap.map.needsUpdate = true;
        }
      }
    }

    const groundGeo = new THREE.PlaneGeometry(600, 600);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e2024,
      roughness: 0.32,
      metalness: 0.15,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 0.85,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = -0.06;
    groundMesh.receiveShadow = true;
    root.add(groundMesh);

    return root;
  }

  public setSecondaryConfig(config: BiomboConfig | null): void {
    if (!this.isReady() || !this.scene || !this.machineRoot) {
      return;
    }

    if (!config) {
      this.clearSecondaryTimers();
      if (this.secondaryRig) {
        this.clearBallEffects(this.secondaryRig.root);
        this.scene.remove(this.secondaryRig.root);
        this.secondaryRig = undefined;
      }
      this.secondaryState.set('IDLE');
      this.secondaryExtractedBalls.set([]);
      this.updateSceneLayout(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
      return;
    }

    if (this.secondaryRig?.config.id === config.id) {
      this.secondaryRig.config = config;
      return;
    }

    this.clearSecondaryTimers();
    if (this.secondaryRig) {
      this.clearBallEffects(this.secondaryRig.root);
      this.scene.remove(this.secondaryRig.root);
    }
    this.secondaryState.set('IDLE');
    this.secondaryExtractedBalls.set([]);
    this.createSecondaryRig(config);
    this.updateSceneLayout(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
  }

  private createSecondaryRig(config: BiomboConfig): void {
    const root = this.machineRoot.clone(true);
    root.name = 'biombo-machine-beta';
    this.alignLotteryTable(root);
    this.setLotteryTableColor(root, 0x17191f);

    const drawnBalls: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.userData['isDrawnBall']) {
        drawnBalls.push(object);
      }
    });
    drawnBalls.forEach((ball) => ball.parent?.remove(ball));

    const drumGroup = root.getObjectByName('sphere-rotation-pivot');
    const mechanismGroup = root.getObjectByName('internal-mechanism');
    const ballGroup = root.getObjectByName('internal-ball-group') as THREE.Group | undefined;

    if (!(drumGroup instanceof THREE.Group) || !(mechanismGroup instanceof THREE.Group)) {
      throw new Error('Error al preparar biombo secundario.');
    }

    const agitationBalls = this.agitationBalls.map((_, index) => {
      const ball = root.getObjectByName(`agitation-ball-${index}`);
      if (!(ball instanceof THREE.Mesh)) {
        throw new Error('Error en conjunto de bolas.');
      }
      ball.visible = true;
      return ball;
    });
    this.applyAgitationBallAppearance(agitationBalls, config);

    const rigStates = agitationBalls.map((mesh, index) => ({
      mesh,
      velocity: new THREE.Vector3(),
      phase: this.agitationBallStates[index]?.phase ?? index * 0.71,
      radius: this.agitationBallStates[index]?.radius ?? 0.92,
    }));

    this.stageBallsInChutes(root, agitationBalls, rigStates, ballGroup);

    this.secondaryRig = {
      config,
      root,
      drumGroup,
      rotationShaftGroup: new THREE.Group(),
      mechanismGroup,
      ballGroup,
      agitationBalls,
      agitationBallStates: rigStates,
      drawTimers: this.secondaryDrawTimers,
      mainRotationAngle: 0,
      mechanismBias: 0,
    };
    this.scene.add(root);
    this.secondaryState.set('IDLE');
    this.secondaryExtractedBalls.set([]);
  }

  public setTertiaryConfig(config: BiomboConfig | null): void {
    if (!this.isReady() || !this.scene || !this.machineRoot) {
      return;
    }

    if (!config) {
      this.clearTertiaryTimers();
      if (this.tertiaryRig) {
        this.clearBallEffects(this.tertiaryRig.root);
        this.scene.remove(this.tertiaryRig.root);
        this.secondaryState.set('IDLE');
      }
      this.tertiaryState.set('IDLE');
      this.tertiaryExtractedBalls.set([]);
      this.updateSceneLayout(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
      return;
    }

    if (this.tertiaryRig?.config.id === config.id) {
      this.tertiaryRig.config = config;
      return;
    }

    this.clearTertiaryTimers();
    if (this.tertiaryRig) {
      this.clearBallEffects(this.tertiaryRig.root);
      this.scene.remove(this.tertiaryRig.root);
    }
    this.tertiaryState.set('IDLE');
    this.tertiaryExtractedBalls.set([]);
    this.createTertiaryRig(config);
    this.updateSceneLayout(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
  }

  private createTertiaryRig(config: BiomboConfig): void {
    const root = this.machineRoot.clone(true);
    root.name = 'biombo-machine-gamma';
    this.alignLotteryTable(root);
    this.setLotteryTableColor(root, 0xc62828);

    const drawnBalls: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.userData['isDrawnBall']) {
        drawnBalls.push(object);
      }
    });
    drawnBalls.forEach((ball) => ball.parent?.remove(ball));

    const drumGroup = root.getObjectByName('sphere-rotation-pivot');
    const mechanismGroup = root.getObjectByName('internal-mechanism');
    const ballGroup = root.getObjectByName('internal-ball-group') as THREE.Group | undefined;

    if (!(drumGroup instanceof THREE.Group) || !(mechanismGroup instanceof THREE.Group)) {
      throw new Error('Error al preparar biombo terciario.');
    }

    const agitationBalls = this.agitationBalls.map((_, index) => {
      const ball = root.getObjectByName(`agitation-ball-${index}`);
      if (!(ball instanceof THREE.Mesh)) {
        throw new Error('Error en conjunto de bolas.');
      }
      ball.visible = true;
      return ball;
    });
    this.applyAgitationBallAppearance(agitationBalls, config);

    const rigStates = agitationBalls.map((mesh, index) => ({
      mesh,
      velocity: new THREE.Vector3(),
      phase: this.agitationBallStates[index]?.phase ?? index * 0.71,
      radius: this.agitationBallStates[index]?.radius ?? 0.92,
    }));

    this.stageBallsInChutes(root, agitationBalls, rigStates, ballGroup);

    this.tertiaryRig = {
      config,
      root,
      drumGroup,
      rotationShaftGroup: new THREE.Group(),
      mechanismGroup,
      ballGroup,
      agitationBalls,
      agitationBallStates: rigStates,
      drawTimers: this.tertiaryDrawTimers,
      mainRotationAngle: 0,
      mechanismBias: 0,
    };
    this.scene.add(root);
    this.tertiaryState.set('IDLE');
    this.tertiaryExtractedBalls.set([]);
  }

  public setQuaternaryConfig(config: BiomboConfig | null): void {
    if (!this.isReady() || !this.scene || !this.machineRoot) {
      return;
    }

    if (!config) {
      this.clearQuaternaryTimers();
      if (this.quaternaryRig) {
        this.clearBallEffects(this.quaternaryRig.root);
        this.scene.remove(this.quaternaryRig.root);
        this.quaternaryRig = undefined;
      }
      this.quaternaryState.set('IDLE');
      this.quaternaryExtractedBalls.set([]);
      this.updateSceneLayout(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
      return;
    }

    if (this.quaternaryRig?.config.id === config.id) {
      this.quaternaryRig.config = config;
      return;
    }

    this.clearQuaternaryTimers();
    if (this.quaternaryRig) {
      this.clearBallEffects(this.quaternaryRig.root);
      this.scene.remove(this.quaternaryRig.root);
    }
    this.quaternaryState.set('IDLE');
    this.quaternaryExtractedBalls.set([]);
    this.createQuaternaryRig(config);
    this.updateSceneLayout(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
  }

  private createQuaternaryRig(config: BiomboConfig): void {
    const root = this.machineRoot.clone(true);
    root.name = 'biombo-machine-delta';
    this.alignLotteryTable(root);
    this.setLotteryTableColor(root, 0x1565c0);

    const drawnBalls: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.userData['isDrawnBall']) {
        drawnBalls.push(object);
      }
    });
    drawnBalls.forEach((ball) => ball.parent?.remove(ball));

    const drumGroup = root.getObjectByName('sphere-rotation-pivot');
    const mechanismGroup = root.getObjectByName('internal-mechanism');
    const ballGroup = root.getObjectByName('internal-ball-group') as THREE.Group | undefined;

    if (!(drumGroup instanceof THREE.Group) || !(mechanismGroup instanceof THREE.Group)) {
      throw new Error('Error al preparar biombo cuaternario.');
    }

    const agitationBalls = this.agitationBalls.map((_, index) => {
      const ball = root.getObjectByName(`agitation-ball-${index}`);
      if (!(ball instanceof THREE.Mesh)) {
        throw new Error('Error en conjunto de bolas.');
      }
      ball.visible = true;
      return ball;
    });
    this.applyAgitationBallAppearance(agitationBalls, config);

    const rigStates = agitationBalls.map((mesh, index) => ({
      mesh,
      velocity: new THREE.Vector3(),
      phase: this.agitationBallStates[index]?.phase ?? index * 0.71,
      radius: this.agitationBallStates[index]?.radius ?? 0.92,
    }));

    this.stageBallsInChutes(root, agitationBalls, rigStates, ballGroup);

    this.quaternaryRig = {
      config,
      root,
      drumGroup,
      rotationShaftGroup: new THREE.Group(),
      mechanismGroup,
      ballGroup,
      agitationBalls,
      agitationBallStates: rigStates,
      drawTimers: this.quaternaryDrawTimers,
      mainRotationAngle: 0,
      mechanismBias: 0,
    };
    this.scene.add(root);
    this.quaternaryState.set('IDLE');
    this.quaternaryExtractedBalls.set([]);
  }

  private alignLotteryTable(root: THREE.Group): void {
    const table = root.getObjectByName('biombo-table-asset');
    const machineAnchor = root.getObjectByName('sphere-rotation-pivot');
    const tableAnchor = table?.getObjectByName('Circle005')
      || table?.getObjectByName('Circle005_1')
      || table?.getObjectByName('Back Panel');

    if (!table || !machineAnchor || !tableAnchor) {
      throw new Error('Error al centrar la mesa con el biombo.');
    }

    root.updateWorldMatrix(true, true);
    const tableBounds = new THREE.Box3().setFromObject(tableAnchor);
    const tableCenter = root.worldToLocal(tableBounds.getCenter(new THREE.Vector3()));
    const machineCenter = root.worldToLocal(machineAnchor.getWorldPosition(new THREE.Vector3()));
    const targetCenter = machineCenter.add(new THREE.Vector3(0, 0, -10.8));

    table.position.add(targetCenter.sub(tableCenter));
    root.updateWorldMatrix(true, true);
  }

  private alignLotteryTableToBiombo(root: THREE.Group): void {
    const table = root.getObjectByName('biombo-table-asset');
    const machineAnchor = root.getObjectByName('sphere-rotation-pivot');
    const tableAnchor = table?.getObjectByName('Circle005')
      || table?.getObjectByName('Circle005_1')
      || table?.getObjectByName('Back Panel');

    if (!table || !machineAnchor || !tableAnchor) {
      throw new Error('Error al centrar la mesa con el biombo.');
    }

    root.updateWorldMatrix(true, true);
    const tableCenterWorld = new THREE.Box3()
      .setFromObject(tableAnchor)
      .getCenter(new THREE.Vector3());
    const machineCenterScreen = machineAnchor.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const tableCenterScreen = tableCenterWorld.clone().project(this.camera);
    const targetCenterWorld = new THREE.Vector3(
      machineCenterScreen.x,
      machineCenterScreen.y,
      tableCenterScreen.z,
    ).unproject(this.camera);
    const currentCenterRoot = root.worldToLocal(tableCenterWorld);
    const targetCenterRoot = root.worldToLocal(targetCenterWorld);

    table.position.add(targetCenterRoot.sub(currentCenterRoot));
    root.updateWorldMatrix(true, true);
  }

  private setLotteryTableColor(root: THREE.Object3D, color: number): void {
    const table = root.getObjectByName('biombo-table-asset');
    if (!table) {
      return;
    }

    table.traverse((object) => {
      if (object.name !== 'Base' && object.name !== 'Back Wall') {
        return;
      }
      const partColor = object.name === 'Back Wall' ? 0xf4f4f0 : color;
      object.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) {
          return;
        }
        const applyColor = (material: THREE.Material): THREE.Material => {
          const coloredMaterial = material.clone();
          if ('color' in coloredMaterial && coloredMaterial.color instanceof THREE.Color) {
            coloredMaterial.color.setHex(partColor);
          }
          return coloredMaterial;
        };
        part.material = Array.isArray(part.material)
          ? part.material.map(applyColor)
          : applyColor(part.material);
      });
    });
  }

  private updateSceneLayout(width: number, height: number): void {
    if (!this.camera || !this.machineRoot) {
      return;
    }

    const portrait = width < height;
    const biomboElevation = 1.2;
    const floorClearance = 26.8;
    let targetFloorY = -floorClearance;

    if (this.quaternaryRig) {
      const scale = portrait ? 0.26 : 0.3;
      const horizontalSeparation = portrait ? 8.5 : 10.5;
      const frontHorizontalSeparation = portrait ? 10.5 : 14.5;
      const verticalSeparation = portrait ? 5.5 : 4.0;
      const depthSeparation = portrait ? 9 : 12;

      this.machineRoot.scale.setScalar(scale);
      this.machineRoot.position.set(-horizontalSeparation, verticalSeparation + biomboElevation, -depthSeparation);

      this.secondaryRig?.root.scale.setScalar(scale);
      this.secondaryRig?.root.position.set(horizontalSeparation, verticalSeparation + biomboElevation, -depthSeparation);

      this.tertiaryRig?.root.scale.setScalar(scale);
      this.tertiaryRig?.root.position.set(-frontHorizontalSeparation, -verticalSeparation + biomboElevation, depthSeparation);

      this.quaternaryRig.root.scale.setScalar(scale);
      this.quaternaryRig.root.position.set(frontHorizontalSeparation, -verticalSeparation + biomboElevation, depthSeparation);

      this.baseCameraPosition.set(0, 0, portrait ? 76 : 68);
      targetFloorY = -verticalSeparation + biomboElevation - floorClearance * scale;
    } else if (this.tertiaryRig) {
      const scale = portrait ? 0.34 : 0.42;
      const separation = portrait ? 15.5 : 17.5;
      this.machineRoot.scale.setScalar(scale);
      this.machineRoot.position.set(portrait ? 0 : -separation, (portrait ? separation : 0) + biomboElevation, 0);
      this.secondaryRig?.root.scale.setScalar(scale);
      this.secondaryRig?.root.position.set(0, biomboElevation, 0);
      this.tertiaryRig.root.scale.setScalar(scale);
      this.tertiaryRig.root.position.set(portrait ? 0 : separation, (portrait ? -separation : 0) + biomboElevation, 0);
      this.baseCameraPosition.set(0, 0, portrait ? 70 : 64);

      const lowestY = (portrait ? -separation : 0) + biomboElevation;
      targetFloorY = lowestY - floorClearance * scale;
    } else if (this.secondaryRig) {
      const scale = portrait ? 0.42 : 0.58;

      const biombo1_X = portrait ? 0 : -13.5;
      const biombo1_Y = (portrait ? 12.0 : 0.0) + biomboElevation;

      const biombo2_X = portrait ? 0 : 13.5;
      const biombo2_Y = (portrait ? -12.0 : 0.0) + biomboElevation;

      this.machineRoot.scale.setScalar(scale);
      this.machineRoot.position.set(biombo1_X, biombo1_Y, 0);

      this.secondaryRig.root.scale.setScalar(scale);
      this.secondaryRig.root.position.set(biombo2_X, biombo2_Y, 0);

      this.baseCameraPosition.set(0, 0, portrait ? 67 : 61);

      const lowestY = (portrait ? -12.0 : 0.0) + biomboElevation;
      targetFloorY = lowestY - floorClearance * scale;
    } else {
      this.machineRoot.scale.setScalar(1);
      this.machineRoot.position.set(0, biomboElevation, 0);
      this.baseCameraPosition.set(0, 0, 110.88);
      targetFloorY = biomboElevation - floorClearance;
    }

    this.baseCameraTarget.set(0, 0, 0);
    this.camera.position.copy(this.baseCameraPosition);
    this.currentCameraTarget.copy(this.baseCameraTarget);
    this.camera.lookAt(this.currentCameraTarget);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    const activeRoots = [
      this.machineRoot,
      this.secondaryRig?.root,
      this.tertiaryRig?.root,
      this.quaternaryRig?.root,
    ].filter((r): r is THREE.Group => !!r);

    for (const root of activeRoots) {
      this.alignLotteryTableToBiombo(root);
      root.updateMatrixWorld(true);
    }

    if (this.backdropRoot) {
      this.backdropRoot.position.y = targetFloorY;
      this.backdropRoot.updateWorldMatrix(true, true);
    }

    if (this.quaternaryRig && this.tertiaryRig && this.secondaryRig) {
      const scale = portrait ? 0.26 : 0.3;
      const verticalSeparation = portrait ? 5.5 : 4.0;
      const depthSeparation = portrait ? 9 : 12;

      const frontBaseY = -verticalSeparation + biomboElevation - floorClearance * scale;
      const backBaseY = verticalSeparation + biomboElevation - floorClearance * scale;
      const podiumHeight = backBaseY - frontBaseY;

      this.updateStagePodium(frontBaseY, podiumHeight, depthSeparation);
    } else {
      if (this.stagePodium) {
        this.stagePodium.visible = false;
      }
    }
  }

  private updateStagePodium(frontBaseY: number, podiumHeight: number, depthSeparation: number): void {
    if (!this.stagePodium) {
      this.stagePodium = new THREE.Group();
      this.stagePodium.name = 'stage-tiered-podium';
      this.scene.add(this.stagePodium);
    }

    while (this.stagePodium.children.length > 0) {
      const child = this.stagePodium.children[0];
      this.stagePodium.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }

    const podiumWidth = 38;
    const podiumDepth = 24;
    const centerY = frontBaseY + podiumHeight / 2;
    const centerZ = -depthSeparation;

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x222429,
      roughness: 0.32,
      metalness: 0.22,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 0.85,
    });

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.18,
      metalness: 0.88,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 1.1,
    });

    const baseGeo = new THREE.BoxGeometry(podiumWidth, podiumHeight, podiumDepth);
    const baseMesh = new THREE.Mesh(baseGeo, stoneMaterial);
    baseMesh.position.set(0, centerY, centerZ);
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    this.stagePodium.add(baseMesh);

    const topCapHeight = 0.35;
    const capGeo = new THREE.BoxGeometry(podiumWidth + 0.8, topCapHeight, podiumDepth + 0.8);
    const capMesh = new THREE.Mesh(capGeo, stoneMaterial);
    capMesh.position.set(0, frontBaseY + podiumHeight - topCapHeight / 2, centerZ);
    capMesh.receiveShadow = true;
    capMesh.castShadow = true;
    this.stagePodium.add(capMesh);

    const trimHeight = 0.12;
    const trimGeo = new THREE.BoxGeometry(podiumWidth + 0.9, trimHeight, 0.1);
    const trimMesh = new THREE.Mesh(trimGeo, goldMaterial);
    trimMesh.position.set(
      0,
      frontBaseY + podiumHeight - topCapHeight,
      centerZ + (podiumDepth + 0.8) / 2,
    );
    trimMesh.castShadow = true;
    this.stagePodium.add(trimMesh);

    this.stagePodium.visible = true;
  }

  private stageBallsInChutes(
    machineRoot: THREE.Group,
    balls: THREE.Mesh[],
    ballStates: AgitationBallState[],
    ballGroup?: THREE.Group,
  ): void {
    if (!balls || balls.length === 0) return;

    const numChutes = 8;
    const chuteWidth = 15;
    const startX = -chuteWidth / 2;
    const stepX = chuteWidth / (numChutes - 1);
    const ballRadius = ballStates[0]?.radius || 0.92;
    const chuteDepth = -ballRadius * 1.5;
    const rowSpacing = ballRadius * 2.1;

    for (let index = 0; index < balls.length; index++) {
      const ball = balls[index];
      const col = index % numChutes;
      const row = Math.floor(index / numChutes);

      const x = startX + col * stepX;
      const y = 11.2 + row * rowSpacing;
      const z = chuteDepth;

      ball.position.set(x, y, z);
      ball.rotation.set(0, 0, 0);
      ball.visible = true;

      if (ballStates[index]) {
        ballStates[index].velocity.set(0, 0, 0);
        ballStates[index].isDropping = false;
        ballStates[index].dropDelay = 0;
      }
    }
  }

  private triggerBallDrop(ballStates: AgitationBallState[]): void {
    const numChutes = 8;
    ballStates.forEach((ballState, index) => {
      const col = index % numChutes;
      const row = Math.floor(index / numChutes);
      const delay = row * 0.22 + (col % 2 === 0 ? 0.03 : 0.08) + Math.random() * 0.04;
      ballState.isDropping = true;
      ballState.dropDelay = delay;
      ballState.velocity.set(0, -18.0, 0);
    });
  }

  private buildDrumPivot(hollow: SolidEntity): void {
    const pivot = new THREE.Group();
    pivot.name = 'sphere-rotation-pivot';
    pivot.position.copy(this.rotationCenter);

    const sphereAssembly = new THREE.Group();
    sphereAssembly.name = 'rotating-sphere-assembly';
    const bounds = new THREE.Box3();
    hollow.meshes.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
      bounds.expandByObject(mesh);
    });
    const meshCenter = bounds.getCenter(new THREE.Vector3());
    pivot.add(sphereAssembly);
    hollow.meshes.forEach((mesh) => sphereAssembly.attach(mesh));
    sphereAssembly.position.copy(this.rotationCenter).sub(meshCenter);
    this.machineRoot.add(pivot);
    this.drumGroup = pivot;
    this.buildMainRotationShaft();
  }

  private buildMainRotationShaft(): void {
    const shaftAssembly = new THREE.Group();
    shaftAssembly.name = 'central-rotation-shaft';
    shaftAssembly.position.copy(this.rotationCenter);

    const shaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x9098a2,
      metalness: 0.95,
      roughness: 0.25,
      envMap: this.backgroundTexture ?? null,
      envMapIntensity: 1.0,
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 15.0, 24), shaftMaterial);
    shaft.rotation.z = Math.PI / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    shaftAssembly.add(shaft);

    this.machineRoot.add(shaftAssembly);
    this.mainRotationShaftGroup = shaftAssembly;
  }

  private buildAgitationBalls(): void {
    if (!this.ballGroup || !this.config) {
      return;
    }

    this.agitationBalls.forEach((ball) => {
      this.ballGroup?.remove(ball);
      ball.geometry.dispose();
      if (ball.material instanceof THREE.Material) {
        ball.material.dispose();
      }
    });
    this.agitationBalls = [];
    this.agitationBallStates = [];
    this.scene.updateMatrixWorld(true);

    const total = 24;
    for (let index = 0; index < total; index++) {
      const ballRadius = 0.92;
      const ball = this.createNumberedBallMesh(index + 1, this.config, ballRadius);
      ball.name = `agitation-ball-${index}`;
      ball.userData['ballNumber'] = index + 1;
      ball.castShadow = true;
      ball.receiveShadow = true;
      ball.renderOrder = 3;

      this.ballGroup.add(ball);
      this.agitationBalls.push(ball);

      this.agitationBallStates.push({
        mesh: ball,
        velocity: new THREE.Vector3(0, 0, 0),
        phase: index * 0.71,
        radius: ballRadius,
        isDropping: false,
        dropDelay: 0,
      });
    }
  }

  private applyAgitationBallAppearance(balls: THREE.Mesh[], config: BiomboConfig): void {
    balls.forEach((ball, index) => {
      const value = Number(ball.userData['ballNumber']) || index + 1;
      ball.material = this.createNumberedBallMaterial(value, config);
    });
  }

  private createNumberedBallMesh(value: number, config: BiomboConfig, radius: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    return new THREE.Mesh(geometry, this.createNumberedBallMaterial(value, config));
  }

  private createNumberedBallMaterial(value: number, config: BiomboConfig): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      map: this.createBallNumberTexture(value, config),
      roughness: 0.10,
      metalness: 0.05,
      clearcoatRoughness: 0.03,
      reflectivity: 0.9,
      envMap: this.backgroundTexture,
      envMapIntensity: 0.75,
    });
  }

  // ⭐ ROTACIÓN HACIA LA IZQUIERDA (-spinSpeed) PARA SINCRONIZAR CON LA FÍSICA
  private stepRigMechanics(
    state: BiomboState,
    drumGroup: THREE.Group | undefined,
    shaftGroup: THREE.Group | undefined,
    mechanismGroup: THREE.Group | undefined,
    stateRef: { mainRotationAngle: number; mechanismBias: number },
  ): number {
    const isRoundActive = state === 'SHUFFLING' || state === 'PICKING';
    const isShuffling = state === 'SHUFFLING';

    if (drumGroup) {
      drumGroup.rotation.set(0, 0, 0);
    }
    if (shaftGroup) {
      shaftGroup.rotation.set(0, 0, 0);
    }

    let spinSpeed = 0.014;
    if (isShuffling) {
      spinSpeed = 0.085;
    } else if (isRoundActive) {
      spinSpeed = 0.045;
    }

    // ⭐ Giro hacia la izquierda (-spinSpeed)
    if (mechanismGroup) {
      mechanismGroup.rotation.z -= spinSpeed;
    }

    return isShuffling ? spinSpeed : 0.014;
  }

  // ⭐ FÍSICA DE LAS PELOTAS PRESERVADA AL 100%
  private stepRigBallPhysics(
    state: BiomboState,
    ballGroup: THREE.Group | undefined,
    mechanismGroup: THREE.Group | undefined,
    ballStates: AgitationBallState[],
    spinSpeed: number,
    deltaSeconds: number,
  ): void {
    if (ballStates.length === 0 || state === 'IDLE') {
      return;
    }

    const isShuffling = state === 'SHUFFLING';
    const isPicking = state === 'PICKING';
    const isRoundActive = isShuffling || isPicking;
    const sphereRadius = 9.8;

    const paddleAngle = mechanismGroup ? mechanismGroup.rotation.z : 0;
    const omega = spinSpeed / Math.max(deltaSeconds, 0.001);

    ballStates.forEach((ballState) => {
      const ball = ballState.mesh;
      const velocity = ballState.velocity;

      if (ballState.isDropping) {
        if (ballState.dropDelay && ballState.dropDelay > 0) {
          ballState.dropDelay -= deltaSeconds;
          return;
        }

        velocity.y -= 140.0 * deltaSeconds;
        velocity.x += -ball.position.x * 2.5 * deltaSeconds;
        velocity.z += -ball.position.z * 2.5 * deltaSeconds;
        ball.position.addScaledVector(velocity, deltaSeconds);

        if (ball.position.y < -2.0) {
          ballState.isDropping = false;
        }
        return;
      }

      velocity.y -= (isRoundActive ? 140.0 : 110.0) * deltaSeconds;

      const bx = ball.position.x;
      const by = ball.position.y;
      const bz = ball.position.z;
      const ballDist = Math.sqrt(bx * bx + by * by);

      if (ballDist > 0.8 && ballDist < 9.3 && Math.abs(bz) < 3.8) {
        for (let k = 0; k < 3; k++) {
          const bladeTheta = paddleAngle + k * ((2 * Math.PI) / 3);
          const dRadial = bx * Math.cos(bladeTheta) + by * Math.sin(bladeTheta);

          if (dRadial > 0.8 && dRadial < 9.2) {
            const dPerp = -bx * Math.sin(bladeTheta) + by * Math.cos(bladeTheta);
            const nx = -Math.sin(bladeTheta);
            const ny = Math.cos(bladeTheta);

            const collisionThreshold = ballState.radius + 0.42;

            if (dPerp > -0.4 && dPerp < collisionThreshold) {
              const bladeLinearSpeed = omega * dRadial;
              const bladeVx = nx * bladeLinearSpeed;
              const bladeVy = ny * bladeLinearSpeed;

              const relVx = bladeVx - velocity.x;
              const relVy = bladeVy - velocity.y;
              const impactDot = relVx * nx + relVy * ny;

              if (impactDot > 0) {
                const bounce = isShuffling ? 1.35 : (isPicking ? 1.1 : 0.6);
                const impulse = Math.max(impactDot, isShuffling ? 15.0 : 5.0) * bounce;

                velocity.x += nx * impulse;
                velocity.y += ny * impulse;

                if (dRadial > 5.0 && ball.position.y < -3.0) {
                  const scoopLoft = isShuffling ? 28.0 : 14.0;
                  velocity.y += scoopLoft;
                  velocity.z += (Math.random() - 0.5) * (isShuffling ? 18.0 : 8.0);
                }

                ball.rotation.x += (Math.random() - 0.5) * 3.0;
                ball.rotation.y += (Math.random() - 0.5) * 3.0;
                ball.rotation.z += spinSpeed * 5.0;
              }
            }
          }
        }
      }

      if (ball.position.y < -5.5) {
        velocity.x -= ball.position.x * (isRoundActive ? 12.0 : 25.0) * deltaSeconds;
        velocity.z -= ball.position.z * (isRoundActive ? 12.0 : 25.0) * deltaSeconds;
      }

      const dragFactor = isRoundActive ? 0.990 : 0.95;
      velocity.x *= Math.pow(dragFactor, deltaSeconds * 60);
      velocity.z *= Math.pow(dragFactor, deltaSeconds * 60);
      velocity.y *= Math.pow(dragFactor, deltaSeconds * 60);

      const maxSpeed = isShuffling ? 48.0 : 26.0;
      if (velocity.lengthSq() > maxSpeed * maxSpeed) {
        velocity.setLength(maxSpeed);
      }

      if (!isRoundActive && ball.position.y < -7.0) {
        velocity.multiplyScalar(Math.pow(0.5, deltaSeconds * 60));
        if (velocity.lengthSq() < 0.15) {
          velocity.set(0, 0, 0);
        }
      }

      ball.position.addScaledVector(velocity, deltaSeconds);

      ball.rotation.x += velocity.z * deltaSeconds * 1.2;
      ball.rotation.z -= velocity.x * deltaSeconds * 1.2;
      ball.rotation.y += (velocity.x + velocity.z) * deltaSeconds * 0.3;

      const currentDistance = ball.position.length();
      const maxAllowedDistance = sphereRadius - ballState.radius;

      if (currentDistance > maxAllowedDistance && ball.position.y < 7.5) {
        const normal = ball.position.clone().normalize();
        ball.position.copy(normal.clone().multiplyScalar(maxAllowedDistance));
        const dot = velocity.dot(normal);

        if (dot > 0) {
          const wallBounce = isShuffling ? 0.8 : 0.5;
          velocity.sub(normal.multiplyScalar((1 + wallBounce) * dot));
          velocity.x += (Math.random() - 0.5) * 1.5;
          velocity.z += (Math.random() - 0.5) * 1.5;
        }
      }
    });

    for (let i = 0; i < ballStates.length; i++) {
      for (let j = i + 1; j < ballStates.length; j++) {
        const bi = ballStates[i].mesh.position;
        const bj = ballStates[j].mesh.position;
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const dz = bj.z - bi.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const minDist = ballStates[i].radius + ballStates[j].radius;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.5;

          bi.x -= nx * overlap;
          bi.y -= ny * overlap;
          bi.z -= nz * overlap;

          bj.x += nx * overlap;
          bj.y += ny * overlap;
          bj.z += nz * overlap;

          const relVx = ballStates[i].velocity.x - ballStates[j].velocity.x;
          const relVy = ballStates[i].velocity.y - ballStates[j].velocity.y;
          const relVz = ballStates[i].velocity.z - ballStates[j].velocity.z;
          const normalVel = relVx * nx + relVy * ny + relVz * nz;

          if (normalVel > 0) {
            const restitution = isShuffling ? 0.88 : 0.6;
            const impulse = normalVel * restitution;

            ballStates[i].velocity.x -= nx * impulse;
            ballStates[i].velocity.y -= ny * impulse;
            ballStates[i].velocity.z -= nz * impulse;

            ballStates[j].velocity.x += nx * impulse;
            ballStates[j].velocity.y += ny * impulse;
            ballStates[j].velocity.z += nz * impulse;
          }
        }
      }
    }
  }

  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const deltaSeconds = this.lastAgitationFrame === 0
      ? 1 / 60
      : Math.min((now - this.lastAgitationFrame) / 1000, 1 / 30);
    this.lastAgitationFrame = now;

    const alphaSpeed = this.stepRigMechanics(
      this.state(),
      this.drumGroup,
      this.mainRotationShaftGroup,
      this.mechanismGroup,
      this,
    );
    this.stepRigBallPhysics(
      this.state(),
      this.ballGroup,
      this.mechanismGroup,
      this.agitationBallStates,
      alphaSpeed,
      deltaSeconds,
    );

    if (this.secondaryRig) {
      const secSpeed = this.stepRigMechanics(
        this.secondaryState(),
        this.secondaryRig.drumGroup,
        this.secondaryRig.rotationShaftGroup,
        this.secondaryRig.mechanismGroup,
        this.secondaryRig,
      );
      this.stepRigBallPhysics(
        this.secondaryState(),
        this.secondaryRig.ballGroup,
        this.secondaryRig.mechanismGroup,
        this.secondaryRig.agitationBallStates,
        secSpeed,
        deltaSeconds,
      );
    }

    if (this.tertiaryRig) {
      const terSpeed = this.stepRigMechanics(
        this.tertiaryState(),
        this.tertiaryRig.drumGroup,
        this.tertiaryRig.rotationShaftGroup,
        this.tertiaryRig.mechanismGroup,
        this.tertiaryRig,
      );
      this.stepRigBallPhysics(
        this.tertiaryState(),
        this.tertiaryRig.ballGroup,
        this.tertiaryRig.mechanismGroup,
        this.tertiaryRig.agitationBallStates,
        terSpeed,
        deltaSeconds,
      );
    }

    if (this.quaternaryRig) {
      const quatSpeed = this.stepRigMechanics(
        this.quaternaryState(),
        this.quaternaryRig.drumGroup,
        this.quaternaryRig.rotationShaftGroup,
        this.quaternaryRig.mechanismGroup,
        this.quaternaryRig,
      );
      this.stepRigBallPhysics(
        this.quaternaryState(),
        this.quaternaryRig.ballGroup,
        this.quaternaryRig.mechanismGroup,
        this.quaternaryRig.agitationBallStates,
        quatSpeed,
        deltaSeconds,
      );
    }

    for (let index = 0; index < this.ballEffects.length; index++) {
      const anim = this.ballEffects[index];
      const elapsed = (now - anim.startAt) / 1000;
      const progress = Math.min(elapsed / anim.duration, 1);

      if (!anim.hasSettled) {
        const easedT = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentPos = anim.curve.getPointAt(easedT);
        anim.mesh.position.copy(currentPos);

        if (progress < 0.65) {
          const rollSpeed = (1 - progress * 0.4) * 0.45;
          anim.mesh.rotation.z -= rollSpeed;
          anim.mesh.rotation.y += rollSpeed * 0.12;
          anim.mesh.rotation.x = -0.22 * progress;
        } else {
          if (anim.startRotZ === undefined || anim.targetRotZ === undefined) {
            anim.startRotZ = anim.mesh.rotation.z;
            anim.startRotY = anim.mesh.rotation.y;
            anim.startRotX = anim.mesh.rotation.x;

            const currentZ = anim.mesh.rotation.z;
            let targetZ = Math.floor(currentZ / (Math.PI * 2)) * (Math.PI * 2);

            if (currentZ - targetZ < Math.PI * 0.9) {
              targetZ -= Math.PI * 2;
            }

            const rampInclineAngleZ = -0.072;
            anim.targetRotZ = targetZ + rampInclineAngleZ;
          }

          const blend = (progress - 0.65) / 0.35;
          const smoothBlend = blend * blend * (3 - 2 * blend);

          const startZ = anim.startRotZ ?? 0;
          const targetZ = anim.targetRotZ ?? 0;
          const startY = anim.startRotY ?? 0;
          const startX = anim.startRotX ?? 0;

          anim.mesh.rotation.z = THREE.MathUtils.lerp(startZ, targetZ, smoothBlend);
          anim.mesh.rotation.y = THREE.MathUtils.lerp(startY, -Math.PI / 2, smoothBlend);
          anim.mesh.rotation.x = THREE.MathUtils.lerp(startX, -0.22, smoothBlend);
        }

        if (progress >= 1) {
          anim.hasSettled = true;
          anim.mesh.position.copy(anim.targetSlotPos);
          anim.mesh.rotation.set(-0.22, -Math.PI / 2, anim.targetRotZ || 0);
          anim.onSettled();
        }
      }
    }

    let targetCamPos: THREE.Vector3;
    let targetCamLook: THREE.Vector3;

    if (this.activeExtractingRoot) {
      const root = this.activeExtractingRoot;
      const scale = Math.max(root.scale.x, 0.01);
      const posX = root.position.x;
      const posY = root.position.y;
      const posZ = root.position.z;

      if (this.cameraSequence === 'draw') {
        targetCamPos = new THREE.Vector3(
          posX + 13.5 * scale,
          posY - 5.5 * scale,
          posZ + 38 * scale,
        );
        targetCamLook = new THREE.Vector3(
          posX + 9 * scale,
          posY - 10 * scale,
          posZ,
        );
      } else {
        targetCamPos = new THREE.Vector3(
          posX + 3 * scale,
          posY + 2 * scale,
          posZ + 52 * scale,
        );
        targetCamLook = new THREE.Vector3(
          posX,
          posY - 1 * scale,
          posZ,
        );
      }
    } else {
      targetCamPos = this.baseCameraPosition;
      targetCamLook = this.baseCameraTarget;
    }

    const camSmooth = 1 - Math.exp(-deltaSeconds * 3.2);
    this.camera.position.lerp(targetCamPos, camSmooth);
    this.currentCameraTarget.lerp(targetCamLook, camSmooth);
    this.camera.lookAt(this.currentCameraTarget);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public canStartRound(): boolean {
    const states = [
      this.state(),
      ...(this.secondaryRig ? [this.secondaryState()] : []),
      ...(this.tertiaryRig ? [this.tertiaryState()] : []),
      ...(this.quaternaryRig ? [this.quaternaryState()] : []),
    ];
    return states.every((state) => state === 'IDLE' || state === 'FINISHED');
  }

  public isRoundFinished(): boolean {
    return this.state() === 'FINISHED'
      && (!this.secondaryRig || this.secondaryState() === 'FINISHED')
      && (!this.tertiaryRig || this.tertiaryState() === 'FINISHED')
      && (!this.quaternaryRig || this.quaternaryState() === 'FINISHED');
  }

  private getRigBallStates(machineRoot: THREE.Group): AgitationBallState[] {
    if (machineRoot === this.machineRoot) return this.agitationBallStates;
    if (this.secondaryRig && machineRoot === this.secondaryRig.root) return this.secondaryRig.agitationBallStates;
    if (this.tertiaryRig && machineRoot === this.tertiaryRig.root) return this.tertiaryRig.agitationBallStates;
    if (this.quaternaryRig && machineRoot === this.quaternaryRig.root) return this.quaternaryRig.agitationBallStates;
    return this.agitationBallStates;
  }

  public play(): void {
    if (!this.config || !this.isReady() || !this.canStartRound()) {
      return;
    }

    this.clearTimers();
    this.clearSecondaryTimers();
    this.clearTertiaryTimers();
    this.clearQuaternaryTimers();
    this.clearBallEffects();
    this.extractedBalls.set([]);
    this.secondaryExtractedBalls.set([]);
    this.tertiaryExtractedBalls.set([]);
    this.quaternaryExtractedBalls.set([]);

    interface BiomboStep {
      config: BiomboConfig;
      setState: (s: BiomboState) => void;
      getExtracted: () => number[];
      setExtracted: (b: number[]) => void;
      root: THREE.Group;
      agitationBalls: THREE.Mesh[];
      timers: number[];
    }

    const steps: BiomboStep[] = [
      {
        config: this.config,
        setState: (s) => this.state.set(s),
        getExtracted: () => this.extractedBalls(),
        setExtracted: (b) => this.extractedBalls.set(b),
        root: this.machineRoot,
        agitationBalls: this.agitationBalls,
        timers: this.drawTimers,
      },
    ];

    if (this.secondaryRig) {
      steps.push({
        config: this.secondaryRig.config,
        setState: (s) => this.secondaryState.set(s),
        getExtracted: () => this.secondaryExtractedBalls(),
        setExtracted: (b) => this.secondaryExtractedBalls.set(b),
        root: this.secondaryRig.root,
        agitationBalls: this.secondaryRig.agitationBalls,
        timers: this.secondaryDrawTimers,
      });
    }

    if (this.tertiaryRig) {
      steps.push({
        config: this.tertiaryRig.config,
        setState: (s) => this.tertiaryState.set(s),
        getExtracted: () => this.tertiaryExtractedBalls(),
        setExtracted: (b) => this.tertiaryExtractedBalls.set(b),
        root: this.tertiaryRig.root,
        agitationBalls: this.tertiaryRig.agitationBalls,
        timers: this.tertiaryDrawTimers,
      });
    }

    if (this.quaternaryRig) {
      steps.push({
        config: this.quaternaryRig.config,
        setState: (s) => this.quaternaryState.set(s),
        getExtracted: () => this.quaternaryExtractedBalls(),
        setExtracted: (b) => this.quaternaryExtractedBalls.set(b),
        root: this.quaternaryRig.root,
        agitationBalls: this.quaternaryRig.agitationBalls,
        timers: this.quaternaryDrawTimers,
      });
    }

    const executeStep = (stepIndex: number) => {
      if (stepIndex >= steps.length) {
        this.activeExtractingRoot = null;
        this.cameraSequence = 'overview';
        return;
      }

      const currentStep = steps[stepIndex];
      this.activeExtractingRoot = currentStep.root;
      this.cameraSequence = 'shuffle';
      currentStep.setState('SHUFFLING');

      this.startRound(
        currentStep.config,
        (s) => {
          currentStep.setState(s);
          if (s === 'PICKING') {
            this.activeExtractingRoot = currentStep.root;
            this.cameraSequence = 'draw';
          }
        },
        currentStep.getExtracted,
        currentStep.setExtracted,
        currentStep.root,
        currentStep.agitationBalls,
        currentStep.timers,
        () => {
          const pauseTimer = window.setTimeout(() => {
            this.activeExtractingRoot = null;
            this.cameraSequence = 'overview';
            executeStep(stepIndex + 1);
          }, 900);
          currentStep.timers.push(pauseTimer);
        },
      );
    };

    executeStep(0);
  }

  private startRound(
    config: BiomboConfig,
    setState: (state: BiomboState) => void,
    getExtractedBalls: () => number[],
    setExtractedBalls: (balls: number[]) => void,
    machineRoot: THREE.Group,
    agitationBalls: THREE.Mesh[],
    timers: number[],
    onFinished?: () => void,
  ): void {
    const drawSequence = generateBiomboResults(config);

    const rigStates = this.getRigBallStates(machineRoot);
    this.triggerBallDrop(rigStates);

    const shuffleTimer = window.setTimeout(() => {
      setState('PICKING');

      drawSequence.forEach((ballNumber, index) => {
        const timer = window.setTimeout(() => {
          this.spawnBallExitThroughBottom(
            ballNumber,
            index,
            config,
            machineRoot,
            agitationBalls,
            () => {
              this.ngZone.run(() => {
                const current = [...getExtractedBalls()];
                current.push(ballNumber);
                setExtractedBalls(current);
              });
            },
          );

          if (index === drawSequence.length - 1) {
            const finishTimer = window.setTimeout(() => {
              setState('FINISHED');
              onFinished?.();
            }, 2200);
            timers.push(finishTimer);
          }
        }, index * 2400);

        timers.push(timer);
      });
    }, this.shuffleDurationMs);

    timers.push(shuffleTimer);
  }

  private spawnBallExitThroughBottom(
    ballNumber: number,
    index: number,
    config: BiomboConfig,
    machineRoot: THREE.Group,
    agitationBalls: THREE.Mesh[],
    onSettled: () => void,
  ): void {
    const ballRadius = 0.95;
    const mesh = this.createNumberedBallMesh(ballNumber, config, ballRadius);
    mesh.userData['isDrawnBall'] = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const endOfTrackX = 19;
    const endOfTrackY = -12.40;
    const endOfTrackZ = 0.90;
    const ballSpacing = 2.15;

    const rampSlopeY = 0.072;
    const rampSlopeZ = 0.015;

    const targetSlotX = endOfTrackX - (index * ballSpacing);
    const deltaX = endOfTrackX - targetSlotX;

    const targetSlotY = endOfTrackY + (deltaX * rampSlopeY);
    const targetSlotZ = endOfTrackZ - (deltaX * rampSlopeZ);
    const targetSlotPos = new THREE.Vector3(targetSlotX, targetSlotY, targetSlotZ);

    const pStart = new THREE.Vector3(0, -8.2, 0.2);
    const pDrop = new THREE.Vector3(0.1, -9.8, 0.60);

    const rampEntryX = 0.4;
    const pRampEntry = new THREE.Vector3(
      rampEntryX,
      endOfTrackY + (endOfTrackX - rampEntryX) * rampSlopeY,
      endOfTrackZ - (endOfTrackX - rampEntryX) * rampSlopeZ,
    );

    const midX = Math.max(0.7, targetSlotX * 0.5);
    const pRampMid = new THREE.Vector3(
      midX,
      endOfTrackY + (endOfTrackX - midX) * rampSlopeY,
      endOfTrackZ - (endOfTrackX - midX) * rampSlopeZ,
    );

    const curve = new THREE.CatmullRomCurve3([
      pStart,
      pDrop,
      pRampEntry,
      pRampMid,
      targetSlotPos,
    ]);

    mesh.position.copy(pStart);
    machineRoot.add(mesh);

    if (agitationBalls[index]) {
      agitationBalls[index].visible = false;
    }

    this.ballEffects.push({
      mesh,
      startAt: performance.now(),
      duration: 1.85,
      curve,
      targetSlotPos,
      ballNumber,
      hasSettled: false,
      onSettled,
    });
  }

  private createBallNumberTexture(value: number, config: BiomboConfig): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    const isYellow = config.ballType === 'yellow';
    const baseColor = isYellow ? '#ffd200' : this.agitationPalette[(value - 1) % this.agitationPalette.length];

    ctx.fillStyle = typeof baseColor === 'number' ? `#${baseColor.toString(16).padStart(6, '0')}` : baseColor;
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.arc(512, 512, 332, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(512, 512, 320, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0a0c10';
    ctx.font = 'bold 360px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 512, 535);

    if (value === 6 || value === 9 || value === 66 || value === 99 || value === 69 || value === 96) {
      ctx.fillRect(390, 735, 244, 32);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer ? this.renderer.capabilities.getMaxAnisotropy() : 16;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  public resize(width: number, height: number): void {
    if (this.renderer && this.camera && height > 0) {
      this.camera.aspect = width / height;
      this.updateSceneLayout(width, height);
      this.renderer.setSize(width, height);
    }
  }

  public destroy(): void {
    this.clearTimers();
    this.clearSecondaryTimers();
    this.clearTertiaryTimers();
    this.clearQuaternaryTimers();
    this.clearBallEffects();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.backdropRoot) {
      this.scene?.remove(this.backdropRoot);
      this.backdropRoot.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else if (object.material) {
          object.material.dispose();
        }
      });
      this.backdropRoot = undefined;
    }
    if (this.stagePodium) {
      this.scene?.remove(this.stagePodium);
      this.stagePodium.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else if (object.material) {
            object.material.dispose();
          }
        }
      });
      this.stagePodium = undefined;
    }
    this.renderer?.dispose();
    this.backgroundTexture?.dispose();
    this.backgroundTexture = undefined;
  }

  private clearTimers(): void {
    this.drawTimers.forEach((timer) => window.clearTimeout(timer));
    this.drawTimers = [];
  }

  private clearSecondaryTimers(): void {
    this.secondaryDrawTimers.forEach((timer) => window.clearTimeout(timer));
    this.secondaryDrawTimers = [];
    if (this.secondaryRig) {
      this.secondaryRig.drawTimers = this.secondaryDrawTimers;
    }
  }

  private clearTertiaryTimers(): void {
    this.tertiaryDrawTimers.forEach((timer) => window.clearTimeout(timer));
    this.tertiaryDrawTimers = [];
    if (this.tertiaryRig) {
      this.tertiaryRig.drawTimers = this.tertiaryDrawTimers;
    }
  }

  private clearQuaternaryTimers(): void {
    this.quaternaryDrawTimers.forEach((timer) => window.clearTimeout(timer));
    this.quaternaryDrawTimers = [];
    if (this.quaternaryRig) {
      this.quaternaryRig.drawTimers = this.quaternaryDrawTimers;
    }
  }

  private clearBallEffects(machineRoot?: THREE.Group): void {
    const remainingEffects: BallExitAnimation[] = [];
    for (const animation of this.ballEffects) {
      if (machineRoot && animation.mesh.parent !== machineRoot) {
        remainingEffects.push(animation);
        continue;
      }
      animation.mesh.parent?.remove(animation.mesh);
      animation.mesh.geometry?.dispose();
      if (Array.isArray(animation.mesh.material)) {
        animation.mesh.material.forEach((mat) => mat.dispose());
      } else {
        animation.mesh.material?.dispose();
      }
    }
    this.ballEffects = remainingEffects;

    this.stageBallsInChutes(this.machineRoot, this.agitationBalls, this.agitationBallStates, this.ballGroup);
    if (this.secondaryRig) {
      this.stageBallsInChutes(
        this.secondaryRig.root,
        this.secondaryRig.agitationBalls,
        this.secondaryRig.agitationBallStates,
        this.secondaryRig.ballGroup,
      );
    }
    if (this.tertiaryRig) {
      this.stageBallsInChutes(
        this.tertiaryRig.root,
        this.tertiaryRig.agitationBalls,
        this.tertiaryRig.agitationBallStates,
        this.tertiaryRig.ballGroup,
      );
    }
    if (this.quaternaryRig) {
      this.stageBallsInChutes(
        this.quaternaryRig.root,
        this.quaternaryRig.agitationBalls,
        this.quaternaryRig.agitationBallStates,
        this.quaternaryRig.ballGroup,
      );
    }
  }

  private onZoom(event: { scale: number }): void {
    const zoomFactor = event.scale;
    const currentFov = this.camera.fov;
    const newFov = Math.max(45, Math.min(90, currentFov * zoomFactor * 1.2));
    this.camera.fov = newFov;
    this.camera.updateProjectionMatrix();
  }
}