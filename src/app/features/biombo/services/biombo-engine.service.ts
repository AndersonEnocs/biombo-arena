import { inject, Injectable, NgZone, signal } from '@angular/core';
import * as THREE from 'three';
import { RapierLoaderService } from '../../../core/services/rapier-loader.service';
import { SolidEntity } from '../models/solid.entity';
import { BiomboConfig, BiomboState, generateBiomboResults } from '../utilities/biombo.interfaces';

type BallExitAnimation = {
  mesh: THREE.Mesh;
  startAt: number;
  duration: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  curve: THREE.CatmullRomCurve3;
  wobble: number;
  spin: THREE.Vector3;
};

type AgitationBallState = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  phase: number;
  radius: number;
};

@Injectable()
export class BiomboEngineService {
  public readonly isReady = signal(false);
  public readonly errorMessage = signal<string | null>(null);
  public readonly extractedBalls = signal<number[]>([]);
  public readonly state = signal<BiomboState>('IDLE');

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animFrameId: number | null = null;
  private solids: { [key: string]: SolidEntity } = {};
  private config: BiomboConfig | null = null;
  private drawTimers: number[] = [];
  private ballEffects: BallExitAnimation[] = [];
  private drumGroup?: THREE.Group;
  private mainRotationShaftGroup?: THREE.Group;
  private mechanismGroup?: THREE.Group;
  private ballGroup?: THREE.Group;
  private mainRotationAngle = 0;
  private mechanismBias = 0;
  private agitationBalls: THREE.Mesh[] = [];
  private agitationBallStates: AgitationBallState[] = [];
  private lastAgitationFrame = 0;
  private readonly shuffleDurationMs = 10000;
  private readonly rotationCenter = new THREE.Vector3(0, 0, 0)

  private readonly agitationPalette = [
    0x6ae8ff,
    0x81f7ff,
    0xf5d76e,
    0xff9ae5,
    0xa8ff9e,
    0x99b5ff,
    0xffb66b,
    0xc8a3ff,
  ];

  private readonly rapierLoader = inject(RapierLoaderService);
  private readonly ngZone = inject(NgZone);

