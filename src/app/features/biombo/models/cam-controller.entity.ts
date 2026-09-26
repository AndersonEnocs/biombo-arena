import * as THREE from 'three';

export class CamControllerEntity {
  public cam: THREE.PerspectiveCamera;
  public audioListener: THREE.AudioListener;

  public spherePivot = new THREE.Vector3(20, 8, -20);
  public panPivot = new THREE.Vector3(50, 0, 0);
  public rampPivot = new THREE.Vector3(12, -12, 20);

  public sphereTarget = new THREE.Vector3();
  public panTarget = new THREE.Vector3(0, -8, 0);
  public rampTarget = new THREE.Vector3(12, -12, 0);

  public pivot = new THREE.Vector3(20, 8, -20);
  public target = this.sphereTarget;
  public smoothTarget = this.target.clone();

  public spin = true;
  public spinSpeed = 0.02;
  public spinDirection = 1;

  public followStiffness = 50;
  public rotationStiffness = 50;
  public followDamping = 50;
  public rotationDamping = 50;

  private velocity = new THREE.Vector3();
  private rotationVelocity = new THREE.Vector3();
  private velocityCopy = new THREE.Vector3();

  private radius = 0;
  private height = 0;
  private angle = 0;
  private angleStart = 0;
  private angleEnd = 0;

  constructor(aspectRatio: number) {
    this.cam = new THREE.PerspectiveCamera(45, aspectRatio, 1, 300);
    this.cam.position.set(20, 20, -150);

    this.audioListener = new THREE.AudioListener();
    this.cam.add(this.audioListener);

    this.setPivot(this.spherePivot, 0, 90);
  }

  public setPivot(pivot: THREE.Vector3, leftTheta = 0, rightTheta = 0): void {
    this.pivot.copy(pivot);
    const offset = new THREE.Vector3().subVectors(this.pivot, this.target);
    this.radius = Math.sqrt(offset.x ** 2 + offset.z ** 2);
    this.height = offset.y;

    this.angle = Math.atan2(offset.z, offset.x);
    this.angleStart = this.angle - leftTheta * (Math.PI / 180);
    this.angleEnd = this.angle + rightTheta * (Math.PI / 180);
  }

  public update(deltaTime: number): void {
    if (this.spin) {
      this.angle += this.spinDirection * this.spinSpeed * deltaTime;
      if (this.angle < this.angleStart || this.angle > this.angleEnd) {
        this.spinDirection *= -1;
        this.angle = Math.max(Math.min(this.angle, Math.max(this.angleStart, this.angleEnd)), Math.min(this.angleStart, this.angleEnd));
      }
      this.pivot.set(
        this.target.x + this.radius * Math.cos(this.angle),
        this.target.y + this.height,
        this.target.z + this.radius * Math.sin(this.angle)
      );
    }

    const toTargetPos = new THREE.Vector3().subVectors(this.pivot, this.cam.position);
    const accelPos = toTargetPos.multiplyScalar(this.followStiffness);
    this.velocityCopy.copy(this.velocity);
    accelPos.sub(this.velocityCopy.multiplyScalar(this.followDamping));
    this.velocity.add(accelPos.multiplyScalar(deltaTime));
    this.velocityCopy.copy(this.velocity);
    this.cam.position.add(this.velocityCopy.multiplyScalar(deltaTime));

    const toTargetRot = new THREE.Vector3().subVectors(this.target, this.smoothTarget);
    const accelRot = toTargetRot.multiplyScalar(this.rotationStiffness);
    this.velocityCopy.copy(this.rotationVelocity);
    accelRot.sub(this.velocityCopy.multiplyScalar(this.rotationDamping));
    this.rotationVelocity.add(accelRot.multiplyScalar(deltaTime));
    this.velocityCopy.copy(this.rotationVelocity);
    this.smoothTarget.add(this.velocityCopy.multiplyScalar(deltaTime));

    this.cam.lookAt(this.smoothTarget);
  }

  public updateAspect(aspectRatio: number): void {
    this.cam.aspect = aspectRatio;
    this.cam.updateProjectionMatrix();
  }
}