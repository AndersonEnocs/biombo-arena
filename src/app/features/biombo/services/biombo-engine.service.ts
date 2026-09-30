import { inject, Injectable, NgZone, signal } from '@angular/core';
import * as THREE from 'three';
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
  private readonly shuffleDurationMs = 8000;
  private readonly rotationCenter = new THREE.Vector3(0, 0, 0);

  private readonly agitationPalette = [
    0x00d2ff, // Azul cian
    0xffd200, // Amarillo brillante
    0xff3b6f, // Rosa magenta (como bola 10 del video)
    0x00e676, // Verde lima
    0xffffff, // Blanco perla
    0x9c27b0, // Púrpura
    0xff9100, // Naranja
    0x3d5afe, // Azul cobalto
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
        throw new Error('Tu navegador o el entorno actual no soportan WebGL.');
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
        metalness: 0.05,
        roughness: 0.04,
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
        emissiveIntensity: 3.5,
        roughness: 0.2,
      });

      const rampMaterial = new THREE.MeshStandardMaterial({
        color: 0x111317,
        metalness: 0.75,
        roughness: 0.35,
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
    const minDist = ballRadius * 2.05;

    // Altura calculada en la base interior del cristal
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

    const total = 24;
    for (let index = 0; index < total; index++) {
      const ballRadius = 0.92;
      const ballGeometry = new THREE.SphereGeometry(ballRadius, 24, 24);

      // Textura esmaltada vibrante con acabado pulido de casino
      const ballMaterial = new THREE.MeshStandardMaterial({
        color: this.agitationPalette[index % this.agitationPalette.length],
        roughness: 0.18,
        metalness: 0.08,
      });

      const ball = new THREE.Mesh(ballGeometry, ballMaterial);
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

  private animate(): void {
    this.animFrameId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const deltaSeconds = this.lastAgitationFrame === 0
      ? 1 / 60
      : Math.min((now - this.lastAgitationFrame) / 1000, 1 / 30);
    this.lastAgitationFrame = now;
    const isAgitating = this.state() === 'SHUFFLING';

    // Giro del biombo durante la mezcla
    // const shaftSpeed = isAgitating ? 0.048 : 0;
    const shaftSpeed = isAgitating ? 0.075 : 0;
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

    // Dinámica física de las bolas interiores
    // =========================================================================
    // ⚙️ DINÁMICA FÍSICA BALÍSTICA DE IMPACTO REAL
    // =========================================================================
    if (this.agitationBallStates.length > 0 && this.state() !== 'IDLE') {
      const sphereRadius = 9.8;
      const drumQuaternion = new THREE.Quaternion();
      if (this.ballGroup) {
        this.ballGroup.getWorldQuaternion(drumQuaternion);
      }

      const worldGravityDir = new THREE.Vector3(0, -1, 0);
      const localGravityDir = worldGravityDir.clone().applyQuaternion(drumQuaternion.clone().invert());

      this.agitationBallStates.forEach((ballState) => {
        const ball = ballState.mesh;
        const velocity = ballState.velocity;

        if (isAgitating) {
          const localYPosition = ball.position.dot(localGravityDir.clone().negate());

          // 1. Impulso balístico que barre desde el pie del biombo
          if (localYPosition < -5.8) {
            const kickUp = Math.random() * 55.0 + 40.0;
            velocity.addScaledVector(localGravityDir.clone().negate(), kickUp * deltaSeconds * 2.8);

            const kickX = (Math.random() - 0.5) * 45.0;
            const kickZ = (Math.random() - 0.5) * 45.0;
            velocity.x += kickX * deltaSeconds * 2.2;
            velocity.z += kickZ * deltaSeconds * 2.2;
          }

          velocity.addScaledVector(localGravityDir, 68.0 * deltaSeconds);

          // Fricción ligera de aire en pleno giro
          velocity.x *= Math.pow(0.992, deltaSeconds * 60);
          velocity.z *= Math.pow(0.992, deltaSeconds * 60);
          velocity.y *= Math.pow(0.995, deltaSeconds * 60);
        } else {
          // ⭐ 2. FASE DE ASENTAMIENTO (FIN DEL GIRO / PICKING):
          const localYPosition = ball.position.dot(localGravityDir.clone().negate());

          // Gravedad fuerte (110): caen de golpe hacia el piso de vidrio sin frenarse en el aire
          velocity.addScaledVector(localGravityDir, 110.0 * deltaSeconds);

          // Fricción suave mientras caen por el aire
          velocity.x *= Math.pow(0.96, deltaSeconds * 60);
          velocity.z *= Math.pow(0.96, deltaSeconds * 60);
          velocity.y *= Math.pow(0.97, deltaSeconds * 60);

          // ⭐ Freno y reposo absoluto ÚNICAMENTE cuando ya llegaron al fondo (Y < -6.0)
          if (localYPosition < -6.0) {
            velocity.multiplyScalar(Math.pow(0.65, deltaSeconds * 60));

            // Si ya están asentadas en la base, congelar a 0 (cero temblor)
            if (velocity.lengthSq() < 0.25) {
              velocity.set(0, 0, 0);
            }
          }
        }

        ball.position.addScaledVector(velocity, deltaSeconds);

        // ⭐ 3. COLISIÓN CON EL CRISTAL SIN MICRO-REBOTES
        const currentDistance = ball.position.length();
        const maxAllowedDistance = sphereRadius - ballState.radius;

        if (currentDistance > maxAllowedDistance) {
          const normal = ball.position.clone().normalize();
          ball.position.copy(normal.clone().multiplyScalar(maxAllowedDistance));
          const dot = velocity.dot(normal);

          if (dot > 0) {
            if (isAgitating) {
              // Rebote vivo durante el sorteo
              const bounce = 1.65;
              velocity.sub(normal.multiplyScalar(bounce * dot));
              velocity.x += (Math.random() - 0.5) * 8.0;
              velocity.z += (Math.random() - 0.5) * 8.0;
            } else {
              // En reposo: absorción total del impacto (cero temblor contra el vidrio)
              velocity.sub(normal.multiplyScalar(dot));
              velocity.multiplyScalar(0.6);
            }
          }
        }
      });

      // ⭐ 5. CHOQUES INTER-PELOTAS (Intercambio de energía para que se dispersen al tocarse)
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
                const impulse = normal.clone().multiplyScalar(speedAlongNormal * 0.75);
                balls[i].velocity.sub(impulse);
                balls[j].velocity.add(impulse);
              }
            }
          }
        }
      }
    }

    // =========================================================================
    // ⚙️ FÍSICA CINEMÁTICA DE BOLAS EXTRAÍDAS EN EL RIEL INFERIOR
    // =========================================================================


    for (let index = 0; index < this.ballEffects.length; index++) {
      const anim = this.ballEffects[index];
      const elapsed = (now - anim.startAt) / 1000;
      const progress = Math.min(elapsed / anim.duration, 1);

      if (!anim.hasSettled) {
        // Easing cúbico para aceleración por gravedad y deceleración en la bandeja
        const easedT = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentPos = anim.curve.getPointAt(easedT);
        anim.mesh.position.copy(currentPos);

        const rollSpeed = (1 - progress * 0.6) * 0.42;
        anim.mesh.rotation.z -= rollSpeed; // Gira rodando hacia la derecha
        anim.mesh.rotation.y += rollSpeed * 0.15;

        if (progress >= 1) {
          anim.hasSettled = true;
          anim.mesh.position.copy(anim.targetSlotPos);
          // Orientar el número al frente de la cámara perfectamente erguido
          anim.mesh.rotation.set(0, 0, 0);
        }
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

    // 1. Fase de agitación completa (8 segundos girando)
    const shuffleTimer = window.setTimeout(() => {
      this.state.set('PICKING');

      // 2. Extraer las bolas una por una por el fondo inferior hacia la rampa
      drawSequence.forEach((ballNumber, index) => {
        const timer = window.setTimeout(() => {
          const current = [...this.extractedBalls()];
          current.push(ballNumber);
          this.extractedBalls.set(current);

          this.spawnBallExitThroughBottom(ballNumber, index);

          if (index === drawSequence.length - 1) {
            window.setTimeout(() => this.state.set('FINISHED'), 2200);
          }
        }, index * 2400); // 2.4s entre cada bola para ver el descenso y rodamiento completo

        this.drawTimers.push(timer);
      });
    }, this.shuffleDurationMs);

    this.drawTimers.push(shuffleTimer);
  }

  private spawnBallExitThroughBottom(ballNumber: number, index: number): void {
    const ballRadius = 0.95;
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);

    const numberTexture = this.createBallNumberTexture(ballNumber);
    const material = new THREE.MeshStandardMaterial({
      map: numberTexture,
      roughness: 0.15,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(ballGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // =========================================================================
    // 🎯 FÍSICA DE TOPE: LA 1ª RUEDA HASTA EL FINAL, 2ª Y 3ª SE ACUMULAN A LA IZQUIERDA
    // =========================================================================
    const trackFloorY = -10.95;
    const trackZ = 2.45;

    const endOfTrackX = 19; // Posición de tope final
    const ballSpacing = 2.15; // Distancia entre centros de bolas

    const targetSlotX = endOfTrackX - (index * ballSpacing);
    const targetSlotPos = new THREE.Vector3(targetSlotX, trackFloorY, trackZ);

    const pStart = new THREE.Vector3(0, -8.2, 0.2);
    const pDrop = new THREE.Vector3(0.1, -9.5, 0.9);
    const pRampEntry = new THREE.Vector3(0.4, -10.5, 1.8);
    const pRampMid = new THREE.Vector3(Math.max(0.6, targetSlotX * 0.5), -10.85, 2.2);

    const curve = new THREE.CatmullRomCurve3([
      pStart,
      pDrop,
      pRampEntry,
      pRampMid,
      targetSlotPos,
    ]);

    mesh.position.copy(pStart);
    this.scene.add(mesh);

    if (this.agitationBalls[index]) {
      this.agitationBalls[index].visible = false;
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

  private createBallNumberTexture(value: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    const isYellow = this.config?.ballType === 'yellow';
    const baseColor = isYellow ? '#ffd200' : this.agitationPalette[(value - 1) % this.agitationPalette.length];

    // Fondo brillante esmaltado
    ctx.fillStyle = typeof baseColor === 'number' ? `#${baseColor.toString(16).padStart(6, '0')}` : baseColor;
    ctx.fillRect(0, 0, 256, 256);

    // Círculo blanco central característico de las bolas de bingo
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 80, 0, Math.PI * 2);
    ctx.fill();

    // Número impreso nítido
    ctx.fillStyle = '#0f1115';
    ctx.font = 'bold 90px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 128, 134);

    // Subrayado para el 6 y 9
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
      animation.mesh.geometry?.dispose();
      if (Array.isArray(animation.mesh.material)) {
        animation.mesh.material.forEach((mat) => mat.dispose());
      } else {
        animation.mesh.material?.dispose();
      }
    }
    this.ballEffects = [];

    // Restaurar visibilidad de bolas internas para la nueva ronda
    this.agitationBalls.forEach((b) => (b.visible = true));
  }
}