  public async initialize(container: HTMLElement, config: BiomboConfig): Promise<void> {
    this.config = config;
    this.extractedBalls.set([]);
    this.state.set('IDLE');
    this.errorMessage.set(null);
    this.mainRotationAngle = 0;
    this.clearBallEffects();

    try {
      const rapier = await (this.rapierLoader as any).getRapier?.() ?? await (this.rapierLoader as any).load?.();

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0a0c10);

      const skyboxTexture = await new Promise<THREE.CubeTexture>((resolve, reject) => {
        new THREE.CubeTextureLoader()
          .setPath('/assets/skybox/hallway/')
          .load(
            ['posx.png', 'negx.png', 'posy.png', 'negy.png', 'posz.png', 'negz.png'],
            (texture) => resolve(texture),
            undefined,
            (error) => reject(error)
          );
      });
      this.scene.background = skyboxTexture;
      this.scene.environment = skyboxTexture;

      const aspect = width / height;
      this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
      this.camera.position.set(0, 0, 48);
      this.camera.lookAt(0, 0, 0);

      const probeCanvas = document.createElement('canvas');
      const probeContext =
        probeCanvas.getContext('webgl2') ??
        probeCanvas.getContext('webgl') ??
        probeCanvas.getContext('experimental-webgl');

      if (!probeContext) {
        throw new Error('Tu navegador o el entorno actual no soportan WebGL. Activa aceleración por hardware o usa un navegador compatible.');
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
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      container.replaceChildren(this.renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      this.scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
      mainLight.position.set(15, 30, 25);
      mainLight.castShadow = true;
      this.scene.add(mainLight);

      const rimLightLeft = new THREE.PointLight(0x70a0ff, 15, 80);
      rimLightLeft.position.set(-25, 10, 10);
      this.scene.add(rimLightLeft);

      const rimLightRight = new THREE.PointLight(0xffffff, 10, 80);
      rimLightRight.position.set(25, -10, 15);
      this.scene.add(rimLightRight);

      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.05,
        roughness: 0.05,
        transmission: 0.94,
        thickness: 1.0,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
        reflectivity: 0.9,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
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
        emissiveIntensity: 3.0,
        roughness: 0.2,
      });

      const rampMaterial = new THREE.MeshStandardMaterial({
        color: 0x111317,
        metalness: 0.7,
        roughness: 0.4,
      });

      const [hollow, ornaments, ramp] = await Promise.all([
        new SolidEntity(rapier, glassMaterial).load('/assets/hollow_sphere.fbx'),
        new SolidEntity(rapier, darkChassisMaterial).load('/assets/ornaments.fbx'),
        new SolidEntity(rapier, rampMaterial).load('/assets/ramp.fbx'),
      ]);

      this.solids['hollow'] = hollow;
      this.solids['ornaments'] = ornaments;
      this.solids['ramp'] = ramp;

      hollow.center(0);
      this.buildDrumPivot(hollow);

      if (ornaments['tube']) (ornaments['tube'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['base']) (ornaments['base'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['support']) (ornaments['support'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['table']) (ornaments['table'] as THREE.Mesh).material = darkChassisMaterial;
      if (ornaments['ring_outer']) (ornaments['ring_outer'] as THREE.Mesh).material = chromeMaterial;
      if (ornaments['ring_inner']) (ornaments['ring_inner'] as THREE.Mesh).material = neonRingMaterial;

      if (ornaments['glass_hole']) {
        (ornaments['glass_hole'] as THREE.Mesh).material = glassMaterial;
        (ornaments['glass_hole'] as THREE.Mesh).visible = false;
      }
      ornaments.addToScene(this.scene);
      ramp.addToScene(this.scene);

      this.buildInternalMechanism();
      this.arrangeBallsNaturally();
      this.buildExitRail();
      this.ngZone.runOutsideAngular(() => this.animate());
      this.isReady.set(true);
    } catch (err: any) {
      const message = err?.message || 'Error al cargar modelos';
      console.error('Error cargando estructura:', err);
      this.errorMessage.set(message);
      throw new Error(message);
    }
  }

  private arrangeBallsNaturally(): void {
    if (!this.agitationBalls || this.agitationBalls.length === 0) return;

    const totalBalls = this.agitationBalls.length;
    const ballRadius = this.agitationBallStates[0]?.radius || 0.95;
    const minDist = ballRadius * 2.05; // Margen para que no choquen

    // ⭐ AJUSTE DE ALTURA REAL:
    // El fondo de la esfera de cristal está en torno a Y = -10.
    // Con -9.1 la bola central queda apoyada exactamente sobre el vidrio interior.
    let bowlCenterY = -9.1;

    // Si la esfera está cargada, calculamos su cota mínima exacta:
    if (this.solids['hollow']?.mesh) {
      const box = new THREE.Box3().setFromObject(this.solids['hollow'].mesh);
      // Apoyo = suelo del cristal + radio de la bola + holgura de pared
      bowlCenterY = box.min.y + ballRadius + 0.35;
    }

    // Curvatura esférica más suave (0.052 para esfera de radio ~9.5)
    // Esto hace que las bolas se extiendan a lo ancho del cuenco y no queden en torre
    const bowlCurvature = 0.052;

    // 1. Distribución en espiral concéntrica en el fondo del cuenco
    const positions: THREE.Vector3[] = [];
    let currentLayer = 0;
    let ballsInCurrentLayer = 0;
    let maxInLayer = 1; // Bola 0 en el centro del fondo

    for (let i = 0; i < totalBalls; i++) {
      if (ballsInCurrentLayer >= maxInLayer) {
        currentLayer++;
        ballsInCurrentLayer = 0;
        // Más bolas por anillo para llenar la base primero
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
        // Altura parabólica según la concavidad del vidrio
        const y = bowlCenterY + (radiusDist * radiusDist * bowlCurvature) + (currentLayer * 0.32);

        pos = new THREE.Vector3(x, y, z);
      }

      positions.push(pos);
      ballsInCurrentLayer++;
    }

    // 2. Relajación física (25 iteraciones: separa esferas y las gravedad al fondo)
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

        // Mantener las bolas atraídas hacia el fondo cóncavo del cristal
        const distFromCenter = Math.sqrt(positions[i].x ** 2 + positions[i].z ** 2);
        const floorY = bowlCenterY + (distFromCenter * distFromCenter * bowlCurvature);
        if (positions[i].y < floorY) {
          positions[i].y = floorY;
        }
      }
    }

    // 3. Aplicar al grupo local en reposo
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
    this.scene.add(pivot);
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
      this.scene.add(bearing);

      const mount = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 1.6), bearingMaterial);
      mount.position.set(position, this.rotationCenter.y + 1.03, 0);
      mount.castShadow = true;
      mount.receiveShadow = true;
      this.scene.add(mount);
    }

    this.scene.add(shaftAssembly);
    this.mainRotationShaftGroup = shaftAssembly;
  }

  private buildInternalMechanism(): void {
    const hollowMesh = this.solids['hollow']?.mesh;
    if (!hollowMesh) {
      return;
    }
    hollowMesh.renderOrder = 10;

    const mechanism = new THREE.Group();
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
    if (!this.ballGroup) {
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

    for (let index = 0; index < 18; index++) {
      const ballRadius = 0.72;
      const ballGeometry = new THREE.SphereGeometry(ballRadius, 22, 22);
      const ballMaterial = new THREE.MeshPhysicalMaterial({
        color: this.agitationPalette[index % this.agitationPalette.length],
        emissive: this.agitationPalette[index % this.agitationPalette.length],
        emissiveIntensity: 0.28,
        roughness: 0.28,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      });
      const ball = new THREE.Mesh(ballGeometry, ballMaterial);
      ball.scale.setScalar(1.6);
      ball.castShadow = true;
      ball.receiveShadow = true;
      ball.renderOrder = 3;

      // -------------------------------------------------------------------
      // ✅ NUEVA POSICIÓN ALEATORIA (Dispersa las pelotas en el fondo)
      // -------------------------------------------------------------------
      const initialPosition = new THREE.Vector3(
        (Math.random() - 0.5) * 5.0, // X aleatorio
        -6.0 - Math.random(),        // Y junto al pie del biombo
        (Math.random() - 0.5) * 5.0   // Z aleatorio
      );

      this.ballGroup.worldToLocal(initialPosition);
      ball.position.copy(initialPosition);
      this.ballGroup.add(ball);
      this.agitationBalls.push(ball);

      this.agitationBallStates.push({
        mesh: ball,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          2 + Math.random() * 3,
          (Math.random() - 0.5) * 4,
        ),
        phase: index * 0.71,
        radius: ballRadius,
      });
    }
  }

  private buildExitRail(): void {
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x111417,
      metalness: 0.8,
      roughness: 0.35,
      emissive: 0x0d1218,
      emissiveIntensity: 0.6,
    });

    const rail = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 2), railMaterial);
    rail.position.set(12, -2.5, 0);
    rail.rotation.z = -0.22;
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.scene.add(rail);

    const guideLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x6be7ff, emissive: 0x2aa9d9, emissiveIntensity: 0.7 }));
    const guideRight = guideLeft.clone();
    guideLeft.position.set(9.8, -2.5, -1.1);
    guideRight.position.set(9.8, -2.5, 1.1);
    this.scene.add(guideLeft, guideRight);

    const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 24), new THREE.MeshStandardMaterial({ color: 0x1b2028, metalness: 0.9, roughness: 0.35 }));
    outlet.rotation.z = Math.PI / 2;
    outlet.position.set(17, -2.9, 0);
    this.scene.add(outlet);
  }

  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const deltaSeconds = this.lastAgitationFrame === 0
      ? 1 / 60
      : Math.min((now - this.lastAgitationFrame) / 1000, 1 / 30);
    this.lastAgitationFrame = now;
    const isAgitating = this.state() === 'SHUFFLING' || this.state() === 'WAITING' || this.state() === 'PICKING';

    const shaftSpeed = isAgitating ? 0.052 : 0;
    this.mainRotationAngle += shaftSpeed;

    if (this.mainRotationShaftGroup) {
      this.mainRotationShaftGroup.rotation.set(this.mainRotationAngle, 0, 0);
    }

    if (this.drumGroup) {
      this.drumGroup.rotation.set(this.mainRotationAngle, 0, 0);
    }

    if (this.mechanismGroup) {
      this.mechanismBias += isAgitating ? 0.03 : 0.008;
      const agitationBoost = isAgitating ? 1 : 0.15;
      this.mechanismGroup.rotation.y += (0.035 + Math.sin(this.mechanismBias * 1.8) * 0.02 + Math.sin(this.mechanismBias * 4.7) * 0.012) * agitationBoost;
      this.mechanismGroup.rotation.x = (Math.sin(this.mechanismBias * 2.4) * 0.7 + Math.sin(this.mechanismBias * 5.3) * 0.12) * agitationBoost;
      this.mechanismGroup.rotation.z = (Math.cos(this.mechanismBias * 2.9) * 0.38 + Math.cos(this.mechanismBias * 6.1) * 0.08) * agitationBoost;
      this.mechanismGroup.position.y = (Math.sin(this.mechanismBias * 1.7) * 0.2 + Math.sin(this.mechanismBias * 4.2) * 0.08) * agitationBoost;
    }
    if (this.agitationBallStates.length > 0 && this.state() !== 'IDLE') {
      // Radio real del domo transparente
      const sphereRadius = 8.8;

      // -------------------------------------------------------------------
      // CORRECCIÓN DE GRAVEDAD DINÁMICA SEGÚN LA ROTACIÓN DEL BIOMBO
      // -------------------------------------------------------------------
      // 1. Obtenemos la orientación actual del contenedor en el mundo
      const drumQuaternion = new THREE.Quaternion();
      if (this.ballGroup) {
        this.ballGroup.getWorldQuaternion(drumQuaternion);
      }

      // 2. Definimos la dirección de la gravedad real (Abajo en el mundo: 0, -1, 0)
      const worldGravityDir = new THREE.Vector3(0, -1, 0);

      // 3. Transformamos esa gravedad al espacio local de las pelotas (invirtiendo la rotación del contenedor)
      const localGravityDir = worldGravityDir.clone().applyQuaternion(drumQuaternion.clone().invert());

      // -------------------------------------------------------------------
      // PASO A: INTEGRACIÓN DE MOVIMIENTO Y GRAVEDAD DE REPOSO
      // -------------------------------------------------------------------
      this.agitationBallStates.forEach((ballState) => {
        const ball = ballState.mesh;
        const velocity = ballState.velocity;

        ballState.radius = 1.35;
        ball.scale.setScalar(1.55);

        if (isAgitating) {
          const time = now * 0.005 + ballState.phase;

          // Impulso de elevación en la dirección opuesta a la gravedad local
          // (Se proyecta hacia "arriba" relativo al fondo del domo actual)
          const localYPosition = ball.position.dot(localGravityDir.clone().negate());
          if (localYPosition < -2.0) {
            const pushUpDir = localGravityDir.clone().negate();
            velocity.addScaledVector(pushUpDir, (Math.random() * 38.0 + 22.0) * deltaSeconds);
          }

          // Turbulencia
          const pushX = (Math.random() - 0.5) * 22.0;
          const pushZ = Math.cos(time * 3.8 + ball.position.y) * 22.0 + (Math.random() - 0.5) * 10.0;

          velocity.x += pushX * deltaSeconds;
          velocity.z += pushZ * deltaSeconds;

          // Gravedad ligera en agitación usando la dirección local orientada al suelo real
          velocity.addScaledVector(localGravityDir, 45.0 * deltaSeconds);
        } else {
          // ESTADO DE REPOSO (MONTON ORGANICO)
          // Gravedad fuerte orientada SIEMPRE hacia el suelo del mundo real
          velocity.addScaledVector(localGravityDir, 85.0 * deltaSeconds);

          // Fricción rápida para detener la velocidad inercial
          velocity.x *= 0.60;
          velocity.z *= 0.60;
        }

        // Fricción atmosférica general
        velocity.x *= Math.pow(0.95, deltaSeconds * 60);
        velocity.z *= Math.pow(0.95, deltaSeconds * 60);
        velocity.y = Math.max(velocity.y, -100.0);

        // Actualizar posición
        ball.position.addScaledVector(velocity, deltaSeconds);

        // -----------------------------------------------------------------
        // PASO B: COLISIÓN RÍGIDA CONTRA LA ESFERA DEL BIOMBO
        // -----------------------------------------------------------------
        const currentDistance = ball.position.length();
        const maxAllowedDistance = sphereRadius - ballState.radius;

        if (currentDistance > maxAllowedDistance) {
          const normal = ball.position.clone().normalize();
          ball.position.copy(normal.clone().multiplyScalar(maxAllowedDistance));

          const dot = velocity.dot(normal);
          if (dot > 0) {
            const bounce = isAgitating ? 1.4 : 0.1; // Sin rebote en reposo para asentar
            velocity.sub(normal.multiplyScalar(bounce * dot));

            if (isAgitating) {
              velocity.x += (Math.random() - 0.5) * 5.0;
              velocity.z += (Math.random() - 0.5) * 5.0;
            }
          }
        }
      });

      // -------------------------------------------------------------------
      // PASO C: COLISIÓN INTER-PELOTAS CON DESLIZAMIENTO DE APILAMIENTO
      // -------------------------------------------------------------------
      const balls = this.agitationBallStates;
      const subSteps = 6; // Iteraciones de física fina para evitar superposiciones rígidas

      for (let step = 0; step < subSteps; step++) {
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i];
            const b2 = balls[j];

            const delta = new THREE.Vector3().subVectors(b2.mesh.position, b1.mesh.position);
            let distance = delta.length();
            const minDistance = b1.radius + b2.radius;

            if (distance < minDistance && distance > 0.0001) {
              let normal = delta.clone().normalize();

              // SI ESTÁN EN REPOSO Y CASI ALINEADAS EN LA DIRECCIÓN DE GRAVEDAD:
              // Forzamos a que resbalen lateralmente (rompe la columna recta)
              const alignmentWithGravity = Math.abs(normal.dot(localGravityDir));
              if (!isAgitating && alignmentWithGravity > 0.6) {
                const angle = (i + j) * 1.5; // Angulo pseudo-aleatorio único por pareja
                normal.x += Math.cos(angle) * 0.45;
                normal.z += Math.sin(angle) * 0.45;
                normal.normalize();
              }

              const overlap = minDistance - distance;
              const correction = normal.clone().multiplyScalar(overlap * 0.5);

              // Separación posicional directa
              b1.mesh.position.sub(correction);
              b2.mesh.position.add(correction);

              // Fricción/Impulso
              const relativeVelocity = new THREE.Vector3().subVectors(b1.velocity, b2.velocity);
              const speedAlongNormal = relativeVelocity.dot(normal);

              if (speedAlongNormal > 0) {
                const restitution = isAgitating ? 0.70 : 0.05; // Cero elasticidad en reposo
                const impulseMagnitude = speedAlongNormal * (1 + restitution) * 0.5;
                const impulse = normal.clone().multiplyScalar(impulseMagnitude);

                b1.velocity.sub(impulse);
                b2.velocity.add(impulse);
              }
            }
          }
        }
      }

      // -------------------------------------------------------------------
      // PASO D: ROTACIÓN VISUAL SOBRE SU PROPIO EJE
      // -------------------------------------------------------------------
      this.agitationBallStates.forEach((ballState) => {
        const ball = ballState.mesh;
        const velocity = ballState.velocity;

        ball.rotation.x += velocity.z * deltaSeconds * 1.5;
        ball.rotation.z -= velocity.x * deltaSeconds * 1.5;
        ball.rotation.y += velocity.y * deltaSeconds * 0.4;
        ball.visible = true;
      });
    }

    // Efectos de bolas seleccionadas
    for (let index = this.ballEffects.length - 1; index >= 0; index--) {
      const animation = this.ballEffects[index];
      const elapsed = (now - animation.startAt) / 1000;
      const t = Math.min(elapsed / animation.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const point = animation.curve.getPointAt(eased);

      const gravityDrop = Math.max(0, (t - 0.2) * 3.8) * 1.6;
      const verticalBias = Math.sin(elapsed * 18 + animation.wobble) * 0.26;
      const lateralBias = Math.cos(elapsed * 14 + animation.wobble) * 0.18;

      animation.mesh.position.set(
        point.x + lateralBias,
        point.y - gravityDrop + verticalBias,
        point.z + Math.sin(elapsed * 22 + animation.wobble) * 0.12,
      );

      animation.mesh.rotation.x += animation.spin.x;
      animation.mesh.rotation.y += animation.spin.y;
      animation.mesh.rotation.z += animation.spin.z;

      if (t >= 1) {
        this.scene.remove(animation.mesh);
        animation.mesh.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((material) => material.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        });
        this.ballEffects.splice(index, 1);
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public play(): void {
    if (!this.config || !this.isReady()) {
      return;
    }

    this.clearTimers();
    this.clearBallEffects();
    this.extractedBalls.set([]);
    this.state.set('SHUFFLING');

    const drawSequence = generateBiomboResults(this.config);

    const shuffleTimer = window.setTimeout(() => {
      this.state.set('PICKING');
      drawSequence.forEach((ballNumber, index) => {
        const timer = window.setTimeout(() => {
          const current = [...this.extractedBalls()];
          current.push(ballNumber);
          this.extractedBalls.set(current);
          this.spawnBallExit(ballNumber, index);

          if (index === drawSequence.length - 1) {
            window.setTimeout(() => this.state.set('FINISHED'), 280);
          }
        }, index * 700);

        this.drawTimers.push(timer);
      });
    }, this.shuffleDurationMs);

    this.drawTimers.push(shuffleTimer);
  }

  private spawnBallExit(ballNumber: number, index: number): void {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config?.ballType === 'yellow' ? 0xffd200 : 0xffffff,
      metalness: 0.15,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
      emissive: this.config?.ballType === 'yellow' ? 0xffd200 : 0x2c5cff,
      emissiveIntensity: 0.3,
      transmission: 0.1,
      transparent: true,
      opacity: 1,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 28, 28), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(-6.2 + index * 0.5, 5.3 + (index % 2) * 0.9, -1.2 + index * 0.9);

    const numberTexture = this.createBallNumberTexture(ballNumber);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: numberTexture, transparent: true, depthWrite: false })
    );
    label.position.set(0, 0, 0.55);
    mesh.add(label);

    this.scene.add(mesh);

    const from = mesh.position.clone();
    const to = new THREE.Vector3(18.8 + index * 0.45, -3.8 - (index * 0.38), 0.2 + (index - 1) * 0.8);
    const curve = new THREE.CatmullRomCurve3([
      from,
      new THREE.Vector3(-2.6, 4.2, 1.7),
      new THREE.Vector3(5.8, 1.2, 1.2),
      new THREE.Vector3(13.2, -1.4, 0.75),
      to,
    ]);

    this.ballEffects.push({
      mesh,
      startAt: performance.now(),
      duration: 1.9 + index * 0.16,
      from,
      to,
      curve,
      wobble: index * 1.6 + Math.random() * 0.9,
      spin: new THREE.Vector3(0.2 + Math.random() * 0.1, 0.26 + Math.random() * 0.15, 0.14 + Math.random() * 0.12),
    });
  }

  private createBallNumberTexture(value: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.config?.ballType === 'yellow' ? '#111111' : '#0b0d12';
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 128, 138);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  public resize(width: number, height: number): void {
    if (this.renderer && this.camera && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  public destroy(): void {
    this.clearTimers();
    this.clearBallEffects();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.renderer?.dispose();
  }

  private clearTimers(): void {
    this.drawTimers.forEach((timer) => window.clearTimeout(timer));
    this.drawTimers = [];
  }

  private clearBallEffects(): void {
    for (const animation of this.ballEffects) {
      this.scene?.remove(animation.mesh);
      animation.mesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) {
            material.forEach((item) => item.dispose());
          } else {
            material.dispose();
          }
        }
      });
    }
    this.ballEffects = [];
  }
}