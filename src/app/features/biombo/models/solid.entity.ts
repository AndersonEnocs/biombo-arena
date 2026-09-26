import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';

export class SolidEntity {
  public mesh: THREE.Mesh | null = null;
  public meshes: THREE.Mesh[] = [];
  [key: string]: any;

  private rotation = new THREE.Euler();
  private quaternion = new THREE.Quaternion();

  constructor(
    private rapier: typeof RAPIER,
    public material: THREE.Material | null = null
  ) {}

  public update(): void {
    for (const mesh of this.meshes) {
      if ((mesh as any).body) {
        const body: RAPIER.RigidBody = (mesh as any).body;
        const pos = body.translation();
        mesh.position.set(pos.x, pos.y, pos.z);

        const br = body.rotation();
        this.quaternion.set(br.x, br.y, br.z, br.w);
        mesh.rotation.copy(this.rotation.setFromQuaternion(this.quaternion));
      }
    }
  }

  public addToWorld(world: RAPIER.World, layerMask: number, fixed = true): void {
    for (const mesh of this.meshes) {
      const customMesh = mesh as any;
      if (customMesh.vertices && customMesh.indices) {
        customMesh.body = world.createRigidBody(
          fixed ? this.rapier.RigidBodyDesc.fixed() : this.rapier.RigidBodyDesc.kinematicVelocityBased()
        );
        customMesh.shape = this.rapier.ColliderDesc.trimesh(customMesh.vertices, customMesh.indices).setMass(1);
        customMesh.collider = world.createCollider(customMesh.shape, customMesh.body);
        customMesh.collider.setCollisionGroups(layerMask);
      }
    }
  }

  public addToScene(scene: THREE.Scene): void {
    for (const mesh of this.meshes) {
      scene.add(mesh);
    }
  }

  public setAngularVelocity(angVel: RAPIER.Vector3, wakeUp = true): void {
    for (const mesh of this.meshes) {
      (mesh as any).body?.setAngvel(angVel, wakeUp);
    }
  }

  public resetRotation(meshIndex: number): void {
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    if (meshIndex >= 0 && meshIndex < this.meshes.length) {
      (this.meshes[meshIndex] as any).body?.setRotation(identity, true);
    }
  }

  public center(meshIndex: number): void {
    if (meshIndex >= 0 && meshIndex < this.meshes.length) {
      this.meshes[meshIndex].geometry.center();
    }
  }

  public load(path: string): Promise<SolidEntity> {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        path,
        (fbx) => {
          fbx.traverse((obj) => this.traverseObject(obj));
          resolve(this);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  private traverseObject(obj: THREE.Object3D): void {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (this.material) {
        mesh.material = this.material;
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      const pivot = mesh.getWorldPosition(new THREE.Vector3());
      const scale = mesh.getWorldScale(new THREE.Vector3());
      const quaternion = mesh.getWorldQuaternion(new THREE.Quaternion());

      const rotation = new THREE.Euler().setFromQuaternion(quaternion);
      const geometry = mesh.geometry.clone();

      geometry.rotateX(rotation.x);
      geometry.rotateY(rotation.z);
      geometry.rotateZ(rotation.y);
      geometry.scale(scale.x, scale.z, scale.y);
      geometry.translate(pivot.x, pivot.y, pivot.z);

      const customMesh = mesh as any;
      if (geometry.attributes['position']) {
        customMesh.vertices = Float32Array.from(geometry.attributes['position'].array);
        customMesh.indices = geometry.index ? Array.from(geometry.index.array) : [...Array(geometry.attributes['position'].count).keys()];
      }

      if (this.meshes.length === 0) {
        this.mesh = mesh;
      }
      this.meshes.push(mesh);
      this[mesh.name] = mesh;
    }
  }

  public dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
    this.meshes = [];
  }
}