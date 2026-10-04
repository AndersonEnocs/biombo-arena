# Guía Completa de Manejo de Cámara en Three.js

## 📋 Tabla de Contenidos
1. [Conceptos Básicos](#1-conceptos-básicos)
2. [Tipos de Cámaras](#2-tipos-de-cámaras)
3. [Controles de Cámara](#3-controles-de-cámara)
4. [Ejemplos Prácticos](#4-ejemplos-prácticos)
5. [Métodos y Propiedades Importantes](#5-métodos-y-propiedades-importantes)

---

## 1. Conceptos Básicos

### ¿Qué es una Cámara en Three.js?
La cámara en Three.js define el punto de vista desde el cual se renderiza la escena. Es como los ojos de tu aplicación 3D.

### Componentes Clave:
- **Posición**: Dónde está ubicada la cámara en el espacio 3D
- **Target (Objetivo)**: A qué punto mira la cámara
- **Up Vector**: La dirección "arriba" para la cámara (por defecto +Y)

---

## 2. Tipos de Cámaras

### 2.1 PerspectiveCamera (Cámara Perspectiva)
La más común, simula cómo ve el ojo humano (objetos lejanos aparecen más pequeños).

```typescript
import * as THREE from 'three';

// Crear cámara perspectiva
const camera = new THREE.PerspectiveCamera(
  75,        // FOV (Field of View) en grados - ángulo vertical
  width / height,  // Aspect ratio (ancho/alto del canvas)
  0.1,       // Plano cercano (near plane)
  1000       // Plano lejano (far plane)
);

// Añadir a la escena
scene.add(camera);
```

**Propiedades importantes:**
- `fov`: Campo de visión (30° = teleobjetivo, 90° = gran angular)
- `near`: Objetos más cercanos que este valor no se renderizan
- `far`: Objetos más lejanos que este valor no se renderizan
- `aspect`: Relación ancho/alto del viewport

### 2.2 OrthographicCamera (Cámara Ortográfica)
No tiene perspectiva - los objetos mantienen el mismo tamaño independientemente de la distancia. Ideal para vistas técnicas/isométricas.

```typescript
const aspect = width / height;
const frustumSize = 50; // Tamaño del área visible
const near = 1;
const far = 1000;

const camera = new THREE.OrthographicCamera(
  -aspect * frustumSize / 2, // derecha
  aspect * frustumSize / 2, // izquierda
  frustumSize / 2,          // arriba
  -frustumSize / 2,          // abajo
  near,                      // cercano
  far                        // lejano
);

// Posicionar cámara
camera.position.set(50, 50, 50);
```

---

## 3. Controles de Cámara

### 3.1 OrbitControls (Control Orbital)
Permite rotar, hacer zoom y mover la cámara alrededor de un punto objetivo. Ideal para inspeccionar modelos 3D.

```typescript
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);

// Configuración básica
controls.enableZoom = true;        // Permitir zoom (mouse wheel)
controls.enablePan = true;         // Permitir pan (botón derecho)
controls.enableRotate = true;      // Permitir rotar (botón izquierdo)

// Límites de movimiento
controls.minDistance = 5;          // Zoom mínimo
controls.maxDistance = 100;        // Zoom máximo
controls.minPolarAngle = 0;        // Ángulo vertical mínimo
controls.maxPolarAngle = Math.PI;  // Ángulo vertical máximo (π = 180°)

// Velocidad
controls.rotateSpeed = 1.0;        // Velocidad de rotación
controls.zoomSpeed = 1.2;          // Velocidad de zoom
controls.panSpeed = 0.8;           // Velocidad de pan

// Comportamiento al hacer zoom
controls.dampingFactor = 0.05;     // Suavizado (inercia)
controls.enableDamping = true;     // Activar inercia

// Actualizar después de cambios manuales a la cámara
camera.position.set(0, 20, 100);
controls.update();

function animate() {
  controls.update();               // Requerido si enableDamping = true
  renderer.render(scene, camera);
}
```

### 3.2 FlyControls (Control de Vuelo)
Permite volar libremente por la escena como en un videojuego FPS.

```typescript
import { FlyControls } from 'three/addons/controls/FlyControls.js';

const controls = new FlyControls(camera, renderer.domElement);

// Posición inicial
controls.moveForward = 0;    // Mover hacia adelante
controls.moveRight = 0;      // Mover a la derecha
controls.moveUp = 0;         // Mover hacia arriba

function animate() {
  controls.update();
  renderer.render(scene, camera);
}
```

### 3.3 FirstPersonControls (Control Primera Persona)
Similar a OrbitControls pero con movimiento en primera persona.

```typescript
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';

const controls = new FirstPersonControls(camera, renderer.domElement);

// Configuración de movimiento
controls.movementSpeed = 100;    // Velocidad de movimiento
controls.movementSensitivity = 1.5; // Sensibilidad del ratón

// Habilitar gravedad
controls.autoForward = false;     // No avanzar automáticamente
controls.maxPolarAngle = Math.PI / 2; // Limitar a la mitad superior
```

### 3.4 TransformControls (Control de Transformación)
Herramienta para editar objetos en escena (mover, rotar, escalar).

```typescript
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const controls = new TransformControls(camera, renderer.domElement);

// Conectar a un objeto
controls.attach(object);

// Habilitar tipos de control
controls.enableTranslation = true;  // Mover (flechas)
controls.enableRotation = true;     // Rotar (círculos)
controls.enableScaling = true;      // Escalar (manijas)

// Renderizar en cada frame
function animate() {
  controls.update();
  renderer.render(scene, camera);
}
```

### 3.5 PointerLockControls (Control con Pointer Lock)
Para aplicaciones donde el usuario debe "agarrar" el cursor (juegos FPS).

```typescript
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const controls = new PointerLockControls(camera, renderer.domElement);

// Iniciar control
document.body.addEventListener('click', () => {
  controls.lock();  // Ocultar cursor y capturar teclado/ratón
});

// Detectar cuando el usuario suelta el cursor
controls.addEventListener('lock', (locked) => {
  if (locked) {
    console.log('Cursor capturado');
  } else {
    console.log('Cursor liberado');
  }
});

function animate() {
  if (controls.isLocked) {
    controls.update();
    renderer.render(scene, camera);
  }
}
```

---

## 4. Ejemplos Prácticos

### 4.1 Mover la Cámara Manualmente

```typescript
// Mover cámara a una posición específica
camera.position.set(x, y, z);

// Rotar cámara alrededor de un punto
const target = new THREE.Vector3(tx, ty, tz);
camera.lookAt(target);

// Rotar en ejes específicos
camera.rotation.x = Math.PI / 6;  // Rotar en eje X (pitch)
camera.rotation.y = Math.PI / 4;  // Rotar en eje Y (yaw)
camera.rotation.z = -Math.PI / 3; // Rotar en eje Z (roll)

// Mover cámara hacia adelante manteniendo la dirección actual
const direction = new THREE.Vector3();
camera.getWorldDirection(direction);
direction.normalize();
camera.position.addScaledVector(direction, 10);

// Hacer zoom acercando la cámara al objetivo
const target = controls.target;
const distance = camera.position.distanceTo(target);
const newDistance = Math.max(controls.minDistance, distance - 5);
const directionToTarget = new THREE.Vector3()
  .subVectors(target, camera.position)
  .normalize();
camera.position.copy(target).addScaledVector(directionToTarget, newDistance);
controls.update();
```

### 4.2 Seguir un Objeto (Cámara de Seguimiento)

```typescript
// Cámara que sigue a un personaje
function updateCamera(character: THREE.Object3D) {
  // Calcular posición objetivo (detrás del personaje)
  const offset = new THREE.Vector3(0, 5, 10); // Detrás y arriba
  
  // Aplicar rotación del personaje
  offset.applyEuler(character.rotation);
  
  // Posicionar cámara
  camera.position.copy(character.position).add(offset);
  
  // Mirar al personaje
  camera.lookAt(character.position);
}

// Llamar en cada frame
function animate() {
  updateCamera(character);
  renderer.render(scene, camera);
}
```

### 4.3 Cámara con Zoom Suave (Dolly)

```typescript
function smoothZoom(targetDistance: number, duration: number = 1000) {
  const startTime = performance.now();
  const startDistance = controls.getDistance();
  
  function animateZoom() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Interpolación lineal para zoom suave
    const currentDistance = THREE.MathUtils.lerp(
      startDistance, 
      targetDistance, 
      progress
    );
    
    controls.dollyIn(currentDistance / startDistance);
    
    if (progress < 1) {
      requestAnimationFrame(animateZoom);
    }
  }
  
  animateZoom();
}

// Usar la función
smoothZoom(20); // Zoom a distancia 20
```

### 4.4 Cámara con Movimiento de Teclado

```typescript
const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false
};

// Event listeners
document.addEventListener('keydown', (e) => {
  switch(e.code) {
    case 'KeyW': keys.forward = true; break;
    case 'KeyS': keys.backward = true; break;
    case 'ArrowLeft': keys.left = true; break;
    case 'ArrowRight': keys.right = true; break;
    case 'ArrowUp': keys.up = true; break;
    case 'ArrowDown': keys.down = true; break;
  }
});

document.addEventListener('keyup', (e) => {
  switch(e.code) {
    case 'KeyW': keys.forward = false; break;
    case 'KeyS': keys.backward = false; break;
    case 'ArrowLeft': keys.left = false; break;
    case 'ArrowRight': keys.right = false; break;
    case 'ArrowUp': keys.up = false; break;
    case 'ArrowDown': keys.down = false; break;
  }
});

// Actualizar posición de cámara
function updateCameraPosition() {
  const speed = 0.5;
  
  // Obtener dirección hacia adelante (inversa a la mirada)
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward).negate();
  
  // Obtener dirección lateral
  const right = new THREE.Vector3();
  right.crossVectors(camera.up, forward).normalize();
  
  // Mover cámara según teclas presionadas
  if (keys.forward) {
    camera.position.addScaledVector(forward, speed);
  }
  if (keys.backward) {
    camera.position.addScaledVector(forward, -speed);
  }
  if (keys.left) {
    camera.position.addScaledVector(right, -speed);
  }
  if (keys.right) {
    camera.position.addScaledVector(right, speed);
  }
  
  // Zoom con teclas
  if (keys.up) {
    controls.dollyIn(0.1);
  }
  if (keys.down) {
    controls.dollyOut(0.1);
  }
}

function animate() {
  updateCameraPosition();
  renderer.render(scene, camera);
}
```

### 4.5 Cámara con Limites de Rotación

```typescript
// Limitar rotación vertical (no mirar hacia abajo/arriba)
controls.minPolarAngle = Math.PI / 6;    // 30° mínimo
controls.maxPolarAngle = Math.PI - Math.PI / 6; // 150° máximo

// Limitar rotación horizontal
controls.minAzimuthAngle = -Math.PI / 4; // -45°
controls.maxAzimuthAngle = Math.PI / 4;  // +45°

// Limitar distancia de zoom
controls.minDistance = 10;   // No acercarse más de 10 unidades
controls.maxDistance = 200;  // No alejarse más de 200 unidades
```

### 4.6 Cámara con Damping (Inercia)

```typescript
// Activar inercia para movimiento suave
controls.enableDamping = true;
controls.dampingFactor = 0.1; // Valor entre 0 y 1

// El damping se aplica automáticamente en cada frame
// No necesitas llamar a controls.update() para el damping
// Solo para cambios manuales:
camera.position.set(10, 10, 10);
controls.update();
```

---

## 5. Métodos y Propiedades Importantes

### Métodos de Cámara

| Método | Descripción |
|--------|-------------|
| `lookAt(target)` | Hacer que la cámara mire hacia un punto |
| `position.set(x, y, z)` | Establecer posición XYZ |
| `rotation.setPitch(yaw, roll)` | Establecer rotación en ejes |
| `updateProjectionMatrix()` | Actualizar matriz de proyección (requerido al cambiar FOV) |
| `getWorldDirection(vector)` | Obtener dirección en el mundo |
| `distanceTo(target)` | Distancia a un punto |

### Métodos de OrbitControls

| Método | Descripción |
|--------|-------------|
| `update()` | Actualizar controles (requerido después de cambios manuales) |
| `dollyIn(scale)` | Hacer zoom in |
| `dollyOut(scale)` | Hacer zoom out |
| `rotateLeft(angle)` | Rotar izquierda |
| `rotateUp(angle)` | Rotar arriba |
| `pan(deltaX, deltaY)` | Mover cámara lateralmente |
| `getDistance()` | Obtener distancia actual al objetivo |
| `getAzimuthalAngle()` | Obtener ángulo horizontal actual |
| `getPolarAngle()` | Obtener ángulo vertical actual |
| `reset()` | Restaurar estado inicial |
| `saveState()` | Guardar estado actual |

### Propiedades de Cámara

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `position` | Vector3 | Posición XYZ de la cámara |
| `rotation` | Euler | Rotación en radianes (x, y, z) |
| `quaternion` | Quaternion | Rotación como cuaternión |
| `up` | Vector3 | Vector "arriba" de la cámara |
| `target` | Object3D | Punto que mira la cámara |
| `fov` | number | Campo de visión (grados) - solo PerspectiveCamera |
| `near` | number | Plano cercano |
| `far` | number | Plano lejano |
| `aspect` | number | Relación ancho/alto |

### Propiedades de OrbitControls

| Propiedad | Tipo | Descripción | Valor por defecto |
|-----------|------|-------------|-------------------|
| `enableZoom` | boolean | Permitir zoom | true |
| `enablePan` | boolean | Permitir pan | true |
| `enableRotate` | boolean | Permitir rotación | true |
| `enableDamping` | boolean | Activar inercia | false |
| `dampingFactor` | number | Factor de inercia | 0.1 |
| `minDistance` | number | Distancia mínima | 0 |
| `maxDistance` | number | Distancia máxima | Infinity |
| `minPolarAngle` | number | Ángulo vertical mínimo | 0 |
| `maxPolarAngle` | number | Ángulo vertical máximo | Math.PI |
| `minAzimuthAngle` | number | Ángulo horizontal mínimo | -Infinity |
| `maxAzimuthAngle` | number | Ángulo horizontal máximo | Infinity |
| `zoomSpeed` | number | Velocidad de zoom | 1 |
| `rotateSpeed` | number | Velocidad de rotación | 1 |
| `panSpeed` | number | Velocidad de pan | 1 |
| `screenSpacePanning` | boolean | Pan en espacio de pantalla | true |

---

## 6. Patrones Comunes

### 6.1 Patrón: Cámara de Tercera Persona

```typescript
class ThirdPersonCamera {
  private offset: THREE.Vector3;
  private target: THREE.Object3D;
  
  constructor(camera: THREE.PerspectiveCamera, target: THREE.Object3D) {
    this.target = target;
    this.offset = new THREE.Vector3(0, 5, 10); // Detrás y arriba
  }
  
  update() {
    // Calcular posición objetivo
    const offsetVector = this.offset.clone();
    
    // Aplicar rotación del objetivo
    offsetVector.applyEuler(this.target.rotation);
    
    // Posicionar cámara
    camera.position.copy(this.target.position).add(offsetVector);
    
    // Mirar al objetivo con un poco de "look ahead"
    const lookAtPos = this.target.position.clone().add(
      new THREE.Vector3(0, 0, -5)
    );
    camera.lookAt(lookAtPos);
  }
}
```

### 6.2 Patrón: Cámara Cinemática

```typescript
class CinematicCamera {
  private target: THREE.Object3D;
  private path: THREE.CatmullRomCurve3;
  private speed: number;
  
  constructor(
    camera: THREE.PerspectiveCamera,
    target: THREE.Object3D,
    path: THREE.CatmullRomCurve3,
    speed: number = 0.1
  ) {
    this.target = target;
    this.path = path;
    this.speed = speed;
  }
  
  update(deltaTime: number) {
    // Mover cámara a lo largo de la trayectoria
    const position = this.path.getPointAt(
      this.path.getPointAt(this.path.getLength() * this.speed * deltaTime)
    );
    
    camera.position.copy(position);
    
    // Mirar hacia el objetivo
    camera.lookAt(this.target.position);
  }
}
```

### 6.3 Patrón: Cámara con Transición Suave

```typescript
class SmoothCamera {
  private targetPosition: THREE.Vector3;
  private currentPosition: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private currentRotation: THREE.Euler;
  private lerpSpeed: number;
  
  constructor(
    camera: THREE.PerspectiveCamera,
    lerpSpeed: number = 0.1
  ) {
    this.currentPosition = new THREE.Vector3();
    camera.position.cloneInto(this.currentPosition);
    
    this.currentRotation = new THREE.Euler();
    camera.rotation.cloneInto(this.currentRotation);
    
    this.lerpSpeed = lerpSpeed;
  }
  
  setTargetPosition(x: number, y: number, z: number) {
    this.targetPosition.set(x, y, z);
  }
  
  setTargetRotation(pitch: number, yaw: number, roll: number) {
    this.targetRotation.set(pitch, yaw, roll);
  }
  
  update(deltaTime: number) {
    // Interpolación lineal para posición
    this.currentPosition.lerp(this.targetPosition, deltaTime * this.lerpSpeed);
    camera.position.copy(this.currentPosition);
    
    // Interpolación para rotación (más complejo por cuaterniones)
    const targetQuaternion = new THREE.Quaternion().setFromEuler(
      this.targetRotation
    );
    const currentQuaternion = new THREE.Quaternion().setFromEuler(
      this.currentRotation
    );
    
    // Interpolación esférica para rotación suave
    const targetQuaternionWithLerp = new THREE.Quaternion();
    targetQuaternion.slerp(currentQuaternion, deltaTime * this.lerpSpeed, targetQuaternionWithLerp);
    
    camera.quaternion.copy(targetQuaternionWithLerp);
    camera.updateMatrix();
  }
}
```

---

## 7. Consejos y Mejores Prácticas

### ✅ Buenas Prácticas

1. **Siempre llama a `controls.update()`** después de cambios manuales a la cámara
2. **Usa damping** para movimiento suave cuando sea posible
3. **Establece límites** para evitar que la cámara se salga de la escena
4. **Actualiza la matriz de proyección** cuando cambies el FOV o aspecto
5. **Guarda el estado inicial** con `saveState()` si necesitas resetear

### ⚠️ Errores Comunes

```typescript
// ❌ MAL: No actualizar controls después de mover cámara manualmente
camera.position.set(10, 10, 10);
// controls.update() falta aquí!

// ✅ BIEN
camera.position.set(10, 10, 10);
controls.update();

// ❌ MAL: Olvidar actualizar damping
controls.enableDamping = true;
function animate() {
  renderer.render(scene, camera); // Falta controls.update()
}

// ✅ BIEN
controls.enableDamping = true;
function animate() {
  controls.update(); // Requerido para damping
  renderer.render(scene, camera);
}

// ❌ MAL: No establecer límites
const controls = new OrbitControls(camera, element);
// La cámara puede moverse infinitamente

// ✅ BIEN
const controls = new OrbitControls(camera, element);
controls.minDistance = 5;
controls.maxDistance = 100;
```

### 🎨 Configuración Recomendada para Diferentes Escenarios

#### Escenario: Inspección de Modelo 3D
```typescript
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = true;
controls.enablePan = true;
controls.enableRotate = true;
controls.minDistance = 1;
controls.maxDistance = 500;
controls.dampingFactor = 0.05;
controls.enableDamping = true;
```

#### Escenario: Juego FPS
```typescript
const controls = new PointerLockControls(camera, renderer.domElement);
// Movimiento controlado por teclado
// Cámara sigue al personaje
```

#### Escenario: Videojuego de Tercera Persona
```typescript
const controls = new ThirdPersonCamera(camera, character);
controls.enableZoom = true;
controls.dampingFactor = 0.1;
```

#### Escenario: Presentación/Showcase
```typescript
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;        // Rotación automática
controls.autoRotateSpeed = 2.0;    // Velocidad de rotación
controls.enableZoom = false;        // Deshabilitar zoom
controls.enablePan = false;         // Deshabilitar pan
```

---

## 8. Referencias Rápidas

controls.update();              // Requerido después de cambios manuales
camera.lookAt(target);         // Hacer que la cámara mire un punto
controls.dollyIn/out();         // Zoom suave
controls.enableDamping = true;  // Movimiento con inercia

### Importaciones Necesarias

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
```

### Estructura Básica de Inicialización

```typescript
// 1. Crear escena y cámara
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);

// 2. Añadir controles
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 3. Posicionar cámara inicial
camera.position.set(0, 5, 10);
controls.update();

// 4. Loop de animación
function animate() {
  requestAnimationFrame(animate);
  
  // Actualizar controles (si hay damping o cambios manuales)
  controls.update();
  
  // Renderizar
  renderer.render(scene, camera);
}

animate();
```

---

## 9. Recursos Adicionales

- [Documentación Oficial Three.js - Cámaras](https://threejs.org/docs/#api/en/cameras/Camera)
- [OrbitControls Documentación](https://threejs.org/docs/#api/en/controls/OrbitControls)
- [Ejemplos Oficiales](https://threejs.org/examples/)

---

*Última actualización: 2026-10-04*
