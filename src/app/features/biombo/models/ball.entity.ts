import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

export class BallEntity {
  public static readonly MIN_BALL_COUNT = 8;
  public static readonly MAX_BALL_COUNT = 100;
  public static readonly COLOR_COUNT = 8;
  public static ballGeom: THREE.SphereGeometry | null = null;
  public static quadBall: THREE.Mesh | null = null;

  public mesh: THREE.Mesh;
  public body: RAPIER.RigidBody | null = null;
  public collider: RAPIER.Collider | null = null;
  public shape: RAPIER.ColliderDesc | null = null;

  private canvas: HTMLCanvasElement;
  private texture: THREE.CanvasTexture;
  private rotation = new THREE.Euler();
  private quaternion = new THREE.Quaternion();
  private zero = new THREE.Vector3();

  constructor(
    private rapier: typeof RAPIER,
    public value: number,
    public radius = 1,
    public type: 'color' | 'yellow' = 'color'
  ) {
    if (!BallEntity.ballGeom) {
      BallEntity.ballGeom = new THREE.SphereGeometry(radius, 16, 16);
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas);

    this.mesh = BallEntity.quadBall ? BallEntity.quadBall.clone() : new THREE.Mesh(BallEntity.ballGeom);
    this.mesh.material = new THREE.MeshPhongMaterial({ map: this.texture });
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.paintBall();
  }

  public addToWorld(world: RAPIER.World, layerMask: number): void {
    this.body = world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z)
        .setCcdEnabled(true)
    );
    this.shape = this.rapier.ColliderDesc.ball(this.radius).setMass(0.1);
    this.setGravityScale(5);

    this.collider = world.createCollider(this.shape, this.body);
    this.collider.setCollisionGroups(layerMask);

    const angle = Math.PI / 2;
    const quat = new this.rapier.Quaternion(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
    this.body.setRotation(quat, true);
  }

  public removeFromWorld(world: RAPIER.World): void {
    if (this.collider) {
      world.removeCollider(this.collider, true);
      this.collider = null;
    }
  }

  public randomizePosition(): void {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2 * Math.PI;
    const phi = Math.acos(2 * v - 1);
    const r = 7 * Math.cbrt(Math.random());

    this.mesh.position.x = r * Math.sin(phi) * Math.cos(theta);
    this.mesh.position.y = r * Math.sin(phi) * Math.sin(theta);
    this.mesh.position.z = r * Math.cos(phi);

    if (this.body) {
      this.body.setLinvel(this.zero, true);
      this.body.setAngvel(this.zero, true);
      this.body.setTranslation(this.mesh.position, true);
    }
  }

  public update(): void {
    if (this.body) {
      const pos = this.body.translation();
      this.mesh.position.set(pos.x, pos.y, pos.z);

      const br = this.body.rotation();
      this.quaternion.set(br.x, br.y, br.z, br.w);
      this.mesh.rotation.copy(this.rotation.setFromQuaternion(this.quaternion));
    }
  }

  public setGravityScale(scale: number, wakeUp = true): void {
    this.body?.setGravityScale(scale, wakeUp);
  }

  public setLayerMask(mask: number): void {
    this.collider?.setCollisionGroups(mask);
  }

  public paintBall(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const isYellow = this.type === 'yellow';
    const h = (360 / BallEntity.COLOR_COUNT) * ((this.value - 1) % BallEntity.COLOR_COUNT);
    const baseColor = isYellow ? '#ffd200' : this.hslToHex(h, 50, 50);

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 128);

    if (!isYellow) {
      ctx.beginPath();
      ctx.arc(64, 64, 48, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    ctx.font = '64px BallFont, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isYellow ? '#000000' : baseColor;

    const textMetrics = ctx.measureText(`${this.value}`);
    const hw = textMetrics.width / 2;
    ctx.fillText(`${this.value}`, 64 - hw, 64);

    if (/[69]/.test(`${this.value}`)) {
      ctx.fillRect(64 - 16, 64 + 26, 32, 8);
    }

    this.texture.needsUpdate = true;
  }

  private hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    const toHex = (val: number) => Math.round((val + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  public dispose(): void {
    this.texture.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }
}