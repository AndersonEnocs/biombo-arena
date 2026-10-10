# 📷 Implementación de Seguimiento de Cámara en Three.js

## 📋 Resumen Ejecutivo

Este documento describe la implementación del sistema de seguimiento de cámara para el biombo arena 3D. El sistema permite que la cámara siga dinámicamente las bolas mientras son extraídas del biombo y viajan por la rampa hacia los slots de visualización.

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    BIOMBO ENGINE SERVICE                      │
├─────────────────────────────────────────────────────────────┤
│  • BallEffects Array    → Bolas en trayectoria de extracción  │
│  • AgitationBallStates  → Bolas internas en agitación         │
│  • OrbitControls        → Controlador de cámara Three.js       │
│  • Animation Loop       → requestAnimationFrame                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎬 Flujo de Funcionamiento

### 1. Ciclo de Animación Principal

```typescript
animate(): void {
  // ✅ Loop principal de animación
  this.animFrameId = requestAnimationFrame(() => this.animate());
  
  const now = performance.now();
  const deltaSeconds = calculateDelta();
  
  // 🔄 Actualizar rotación del biombo
  updateDrumRotation();
  
  // ⚙️ Simular física de bolas internas
  simulateInternalBallPhysics();
  
  // 📷 SISTEMA DE SEGUIMIENTO DE CÁMARA
  updateCameraFollow();
  
  // ⚙️ Actualizar bolas extraídas en riel
  updateExtractedBallsOnTrack();
  
  // 🎨 Renderizar escena
  this.renderer.render(this.scene, this.camera);
}
```

### 2. Priorización de Objetivos de Cámara

El sistema utiliza un enfoque jerárquico para determinar el objetivo de la cámara:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRIORIDAD DE SEGUIMIENTO                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1️⃣  Bolas en Trayectoria (ballEffects)                     │
│     └─ Bolas siendo extraídas del biombo                     │
│     └─ En movimiento por la rampa                            │
│     └─ NO han llegado al slot final                          │
│                                                              │
│  2️⃣  Bolas en Agitación (agitationBallStates)               │
│     └─ Bolas internas con velocidad > 0.1                    │
│     └─ En movimiento dentro del biombo                       │
│                                                              │
│  3️⃣  Centro de Escena (Fallback)                            │
│     └─ Posición (0, 0, 0)                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementación Detallada

### Código del Sistema de Seguimiento

```typescript
// 📷 CÁMARA DE SEGUIMIENTO DE BOLAS - SISTEMA MEJORADO
if (this.camera && this.controls) {
  const targetPos = new THREE.Vector3();

  // 1️⃣ Priorizar bolas en trayectoria (ballEffects)
  if (this.ballEffects.length > 0) {
    let totalWeight = 0;
    
    this.ballEffects.forEach((anim, index) => {
      if (!anim.hasSettled) {
        // Calcular posición actual usando easing cúbico
        const easedT = anim.progress < 0.5
          ? 2 * anim.progress * anim.progress
          : 1 - Math.pow(-2 * anim.progress + 2, 2) / 2;
        
        const currentPos = anim.curve.getPointAt(easedT);
        targetPos.add(currentPos);
        totalWeight += activityScore;

        // Rastrear la bola más activa para seguimiento prioritario
        if (activityScore > maxActivityScore) {
          mostActiveBallIndex = index;
        }
      }
    });

    if (totalWeight > 0) {
      targetPos.divideScalar(totalWeight);
      
      // Offset hacia la bola más activa para seguimiento dinámico
      if (mostActiveBallIndex !== -1) {
        const mostActiveAnim = this.ballEffects[mostActiveBallIndex];
        const activePos = mostActiveAnim.curve.getPointAt(easedT);
        targetPos.add(activePos.clone().sub(targetPos).multiplyScalar(0.05));
      }
    }
  }

  // 2️⃣ Fallback a bolas en agitación
  if (targetPos.lengthSq() === 0 && this.agitationBallStates.length > 0) {
    const activeBalls: { pos: THREE.Vector3; weight: number }[] = [];

    this.agitationBallStates.forEach((ballState) => {
      const pos = ballState.mesh.position;
      const velocity = ballState.velocity;
      
      // Peso basado en velocidad
      const speedWeight = Math.min(velocity.length() / 2.0, 1.5);
      
      if (speedWeight > 0.3) {
        targetPos.add(pos);
        totalWeight += speedWeight;
        activeBalls.push({ pos, weight: speedWeight });
      }
    });

    if (totalWeight > 0) {
      targetPos.divideScalar(totalWeight);
      
      // Centrarse en la bola más rápida
      if (activeBalls.length > 1) {
        activeBalls.sort((a, b) => b.weight - a.weight);
        const fastestBall = activeBalls[0];
        targetPos.add(fastestBall.pos.clone().sub(targetPos).multiplyScalar(0.1));
      }
    }
  }

  // 3️⃣ Fallback al centro de la escena
  if (targetPos.lengthSq() === 0) {
    targetPos.set(0, 0, 0);
  }

  // 🎯 TRANSICIÓN DE CÁMARA INTELIGENTE
  const cameraTarget = this.controls.target;
  const distanceToTarget = targetPos.distanceTo(cameraTarget);
  
  // Ajustar factor de lerp dinámicamente
  let lerpFactor = 0.1;
  
  if (distanceToTarget > 5) {
    // Transición lenta cuando hay distancia significativa
    lerpFactor = Math.min(0.15, 0.05 + (distanceToTarget / 200));
  } else if (distanceToTarget < 1) {
    // Respuesta rápida cuando ya está cerca
    lerpFactor = Math.max(0.08, 0.2 - distanceToTarget * 0.1);
  }

  // Aplicar interpolación con factor dinámico
  this.controls.target.lerp(targetPos, lerpFactor);
  this.controls.update();
}
```

