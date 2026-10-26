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
};

type SecondaryBiomboRig = {
  config: BiomboConfig;
  root: THREE.Group;
  drumGroup: THREE.Group;
  rotationShaftGroup: THREE.Group;
  mechanismGroup: THREE.Group;
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
  private mainRotationAngle = 0;
  private mechanismBias = 0;
  private agitationBalls: THREE.Mesh[] = [];
  private agitationBallStates: AgitationBallState[] = [];
  private readonly lotteryTableTemplates = new Map<string, THREE.Object3D>();
  private lastAgitationFrame = 0;
  private readonly shuffleDurationMs = 8000;
  private readonly rotationCenter = new THREE.Vector3(0, 0, 0);

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
    this.clearBallEffects();

    try {
      const rapier = await (this.rapierLoader as any).getRapier?.() ?? await (this.rapierLoader as any).load?.();

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      this.scene = new THREE.Scene();
      this.backgroundTexture = await this.loadBackgroundTexture(this.backgrounds[0].folder);
      this.scene.background = this.backgroundTexture;
      this.scene.environment = this.backgroundTexture;
      this.machineRoot = new THREE.Group();
      this.machineRoot.name = 'biombo-machine-alpha';
      this.scene.add(this.machineRoot);

      const aspect = width / height;
      this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
      this.camera.position.set(0, 0, 48);
      this.camera.lookAt(0, 0, 0);

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

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.9);
      mainLight.position.set(15, 30, 25);
      mainLight.castShadow = true;
      this.scene.add(mainLight);

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
      });

      const darkChassisMaterial = new THREE.MeshStandardMaterial({
        color: 0x15181f,
        metalness: 0.85,
        roughness: 0.35,
      });

      const chromeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.95,
        roughness: 0.1,
      });

      const neonRingMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 3.5,
        roughness: 0.2,
      });

      const rampMaterial = new THREE.MeshStandardMaterial({
        color: 0x111317,
        metalness: 0.75,
        roughness: 0.35,
      });

      const [hollow, ornaments, ramp, lotteryModel] = await Promise.all([
        new SolidEntity(rapier, glassMaterial).load('/assets/hollow_sphere.fbx'),
        new SolidEntity(rapier).load('/assets/ornaments.fbx'),
        new SolidEntity(rapier, rampMaterial).load('/assets/ramp.fbx'),
        new GLTFLoader().loadAsync('/assets/loteria.glb'),
      ]);

      this.solids['hollow'] = hollow;
      this.solids['ornaments'] = ornaments;
      this.solids['ramp'] = ramp;

      hollow.center(0);
      this.buildDrumPivot(hollow);

      if (ornaments['tube']) (ornaments['tube'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['base']) (ornaments['base'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['support']) (ornaments['support'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['ring_outer']) (ornaments['ring_outer'] as THREE.Mesh).material = chromeMaterial;
      if (ornaments['ring_inner']) (ornaments['ring_inner'] as THREE.Mesh).material = neonRingMaterial;

      if (ornaments['glass_hole']) {
        (ornaments['glass_hole'] as THREE.Mesh).material = glassMaterial;
        (ornaments['glass_hole'] as THREE.Mesh).visible = false;
      }

      if (ornaments['table']) {
        ornaments['table'].visible = false;
      }

      ornaments.meshes.forEach((mesh) => this.machineRoot.add(mesh));
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
        ]).get(normalizedName);
        if (tablePartName && !this.lotteryTableTemplates.has(tablePartName)) {
          this.lotteryTableTemplates.set(tablePartName, object);
        }
      });

      this.machineRoot.add(this.createLotteryTable(0xf4f4f0));

      this.buildInternalMechanism();
      this.arrangeBallsNaturally();
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
    this.setLotteryTableColor(root, 0x17191f);
    const drawnBalls: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.userData['isDrawnBall']) {
        drawnBalls.push(object);
      }
    });
    drawnBalls.forEach((ball) => ball.parent?.remove(ball));

    const drumGroup = root.getObjectByName('sphere-rotation-pivot');
    const rotationShaftGroup = root.getObjectByName('central-rotation-shaft');
    const mechanismGroup = root.getObjectByName('internal-mechanism');
    if (!(drumGroup instanceof THREE.Group)
      || !(rotationShaftGroup instanceof THREE.Group)
      || !(mechanismGroup instanceof THREE.Group)) {
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

    this.secondaryRig = {
      config,
      root,
      drumGroup,
      rotationShaftGroup,
      mechanismGroup,
      agitationBalls,
      agitationBallStates: agitationBalls.map((mesh, index) => ({
        mesh,
        velocity: new THREE.Vector3(),
        phase: this.agitationBallStates[index]?.phase ?? index * 0.71,
        radius: this.agitationBallStates[index]?.radius ?? 0.92,
      })),
      drawTimers: this.secondaryDrawTimers,
      mainRotationAngle: this.mainRotationAngle,
      mechanismBias: this.mechanismBias,
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
        this.tertiaryRig = undefined;
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
    this.setLotteryTableColor(root, 0xc62828);
    const drawnBalls: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.userData['isDrawnBall']) {
        drawnBalls.push(object);
      }
    });
    drawnBalls.forEach((ball) => ball.parent?.remove(ball));

    const drumGroup = root.getObjectByName('sphere-rotation-pivot');
    const rotationShaftGroup = root.getObjectByName('central-rotation-shaft');
    const mechanismGroup = root.getObjectByName('internal-mechanism');
    if (!(drumGroup instanceof THREE.Group)
      || !(rotationShaftGroup instanceof THREE.Group)
      || !(mechanismGroup instanceof THREE.Group)) {
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

    this.tertiaryRig = {
      config,
      root,
      drumGroup,
      rotationShaftGroup,
      mechanismGroup,
      agitationBalls,
      agitationBallStates: agitationBalls.map((mesh, index) => ({
        mesh,
        velocity: new THREE.Vector3(),
        phase: this.agitationBallStates[index]?.phase ?? index * 0.71,
        radius: this.agitationBallStates[index]?.radius ?? 0.92,
      })),
      drawTimers: this.tertiaryDrawTimers,
      mainRotationAngle: this.mainRotationAngle,
      mechanismBias: this.mechanismBias,
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
    this.setLotteryTableColor(root, 0x1565c0);
    const drawnBalls: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.userData['isDrawnBall']) {
        drawnBalls.push(object);
      }
    });
    drawnBalls.forEach((ball) => ball.parent?.remove(ball));

    const drumGroup = root.getObjectByName('sphere-rotation-pivot');
    const rotationShaftGroup = root.getObjectByName('central-rotation-shaft');
    const mechanismGroup = root.getObjectByName('internal-mechanism');
    if (!(drumGroup instanceof THREE.Group)
      || !(rotationShaftGroup instanceof THREE.Group)
      || !(mechanismGroup instanceof THREE.Group)) {
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

    this.quaternaryRig = {
      config,
      root,
      drumGroup,
      rotationShaftGroup,
      mechanismGroup,
      agitationBalls,
      agitationBallStates: agitationBalls.map((mesh, index) => ({
        mesh,
        velocity: new THREE.Vector3(),
        phase: this.agitationBallStates[index]?.phase ?? index * 0.71,
        radius: this.agitationBallStates[index]?.radius ?? 0.92,
      })),
      drawTimers: this.quaternaryDrawTimers,
      mainRotationAngle: this.mainRotationAngle,
      mechanismBias: this.mechanismBias,
    };
    this.scene.add(root);
    this.quaternaryState.set('IDLE');
    this.quaternaryExtractedBalls.set([]);
  }

  private createLotteryTable(color: number): THREE.Group {
    const table = new THREE.Group();
    table.name = 'biombo-table-asset';
    const scale = 0.92 / 0.079;
    table.rotation.y = Math.PI / 2;
    table.scale.setScalar(scale);

    for (const name of ['Base', 'Back Wall', 'Back Panel']) {
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
        object.material = Array.isArray(object.material)
          ? object.material.map((mat) => mat.clone())
          : object.material.clone();
        object.castShadow = true;
        object.receiveShadow = true;
      });
      table.add(part);
    }


    const offsetX = 0.0;
    const offsetY = 0.0;
    const offsetZ = -10.8;

    table.updateMatrixWorld(true);
    const circleRef = table.getObjectByName('Circle005')
      || table.getObjectByName('Circle005_1')
      || table.getObjectByName('Back Panel');

    if (circleRef) {
      const bounds = new THREE.Box3().setFromObject(circleRef);
      const center = bounds.getCenter(new THREE.Vector3());
      table.position.x = -center.x + offsetX;
      table.position.y = -center.y + offsetY;
      table.position.z = offsetZ - center.z;
    } else {
      table.position.set(offsetX, -15.8 + offsetY, offsetZ);
    }

    this.setLotteryTableColor(table, color);
    return table;
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
      object.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) {
          return;
        }
        const applyColor = (material: THREE.Material): THREE.Material => {
          const coloredMaterial = material.clone();
          if ('color' in coloredMaterial && coloredMaterial.color instanceof THREE.Color) {
            coloredMaterial.color.setHex(color);
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

    if (this.quaternaryRig) {
      const portrait = width < height;
      const scale = portrait ? 0.26 : 0.3;
      const horizontalSeparation = portrait ? 8 : 10;
      const frontHorizontalSeparation = portrait ? 10 : 14;
      const verticalSeparation = portrait ? 10 : 7;
      const depthSeparation = portrait ? 9 : 12;
      this.machineRoot.scale.setScalar(scale);
      this.machineRoot.position.set(-horizontalSeparation, verticalSeparation, -depthSeparation);
      this.secondaryRig?.root.scale.setScalar(scale);
      this.secondaryRig?.root.position.set(horizontalSeparation, verticalSeparation, -depthSeparation);
      this.tertiaryRig?.root.scale.setScalar(scale);
      this.tertiaryRig?.root.position.set(-frontHorizontalSeparation, -verticalSeparation, depthSeparation);
      this.quaternaryRig.root.scale.setScalar(scale);
      this.quaternaryRig.root.position.set(frontHorizontalSeparation, -verticalSeparation, depthSeparation);
      this.camera.position.set(0, 0, portrait ? 76 : 68);
    } else if (this.tertiaryRig) {
      const portrait = width < height;
      const scale = portrait ? 0.34 : 0.42;
      const separation = portrait ? 15.5 : 17.5;
      this.machineRoot.scale.setScalar(scale);
      this.machineRoot.position.set(portrait ? 0 : -separation, portrait ? separation : 0, 0);
      this.secondaryRig?.root.scale.setScalar(scale);
      this.secondaryRig?.root.position.set(0, 0, 0);
      this.tertiaryRig.root.scale.setScalar(scale);
      this.tertiaryRig.root.position.set(portrait ? 0 : separation, portrait ? -separation : 0, 0);
      this.camera.position.set(0, 0, portrait ? 70 : 64);
    } else if (this.secondaryRig) {
      const portrait = width < height;
      const scale = portrait ? 0.42 : 0.58;

      // Calibración de posición independiente en modo dual
      const biombo1_X = portrait ? 0 : -13.5;
      const biombo1_Y = portrait ? 12.0 : 0.0;

      const biombo2_X = portrait ? 0 : 13.5;
      const biombo2_Y = portrait ? -12.0 : 0.0;

      this.machineRoot.scale.setScalar(scale);
      this.machineRoot.position.set(biombo1_X, biombo1_Y, 0);

      this.secondaryRig.root.scale.setScalar(scale);
      this.secondaryRig.root.position.set(biombo2_X, biombo2_Y, 0);

      this.camera.position.set(0, 0, portrait ? 67 : 61);
    } else {
      this.machineRoot.scale.setScalar(1);
      this.machineRoot.position.set(0, 0, 0);
      this.camera.position.set(0, 0, 110.88);
    }

    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private arrangeBallsNaturally(): void {
    if (!this.agitationBalls || this.agitationBalls.length === 0) return;

    const totalBalls = this.agitationBalls.length;
    const ballRadius = this.agitationBallStates[0]?.radius || 0.95;
    const minDist = ballRadius * 2.05;

    let bowlCenterY = -8.5;
    if (this.solids['hollow']?.mesh) {
      const box = new THREE.Box3().setFromObject(this.solids['hollow'].mesh);
      bowlCenterY = box.min.y + ballRadius + 0.45;
    }

    const bowlCurvature = 0.052;
    const positions: THREE.Vector3[] = [];
    let currentLayer = 0;
    let ballsInCurrentLayer = 0;
    let maxInLayer = 1;

    for (let i = 0; i < totalBalls; i++) {
      if (ballsInCurrentLayer >= maxInLayer) {
        currentLayer++;
        ballsInCurrentLayer = 0;
        maxInLayer = Math.min(6 * currentLayer, 18);
      }

      let pos: THREE.Vector3;
      if (currentLayer === 0) {
        pos = new THREE.Vector3(0, bowlCenterY, 0);
      } else {
        const angle = (ballsInCurrentLayer / maxInLayer) * Math.PI * 2 + (currentLayer * 0.55);
        const radiusDist = currentLayer * (minDist * 0.9);
        const x = Math.cos(angle) * radiusDist;
        const z = Math.sin(angle) * radiusDist;
        const y = bowlCenterY + (radiusDist * radiusDist * bowlCurvature) + (currentLayer * 0.32);
        pos = new THREE.Vector3(x, y, z);
      }

      positions.push(pos);
      ballsInCurrentLayer++;
    }

    for (let iter = 0; iter < 25; iter++) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const delta = new THREE.Vector3().subVectors(positions[i], positions[j]);
          const dist = delta.length();

          if (dist < minDist && dist > 0.0001) {
            const overlap = (minDist - dist) * 0.5;
            delta.normalize().multiplyScalar(overlap);
            positions[i].add(delta);
            positions[j].sub(delta);
          }
        }

        const distFromCenter = Math.sqrt(positions[i].x ** 2 + positions[i].z ** 2);
        const floorY = bowlCenterY + (distFromCenter * distFromCenter * bowlCurvature);
        if (positions[i].y < floorY) {
          positions[i].y = floorY;
        }
      }
    }

    for (let index = 0; index < totalBalls; index++) {
      const ball = this.agitationBalls[index];
      const worldPos = positions[index].clone();

      if (this.ballGroup) {
        this.ballGroup.worldToLocal(worldPos);
      }
      ball.position.copy(worldPos);

      if (this.agitationBallStates[index]) {
        this.agitationBallStates[index].velocity.set(0, 0, 0);
      }
    }
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
      color: 0xb7c0c8,
      metalness: 0.96,
      roughness: 0.2,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x69737d,
      metalness: 0.9,
      roughness: 0.32,
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 15.4, 24), shaftMaterial);
    shaft.rotation.z = Math.PI / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    shaftAssembly.add(shaft);

    for (const position of [-5.9, 5.9]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.42, 24), edgeMaterial);
      collar.rotation.z = Math.PI / 2;
      collar.position.x = position;
      collar.castShadow = true;
      shaftAssembly.add(collar);
    }

    const bearingMaterial = new THREE.MeshStandardMaterial({
      color: 0x171a1f,
      metalness: 0.72,
      roughness: 0.78,
    });
    for (const position of [-6.25, 6.25]) {
      const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.8, 24), bearingMaterial);
      bearing.rotation.z = Math.PI / 2;
      bearing.position.set(position, this.rotationCenter.y, this.rotationCenter.z);
      bearing.castShadow = true;
      bearing.receiveShadow = true;
      this.machineRoot.add(bearing);

      const mount = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 1.6), bearingMaterial);
      mount.position.set(position, this.rotationCenter.y + 1.03, 0);
      mount.castShadow = true;
      mount.receiveShadow = true;
      this.machineRoot.add(mount);
    }

    this.machineRoot.add(shaftAssembly);
    this.mainRotationShaftGroup = shaftAssembly;
  }

  private buildInternalMechanism(): void {
    const hollowMesh = this.solids['hollow']?.mesh;
    if (!hollowMesh) {
      return;
    }
    hollowMesh.renderOrder = 10;

    const mechanism = new THREE.Group();
    mechanism.name = 'internal-mechanism';
    mechanism.position.set(0, 0, 0);
    mechanism.renderOrder = 2;

    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8d2df,
      emissive: 0x344b68,
      emissiveIntensity: 0.3,
      metalness: 0.95,
      roughness: 0.2,
    });

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.3, 24), tubeMaterial);
    hub.rotation.z = Math.PI / 2;
    mechanism.add(hub);

    const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 20), tubeMaterial);
    mechanism.add(hubCap);

    for (let index = 0; index < 3; index++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 6.6, 14), tubeMaterial);
      tube.rotation.z = Math.PI / 2;
      tube.rotation.y = (index * Math.PI) / 3;
      tube.rotation.x = index % 2 === 0 ? 0.08 : -0.08;
      mechanism.add(tube);
    }

    const circularTube = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.1, 12, 72),
      tubeMaterial,
    );
    circularTube.rotation.x = Math.PI / 2;
    mechanism.add(circularTube);

    hollowMesh.add(mechanism);
    this.mechanismGroup = mechanism;
    this.buildInternalSupportTripod(hollowMesh);

    const ballGroup = new THREE.Group();
    ballGroup.name = 'internal-ball-group';
    ballGroup.renderOrder = 3;
    hollowMesh.add(ballGroup);
    this.ballGroup = ballGroup;
    this.buildAgitationBalls();
  }

  private buildInternalSupportTripod(hollowMesh: THREE.Mesh): void {
    const tripod = new THREE.Group();
    tripod.renderOrder = 4;

    const supportMaterial = new THREE.MeshStandardMaterial({
      color: 0x20242a,
      metalness: 0.9,
      roughness: 0.42,
    });
    const anchorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      metalness: 0.94,
      roughness: 0.24,
    });
    const center = new THREE.Vector3();
    const shaftCoupler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.25, 24),
      supportMaterial,
    );
    shaftCoupler.rotation.z = Math.PI / 2;
    shaftCoupler.castShadow = true;
    tripod.add(shaftCoupler);

    const anchorRadius = 4.72;
    for (let index = 0; index < 3; index++) {
      const angle = (index * Math.PI * 2) / 3 + Math.PI / 2;
      const endpoint = new THREE.Vector3(
        0,
        Math.cos(angle) * anchorRadius,
        Math.sin(angle) * anchorRadius,
      );
      const direction = endpoint.clone().sub(center);
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.14, direction.length(), 14),
        supportMaterial,
      );
      rod.position.copy(center).add(endpoint).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      rod.castShadow = true;
      rod.receiveShadow = true;
      tripod.add(rod);

      const anchor = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), anchorMaterial);
      anchor.position.copy(endpoint);
      anchor.castShadow = true;
      anchor.receiveShadow = true;
      tripod.add(anchor);
    }

    hollowMesh.add(tripod);
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

  private createNumberedBallMaterial(value: number, config: BiomboConfig): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: this.createBallNumberTexture(value, config),
      roughness: 0.15,
      metalness: 0.1,
    });
  }

  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const deltaSeconds = this.lastAgitationFrame === 0
      ? 1 / 60
      : Math.min((now - this.lastAgitationFrame) / 1000, 1 / 30);
    this.lastAgitationFrame = now;
    const isAgitating = this.state() === 'SHUFFLING';

    const shaftSpeed = isAgitating ? 0.068 : 0;
    this.mainRotationAngle += shaftSpeed;

    if (this.mainRotationShaftGroup) {
      this.mainRotationShaftGroup.rotation.set(this.mainRotationAngle, 0, 0);
    }

    if (this.drumGroup) {
      this.drumGroup.rotation.set(this.mainRotationAngle, 0, 0);
    }

    if (this.mechanismGroup) {
      this.mechanismBias += isAgitating ? 0.03 : 0.005;
      const agitationBoost = isAgitating ? 1 : 0.12;
      this.mechanismGroup.rotation.y += (0.035 + Math.sin(this.mechanismBias * 1.8) * 0.02) * agitationBoost;
      this.mechanismGroup.rotation.x = (Math.sin(this.mechanismBias * 2.4) * 0.6) * agitationBoost;
      this.mechanismGroup.rotation.z = (Math.cos(this.mechanismBias * 2.9) * 0.35) * agitationBoost;
    }

    if (this.agitationBallStates.length > 0 && this.state() !== 'IDLE') {
      const sphereRadius = 9.8;
      const drumQuaternion = new THREE.Quaternion();
      if (this.ballGroup) {
        this.ballGroup.getWorldQuaternion(drumQuaternion);
      }

      const worldGravityDir = new THREE.Vector3(0, -1, 0);
      const localGravityDir = worldGravityDir.clone().applyQuaternion(drumQuaternion.clone().invert());
      const drumAngularVelocityX = shaftSpeed / deltaSeconds;

      this.agitationBallStates.forEach((ballState) => {
        const ball = ballState.mesh;
        const velocity = ballState.velocity;

        if (isAgitating) {
          const currentDistance = ball.position.length();
          const wallProximity = currentDistance / (sphereRadius - ballState.radius);

          if (wallProximity > 0.82) {
            const tangentialVy = -drumAngularVelocityX * ball.position.z * 0.45;
            const tangentialVz = drumAngularVelocityX * ball.position.y * 0.45;
            velocity.y += (tangentialVy - velocity.y) * 4.5 * deltaSeconds;
            velocity.z += (tangentialVz - velocity.z) * 4.5 * deltaSeconds;
          }

          const localY = ball.position.dot(localGravityDir.clone().negate());
          if (localY < -4.8) {
            const loft = Math.random() * 42.0 + 34.0;
            velocity.addScaledVector(localGravityDir.clone().negate(), loft * deltaSeconds * 2.2);

            velocity.x += (Math.random() - 0.5) * 36.0 * deltaSeconds;
            velocity.z += (Math.random() - 0.5) * 36.0 * deltaSeconds;
          }

          velocity.addScaledVector(localGravityDir, 58.0 * deltaSeconds);

          velocity.x *= Math.pow(0.994, deltaSeconds * 60);
          velocity.z *= Math.pow(0.994, deltaSeconds * 60);
          velocity.y *= Math.pow(0.996, deltaSeconds * 60);

          const maxSpeed = 54.0;
          if (velocity.lengthSq() > maxSpeed * maxSpeed) {
            velocity.setLength(maxSpeed);
          }
        } else {
          const localY = ball.position.dot(localGravityDir.clone().negate());
          velocity.addScaledVector(localGravityDir, 105.0 * deltaSeconds);

          velocity.x *= Math.pow(0.96, deltaSeconds * 60);
          velocity.z *= Math.pow(0.96, deltaSeconds * 60);
          velocity.y *= Math.pow(0.97, deltaSeconds * 60);

          if (localY < -6.0) {
            velocity.multiplyScalar(Math.pow(0.65, deltaSeconds * 60));
            if (velocity.lengthSq() < 0.25) {
              velocity.set(0, 0, 0);
            }
          }
        }

        ball.position.addScaledVector(velocity, deltaSeconds);

        ball.rotation.x += velocity.z * deltaSeconds * 1.25;
        ball.rotation.z -= velocity.x * deltaSeconds * 1.25;
        ball.rotation.y += (velocity.x + velocity.z) * deltaSeconds * 0.35;

        const currentDistance = ball.position.length();
        const maxAllowedDistance = sphereRadius - ballState.radius;

        if (currentDistance > maxAllowedDistance) {
          const normal = ball.position.clone().normalize();
          ball.position.copy(normal.clone().multiplyScalar(maxAllowedDistance));
          const dot = velocity.dot(normal);

          if (dot > 0) {
            if (isAgitating) {
              const bounce = 1.82;
              velocity.sub(normal.multiplyScalar(bounce * dot));
              velocity.x += (Math.random() - 0.5) * 5.0;
              velocity.z += (Math.random() - 0.5) * 5.0;
            } else {
              velocity.sub(normal.multiplyScalar(dot));
              velocity.multiplyScalar(0.6);
            }
          }
        }
      });

      const balls = this.agitationBallStates;
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const delta = new THREE.Vector3().subVectors(balls[j].mesh.position, balls[i].mesh.position);
          const distance = delta.length();
          const minDistance = balls[i].radius + balls[j].radius;

          if (distance < minDistance && distance > 0.0001) {
            const normal = delta.clone().normalize();
            const overlap = minDistance - distance;
            const correction = normal.clone().multiplyScalar(overlap * 0.5);

            balls[i].mesh.position.sub(correction);
            balls[j].mesh.position.add(correction);

            if (isAgitating) {
              const relativeVelocity = new THREE.Vector3().subVectors(balls[i].velocity, balls[j].velocity);
              const speedAlongNormal = relativeVelocity.dot(normal);

              if (speedAlongNormal > 0) {
                const impulse = normal.clone().multiplyScalar(speedAlongNormal * 0.92);
                balls[i].velocity.sub(impulse);
                balls[j].velocity.add(impulse);
              }
            }
          }
        }
      }
    }

    this.syncSecondaryAnimation();

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
        }
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private syncSecondaryAnimation(): void {
    if (!this.secondaryRig) {
      return;
    }

    const rig = this.secondaryRig;
    rig.mainRotationAngle = this.mainRotationAngle;
    rig.mechanismBias = this.mechanismBias;
    rig.drumGroup.rotation.copy(this.drumGroup?.rotation ?? rig.drumGroup.rotation);
    rig.rotationShaftGroup.rotation.copy(
      this.mainRotationShaftGroup?.rotation ?? rig.rotationShaftGroup.rotation,
    );
    if (this.mechanismGroup) {
      rig.mechanismGroup.rotation.copy(this.mechanismGroup.rotation);
      rig.mechanismGroup.position.copy(this.mechanismGroup.position);
    }

    this.agitationBalls.forEach((ball, index) => {
      const secondaryBall = rig.agitationBalls[index];
      if (!secondaryBall) {
        return;
      }
      secondaryBall.position.copy(ball.position);
      secondaryBall.quaternion.copy(ball.quaternion);
      secondaryBall.scale.copy(ball.scale);
    });
    this.syncTertiaryAnimation();
  }

  private syncTertiaryAnimation(): void {
    if (!this.tertiaryRig) {
      return;
    }

    const rig = this.tertiaryRig;
    rig.mainRotationAngle = this.mainRotationAngle;
    rig.mechanismBias = this.mechanismBias;
    rig.drumGroup.rotation.copy(this.drumGroup?.rotation ?? rig.drumGroup.rotation);
    rig.rotationShaftGroup.rotation.copy(
      this.mainRotationShaftGroup?.rotation ?? rig.rotationShaftGroup.rotation,
    );
    if (this.mechanismGroup) {
      rig.mechanismGroup.rotation.copy(this.mechanismGroup.rotation);
      rig.mechanismGroup.position.copy(this.mechanismGroup.position);
    }

    this.agitationBalls.forEach((ball, index) => {
      const tertiaryBall = rig.agitationBalls[index];
      if (!tertiaryBall) {
        return;
      }
      tertiaryBall.position.copy(ball.position);
      tertiaryBall.quaternion.copy(ball.quaternion);
      tertiaryBall.scale.copy(ball.scale);
    });
    this.syncQuaternaryAnimation();
  }

  private syncQuaternaryAnimation(): void {
    if (!this.quaternaryRig) {
      return;
    }

    const rig = this.quaternaryRig;
    rig.mainRotationAngle = this.mainRotationAngle;
    rig.mechanismBias = this.mechanismBias;
    rig.drumGroup.rotation.copy(this.drumGroup?.rotation ?? rig.drumGroup.rotation);
    rig.rotationShaftGroup.rotation.copy(
      this.mainRotationShaftGroup?.rotation ?? rig.rotationShaftGroup.rotation,
    );
    if (this.mechanismGroup) {
      rig.mechanismGroup.rotation.copy(this.mechanismGroup.rotation);
      rig.mechanismGroup.position.copy(this.mechanismGroup.position);
    }

    this.agitationBalls.forEach((ball, index) => {
      const quaternaryBall = rig.agitationBalls[index];
      if (!quaternaryBall) {
        return;
      }
      quaternaryBall.position.copy(ball.position);
      quaternaryBall.quaternion.copy(ball.quaternion);
      quaternaryBall.scale.copy(ball.scale);
    });
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
    this.state.set('SHUFFLING');
    this.startRound(
      this.config,
      (state) => this.state.set(state),
      () => this.extractedBalls(),
      (balls) => this.extractedBalls.set(balls),
      this.machineRoot,
      this.agitationBalls,
      this.drawTimers,
    );

    if (this.secondaryRig) {
      this.secondaryExtractedBalls.set([]);
      this.secondaryState.set('SHUFFLING');
      this.startRound(
        this.secondaryRig.config,
        (state) => this.secondaryState.set(state),
        () => this.secondaryExtractedBalls(),
        (balls) => this.secondaryExtractedBalls.set(balls),
        this.secondaryRig.root,
        this.secondaryRig.agitationBalls,
        this.secondaryDrawTimers,
      );
    }

    if (this.tertiaryRig) {
      this.tertiaryExtractedBalls.set([]);
      this.tertiaryState.set('SHUFFLING');
      this.startRound(
        this.tertiaryRig.config,
        (state) => this.tertiaryState.set(state),
        () => this.tertiaryExtractedBalls(),
        (balls) => this.tertiaryExtractedBalls.set(balls),
        this.tertiaryRig.root,
        this.tertiaryRig.agitationBalls,
        this.tertiaryDrawTimers,
      );
    }

    if (this.quaternaryRig) {
      this.quaternaryExtractedBalls.set([]);
      this.quaternaryState.set('SHUFFLING');
      this.startRound(
        this.quaternaryRig.config,
        (state) => this.quaternaryState.set(state),
        () => this.quaternaryExtractedBalls(),
        (balls) => this.quaternaryExtractedBalls.set(balls),
        this.quaternaryRig.root,
        this.quaternaryRig.agitationBalls,
        this.quaternaryDrawTimers,
      );
    }
  }

  private startRound(
    config: BiomboConfig,
    setState: (state: BiomboState) => void,
    getExtractedBalls: () => number[],
    setExtractedBalls: (balls: number[]) => void,
    machineRoot: THREE.Group,
    agitationBalls: THREE.Mesh[],
    timers: number[],
  ): void {
    const drawSequence = generateBiomboResults(config);

    const shuffleTimer = window.setTimeout(() => {
      setState('PICKING');

      drawSequence.forEach((ballNumber, index) => {
        const timer = window.setTimeout(() => {
          const current = [...getExtractedBalls()];
          current.push(ballNumber);
          setExtractedBalls(current);

          this.spawnBallExitThroughBottom(ballNumber, index, config, machineRoot, agitationBalls);

          if (index === drawSequence.length - 1) {
            const finishTimer = window.setTimeout(() => setState('FINISHED'), 2200);
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
    });
  }

  private createBallNumberTexture(value: number, config: BiomboConfig): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    const isYellow = config.ballType === 'yellow';
    const baseColor = isYellow ? '#ffd200' : this.agitationPalette[(value - 1) % this.agitationPalette.length];

    ctx.fillStyle = typeof baseColor === 'number' ? `#${baseColor.toString(16).padStart(6, '0')}` : baseColor;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 80, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f1115';
    ctx.font = 'bold 90px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 128, 134);

    if (value === 6 || value === 9 || value === 66 || value === 99 || value === 69 || value === 96) {
      ctx.fillRect(100, 185, 56, 8);
    }

    const texture = new THREE.CanvasTexture(canvas);
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

    this.agitationBalls.forEach((b) => (b.visible = true));
    this.secondaryRig?.agitationBalls.forEach((b) => (b.visible = true));
    this.tertiaryRig?.agitationBalls.forEach((b) => (b.visible = true));
    this.quaternaryRig?.agitationBalls.forEach((b) => (b.visible = true));
  }
}