---

## 📐 Matemáticas del Sistema

### Interpolación Lineal (LERP)

La interpolación lineal se utiliza para suavizar el movimiento de la cámara:

$$\text{targetPos}_{new} = \text{targetPos}_{old} + (\text{desiredPos} - \text{targetPos}_{old}) \times \alpha$$

Donde:
- $\alpha$ es el factor de interpolación (0.0 a 1.0)
- Un valor bajo de $\alpha$ produce movimiento más lento y suave
- Un valor alto de $\alpha$ produce movimiento más rápido y directo

### Cálculo del Factor Dinámico

$$\alpha = \begin{cases} 
0.05 + \frac{\text{distance}}{200} & \text{si } \text{distance} > 5 \\
0.2 - \text{distance} \times 0.1 & \text{si } \text{distance} < 1 \\
0.1 & \text{caso default}
\end{cases}$$

### Easing Cúbico para Trayectorias de Bolas

Para obtener posiciones suaves en las trayectorias de las bolas:

$$t_{eased} = \begin{cases} 
2t^2 & \text{si } t < 0.5 \\
1 - \frac{(2-2t)^2}{2} & \text{si } t \geq 0.5
\end{cases}$$

---

## 🎨 Configuración de Three.js

### OrbitControls

Three.js utiliza `OrbitControls` para controlar la cámara:

```typescript
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;      // Activar inercia
controls.dampingFactor = 0.1;      // Factor de amortiguación
controls.minDistance = 5;          // Distancia mínima de la cámara
controls.maxDistance = 50;         // Distancia máxima de la cámara
controls.enablePan = false;        // Desactivar pan (la cámara sigue las bolas)
controls.autoRotate = false;       // No rotar automáticamente
```

### Cámara Principal

```typescript
const camera = new THREE.PerspectiveCamera(
  75,                                    // Campo de visión FOV
  width / height,                       // Aspect ratio
  0.1,                                  // Plano cercano
  1000                                 // Plano lejano
);

camera.position.set(0, 5, 10);          // Posición inicial
camera.lookAt(0, 0, 0);                 // Mirar al centro
```

---

## 🔄 Ciclo de Vida de las Bolas

### Estados de una Bola

```typescript
type BallEffects = {
  mesh: THREE.Mesh;                    // Malla 3D de la bola
  startAt: number;                     // Timestamp de inicio
  duration: number;                    // Duración total (ms)
  curve: THREE.CatmullRomCurve3;      // Trayectoria definida por puntos
  targetSlotPos: THREE.Vector3;       // Posición final en el slot
  ballNumber: number;                 // Número de la bola
  hasSettled: boolean;                 // Si ha llegado al destino
  progress: number;                    // Progreso (0 a 1)
}
```

### Progresión de una Bola

```
Tiempo →
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  0% ──► Bola sale del biombo                                  │
│         │                                                      │
│         ▼                                                      │
│  20% ──► Bola entra en rampa                                   │
│         │                                                      │
│         ▼                                                      │
│  50% ──► Bola en punto medio (máxima actividad)               │
│         │                                                      │
│         ▼                                                      │
│  80% ──► Bola cerca del slot                                   │
│         │                                                      │
│         ▼                                                      │
│ 100% ──► Bola llega al slot (hasSettled = true)               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Estrategias de Optimización

### 1. Cálculo Eficiente de Posiciones

- **Reutilizar Vector3**: Crear instancias de `THREE.Vector3` fuera del loop para evitar allocations
- **Early Exit**: Salir del loop si no hay bolas activas
- **Ponderación Inteligente**: Usar weights para priorizar bolas más activas

### 2. Interpolación Dinámica

El factor de lerp se ajusta automáticamente:
- **Lejos**: Factor bajo (0.05-0.1) para transición suave
- **Cerca**: Factor alto (0.15-0.2) para respuesta rápida
- **Distancia media**: Factor intermedio (0.1)

### 3. Gestión de Memoria

```typescript
// Limpiar bolas que han llegado al destino
if (anim.hasSettled) {
  this.scene?.remove(anim.mesh);
  anim.mesh.geometry?.dispose();
  if (Array.isArray(anim.mesh.material)) {
    anim.mesh.material.forEach((mat) => mat.dispose());
  } else {
    anim.mesh.material?.dispose();
  }
}
```

---

## 🧪 Pruebas y Validación

### Escenarios de Prueba

| Escenario | Descripción | Comportamiento Esperado |
|-----------|-------------|------------------------|
| **Sole** | Una sola bola siendo extraída | Cámara sigue la bola individualmente |
| **Multiple** | Múltiples bolas en trayectoria | Cámara centra el grupo de bolas |
| **Agitation** | Bolas internas en movimiento | Cámara sigue las bolas más rápidas |
| **Idle** | Sin bolas activas | Cámara en posición central (0, 0, 0) |
| **Transition** | Cambio entre estados | Transición suave sin saltos bruscos |

### Métricas de Rendimiento

- **FPS Objetivo**: 60 FPS
- **Latencia de Seguimiento**: < 100ms
- **Suavizado**: Sin artefactos visuales
- **Memoria**: < 50MB por bola activa

---

## 📚 Referencias Técnicas

### Three.js Documentation

- [OrbitControls](https://threejs.org/docs/#api/en/controls/OrbitControls)
- [CatmullRomCurve3](https://threejs.org/docs/#api/en/curves/CatmullRomCurve3)
- [Vector3.lerp()](https://threejs.org/docs/#api/en/math/Vector3.lerp)

### Métodos Three.js Utilizados

| Método | Propósito |
|--------|-----------|
| `curve.getPointAt(t)` | Obtener posición en curva |
| `vector.lerp(target, alpha)` | Interpolación lineal |
| `controls.target` | Punto de mira de la cámara |
| `controls.update()` | Actualizar controles |

---

## 🔮 Mejoras Futuras

### Posibles Extensiones

1. **Zoom Dinámico**: Ajustar el campo de visión basado en distancia a las bolas
2. **Suavizado de Giro**: Rotación adicional de la cámara para seguir el movimiento lateral
3. **Predicción de Trayectoria**: Anticipar dónde irán las bolas antes de que lleguen
4. **Modo Cinemático**: Transiciones dramáticas para momentos clave del juego

### Consideraciones de Diseño

- **Accesibilidad**: Asegurar que la cámara no se mueva demasiado rápido para usuarios con sensibilidad motora reducida
- **Consistencia**: Mantener comportamiento predecible entre diferentes configuraciones de hardware
- **Rendimiento**: Optimizar para dispositivos móviles y sistemas con recursos limitados

---

## 📝 Notas de Versión

### v2.0 - Sistema Mejorado

**Fecha**: 2025-06-18

**Cambios**:
- ✅ Implementación dinámica del factor de lerp
- ✅ Priorización de bolas más activas
- ✅ Offset inteligente hacia la bola más activa
- ✅ Gestión ponderada de múltiples bolas
- ✅ Fallback mejorado para bolas en agitación

**Mejoras de Rendimiento**:
- Reducción de cálculos innecesarios
- Optimización del loop de animación
- Mejor gestión de memoria

---

## 📞 Soporte y Contacto

Para reportar problemas o solicitar mejoras:
- Issue Tracker: [GitHub Issues](https://github.com/your-repo/issues)
- Email: support@biombo-arena.com

---

*Documento generado automáticamente por el sistema de documentación del Biombo Arena*
