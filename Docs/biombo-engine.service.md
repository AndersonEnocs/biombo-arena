# Documentación de BiomboEngineService

## Descripción General

`BiomboEngineService` es un servicio Angular que gestiona la lógica completa de simulación de máquinas de biombo (lotería) utilizando Three.js y Rapier para física. Controla múltiples máquinas (hasta 4), incluyendo animaciones, extracción de bolas, cambios de fondo y sincronización entre máquinas.

---

## Clase Principal: `BiomboEngineService`

### Descripción

Servicio inyectable que inicializa y gestiona simulaciones de biombo con renderizado 3D, física realista y múltiples configuraciones de máquinas. Proporciona control sobre el estado de la simulación, extracción de bolas y gestión de animaciones.

---

## Propiedades Públicas

### `isReady`

**Tipo:** `Signal<boolean>`

Indica si el servicio ha sido inicializado correctamente y está listo para operar.

**Valor inicial:** `false`

**Ejemplo de uso:**
```typescript
if (engine.isReady()) {
  engine.play();
} else {
  console.log('El servicio aún no está listo');
}
```

---

### `errorMessage`

**Tipo:** `Signal<string | null>`

Contiene el último mensaje de error ocurrido durante la inicialización o operación.

**Valor inicial:** `null`

**Ejemplo de uso:**
```typescript
if (engine.errorMessage()) {
  console.error(`Error: ${engine.errorMessage()}`);
}
```

---

### `backgroundError`

**Tipo:** `Signal<string | null>`

Mensaje de error específico relacionado con el cambio de fondo.

**Valor inicial:** `null`

---

### `backgroundName`

**Tipo:** `Signal<string>`

Nombre del fondo actual cargado en la escena.

**Valor inicial:** `'Pasillo clásico'`

**Ejemplo de uso:**
```typescript
console.log(`Fondo actual: ${engine.backgroundName()}`);
```

---

### `isChangingBackground`

**Tipo:** `Signal<boolean>`

Indica si se está ejecutando una transición de fondo.

**Valor inicial:** `false`

---

### `extractedBalls`

**Tipo:** `Signal<number[]>`

Array de números de bolas extraídas en la máquina principal.

**Valor inicial:** `[]`

**Ejemplo de uso:**
```typescript
const balls = engine.extractedBalls();
console.log(`Bolas extraídas: ${balls.join(', ')}`);
```

---

### `state`

**Tipo:** `Signal<BiomboState>`

Estado actual de la máquina principal. Valores posibles: `'IDLE'`, `'SHUFFLING'`, `'PICKING'`, `'FINISHED'`.

**Valor inicial:** `'IDLE'`

---

### `secondaryExtractedBalls`

**Tipo:** `Signal<number[]>`

Array de números de bolas extraídas en la máquina secundaria.

**Valor inicial:** `[]`

---

### `secondaryState`

**Tipo:** `Signal<BiomboState>`

Estado actual de la máquina secundaria.

**Valor inicial:** `'IDLE'`

---

### `tertiaryExtractedBalls`

**Tipo:** `Signal<number[]>`

Array de números de bolas extraídas en la máquina terciaria.

**Valor inicial:** `[]`

---

### `tertiaryState`

**Tipo:** `Signal<BiomboState>`

Estado actual de la máquina terciaria.

**Valor inicial:** `'IDLE'`

---

### `quaternaryExtractedBalls`

**Tipo:** `Signal<number[]>`

Array de números de bolas extraídas en la máquina cuaternaria.

**Valor inicial:** `[]`

---

### `quaternaryState`

**Tipo:** `Signal<BiomboState>`

Estado actual de la máquina cuaternaria.

**Valor inicial:** `'IDLE'`

---

## Métodos Públicos

### `initialize(container, config, secondaryConfig?, tertiaryConfig?, quaternaryConfig?)`

**Descripción:** Inicializa el servicio y crea la escena 3D con todas las máquinas configuradas.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `container` | `HTMLElement` | Elemento DOM donde se renderizará el canvas WebGL |
| `config` | `BiomboConfig` | Configuración de la máquina principal |
| `secondaryConfig` | `BiomboConfig \| null` | Configuración opcional de la segunda máquina |
| `tertiaryConfig` | `BiomboConfig \| null` | Configuración opcional de la tercera máquina |
| `quaternaryConfig` | `BiomboConfig \| null` | Configuración opcional de la cuarta máquina |

**Retorno:** `Promise<void>`

**Ejemplo de uso:**
```typescript
const engine = inject(BiomboEngineService);

const config: BiomboConfig = {
  id: 'main',
  ballType: 'yellow',
  numberOfBalls: 90,
};

await engine.initialize(
  document.getElementById('biombo-container')!,
  config,
  null, // Sin segunda máquina
  null, // Sin tercera máquina
  null  // Sin cuarta máquina
);

console.log(`Servicio listo: ${engine.isReady()}`);
```

**Edge Cases y Manejo de Errores:**

- Si `container` no tiene dimensiones válidas, se usan `window.innerWidth/Height`
- Si WebGL 2 no está disponible, se lanza `Error('WebGL 2 no está disponible...')`
- Si falla la carga de modelos 3D, el error se captura en `errorMessage` y se re-lanza

**Complejidad:**
- Tiempo: O(n) donde n es el número de modelos a cargar
- Espacio: O(n) para almacenar las mallas 3D

---

### `changeBackground(direction)`

**Descripción:** Cambia el fondo de la escena en la dirección especificada.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `direction` | `-1 \| 1` | `-1` para anterior, `1` para siguiente |

**Retorno:** `Promise<void>`

**Ejemplo de uso:**
```typescript
// Cambiar al siguiente fondo
await engine.changeBackground(1);

// Cambiar al fondo anterior
await engine.changeBackground(-1);

// Verificar estado del cambio
console.log(`Cambiando fondo: ${engine.isChangingBackground()}`);
console.log(`Nombre del nuevo fondo: ${engine.backgroundName()}`);
```

**Edge Cases y Manejo de Errores:**

- Si `isChangingBackground()` es `true`, la función retorna inmediatamente (evita cambios duplicados)
- Si el índice calculado coincide con el actual, no se realiza el cambio
- Errores de carga de textura se capturan en `backgroundError`
- La textura anterior se libera correctamente para evitar fugas de memoria

**Complejidad:**
- Tiempo: O(1) - carga asíncrona de textura
- Espacio: O(1)

---

### `setSecondaryConfig(config)`

**Descripción:** Configura o deshabilita la máquina secundaria.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `config` | `BiomboConfig \| null` | Configuración de la segunda máquina o `null` para deshabilitarla |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Habilitar segunda máquina
engine.setSecondaryConfig({
  id: 'secondary',
  ballType: 'red',
  numberOfBalls: 80,
});

// Deshabilitar segunda máquina
engine.setSecondaryConfig(null);
```

**Edge Cases y Manejo de Errores:**

- Si no está listo (`isReady()`), la función retorna inmediatamente
- Si `config` es `null`, se limpia toda la máquina secundaria
- Si el ID coincide con el actual, solo se actualiza la configuración
- Se liberan recursos previos para evitar fugas de memoria

**Complejidad:**
- Tiempo: O(n) donde n es el número de mallas a clonar/limpiar
- Espacio: O(n) para la nueva máquina

---

### `setTertiaryConfig(config)`

**Descripción:** Configura o deshabilita la máquina terciaria.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `config` | `BiomboConfig \| null` | Configuración de la tercera máquina o `null` para deshabilitarla |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Habilitar tercera máquina
engine.setTertiaryConfig({
  id: 'tertiary',
  ballType: 'blue',
  numberOfBalls: 70,
});
```

**Edge Cases y Manejo de Errores:**

- Similar a `setSecondaryConfig` pero para la tercera máquina
- Se clona la máquina principal con modificaciones de color (rojo)

**Complejidad:**
- Tiempo: O(n)
- Espacio: O(n)

---

### `setQuaternaryConfig(config)`

**Descripción:** Configura o deshabilita la máquina cuaternaria.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `config` | `BiomboConfig \| null` | Configuración de la cuarta máquina o `null` para deshabilitarla |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Habilitar cuarta máquina
engine.setQuaternaryConfig({
  id: 'quaternary',
  ballType: 'green',
  numberOfBalls: 60,
});
```

**Edge Cases y Manejo de Errores:**

- Similar a las máquinas anteriores pero con color azul
- Se clona la máquina principal con modificaciones específicas

**Complejidad:**
- Tiempo: O(n)
- Espacio: O(n)

---

### `canStartRound()`

**Descripción:** Verifica si se puede iniciar una nueva ronda de extracción.

**Parámetros:** N/A

**Retorno:** `boolean`

**Ejemplo de uso:**
```typescript
if (engine.canStartRound()) {
  engine.play();
} else {
  console.log('No se puede iniciar la ronda');
}
```

**Lógica:** Retorna `true` solo si todas las máquinas están en estado `'IDLE'` o `'FINISHED'`.

**Complejidad:**
- Tiempo: O(m) donde m es el número de máquinas (1-4)
- Espacio: O(1)

---

### `isRoundFinished()`

**Descripción:** Verifica si todas las máquinas han terminado sus extracciones.

**Parámetros:** N/A

**Retorno:** `boolean`

**Ejemplo de uso:**
```typescript
if (engine.isRoundFinished()) {
  console.log('Todas las máquinas han terminado');
  // Mostrar resultados finales
}
```

**Complejidad:**
- Tiempo: O(m) donde m es el número de máquinas
- Espacio: O(1)

---

### `play()`

**Descripción:** Inicia una ronda completa de extracción en todas las máquinas activas.

**Parámetros:** N/A

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Verificar condiciones antes de jugar
if (engine.canStartRound()) {
  engine.play();
  
  // Observar el estado cambiando
  console.log(`Estado: ${engine.state()}`);
}
```

**Lógica:**
1. Limpia todos los timers y efectos anteriores
2. Establece estado a `'SHUFFLING'`
3. Inicia la secuencia de extracción para cada máquina activa
4. Cada bola se extrae con un delay de 2.4 segundos
5. Al final de la secuencia, cambia a estado `'FINISHED'` después de 2.2 segundos

**Edge Cases y Manejo de Errores:**

- Si no hay configuración (`config`) o no está listo, retorna inmediatamente
- Si no se puede iniciar la ronda (`canStartRound()`), retorna sin hacer nada
- Los timers se gestionan correctamente para evitar acumulación

**Complejidad:**
- Tiempo: O(k) donde k es el número de bolas a extraer
- Espacio: O(k) para los efectos de animación

---

### `resize(width, height)`

**Descripción:** Ajusta el tamaño del renderer y la cámara al nuevo tamaño del contenedor.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `width` | `number` | Nuevo ancho en píxeles |
| `height` | `number` | Nuevo alto en píxeles |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
window.addEventListener('resize', () => {
  const container = document.getElementById('biombo-container');
  if (container) {
    engine.resize(container.clientWidth, container.clientHeight);
  }
});
```

**Edge Cases y Manejo de Errores:**

- Si `height` es 0 o negativo, no se realiza el redimensionamiento
- Se llama internamente a `updateSceneLayout` para ajustar posiciones relativas
- Detecta automáticamente orientación (portrait/landscape) para ajustar layout

**Complejidad:**
- Tiempo: O(1)
- Espacio: O(1)

---

### `destroy()`

**Descripción:** Limpia todos los recursos y libera la memoria.

**Parámetros:** N/A

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// En el destructor del componente o al desmontar
onDestroy() {
  engine.destroy();
}
```

**Lógica:**
1. Limpia todos los timers (principal, secundaria, terciaria, cuaternaria)
2. Cancela la animación requestAnimationFrame
3. Libera el renderer WebGL
4. Libera las texturas de fondo
5. Limpia todos los efectos de animación de bolas

**Edge Cases y Manejo de Errores:**

- Maneja correctamente la liberación de múltiples texturas
- Asegura que no queden timers pendientes que puedan causar errores
- Libera geometría y materiales de las bolas extraídas

**Complejidad:**
- Tiempo: O(n) donde n es el número de recursos a liberar
- Espacio: O(1) después de la limpieza

---

## Métodos Privados

### `loadBackgroundTexture(folder)`

**Descripción:** Carga una textura de cubo para el fondo desde los assets.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `folder` | `string` | Carpeta del skybox (ej: 'hallway', 'office') |

**Retorno:** `Promise<THREE.CubeTexture>`

**Ejemplo de uso:**
```typescript
const texture = await engine['loadBackgroundTexture']('hallway');
```

**Edge Cases y Manejo de Errores:**

- Si falla la carga, se lanza el error al promise reject
- La textura se configura con `SRGBColorSpace` para colores correctos

**Complejidad:**
- Tiempo: O(1) - carga asíncrona
- Espacio: O(1)

---

### `setLotteryTableColor(root, color)`

**Descripción:** Aplica un color específico a la mesa de madera de una máquina.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `root` | `THREE.Object3D` | Grupo raíz de la máquina |
| `color` | `number` | Color hexadecimal (ej: 0xf4f4f0) |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en createSecondaryRig, createTertiaryRig, etc.
```

**Edge Cases y Manejo de Errores:**

- Si no encuentra el objeto 'table' en el root, lanza error
- Maneja materiales array o single material
- Aplica `castShadow` y `receiveShadow` a todas las mallas

**Complejidad:**
- Tiempo: O(n) donde n es el número de mallas en la mesa
- Espacio: O(1)

---

### `updateSceneLayout(width, height)`

**Descripción:** Ajusta la posición y escala de todas las máquinas según el tamaño del viewport.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `width` | `number` | Ancho del viewport |
| `height` | `number` | Alto del viewport |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente después de inicializar o cambiar configuración
```

**Lógica:**
- Detecta orientación (portrait si width < height)
- Ajusta escala según el número de máquinas activas:
  - Sin máquinas: escala 1.0
  - Con secundaria: escala 0.42/0.62
  - Con terciaria: escala 0.34/0.42
  - Con cuaternaria: escala 0.26/0.3
- Posiciona cada máquina en coordenadas diferentes según layout

**Edge Cases y Manejo de Errores:**

- Si no hay cámara o root, retorna inmediatamente
- Usa separaciones diferentes para portrait vs landscape

**Complejidad:**
- Tiempo: O(1)
- Espacio: O(1)

---

### `arrangeBallsNaturally()`

**Descripción:** Posiciona las bolas de agitación de forma natural en el interior del biombo.

**Parámetros:** N/A

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en initialize()
```

**Lógica:**
1. Calcula el centro Y del "bowl" (base de las bolas)
2. Distribuye las bolas en capas concéntricas
3. Aplica curvatura para simular gravedad
4. Realiza optimización por fuerza bruta para evitar superposiciones
5. Ajusta posiciones finales según la curvatura del bowl

**Edge Cases y Manejo de Errores:**

- Si no hay bolas de agitación, retorna inmediatamente
- Usa iteraciones (25) para optimizar posiciones
- Calcula distancia mínima entre bolas para evitar colisiones

**Complejidad:**
- Tiempo: O(n²) donde n es el número de bolas (24)
- Espacio: O(n) para almacenar posiciones

---

### `buildDrumPivot(hollow)`

**Descripción:** Construye el pivote de rotación del tambor.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `hollow` | `SolidEntity` | Entidad que contiene la esfera hueca |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en initialize()
```

**Lógica:**
1. Crea un grupo pivot llamado 'sphere-rotation-pivot'
2. Calcula el centro de las mallas de la esfera hueca
3. Ajusta la posición para centrar la rotación
4. Añade al machineRoot

**Complejidad:**
- Tiempo: O(m) donde m es el número de mallas en hollow
- Espacio: O(1)

---

### `buildMainRotationShaft()`

**Descripción:** Construye el eje principal de rotación del biombo.

**Parámetros:** N/A

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en initialize()
```

**Lógica:**
1. Crea cilindro principal (eje central)
2. Añade collares en posiciones específicas
3. Crea soportes de rodamiento en ambos lados
4. Configura materiales metálicos realistas

**Complejidad:**
- Tiempo: O(1) - crea un número fijo de objetos
- Espacio: O(1)

---

### `buildInternalMechanism()`

**Descripción:** Construye el mecanismo interno del biombo con tubos y soportes.

**Parámetros:** N/A

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en initialize()
```

**Lógica:**
1. Crea hub central con cilindro y tapa esférica
2. Añade 3 tubos radiales distribuidos equidistantemente
3. Crea tubo circular para soporte adicional
4. Establece renderOrder para orden de dibujo correcto
5. Prepara grupo para bolas de agitación

**Complejidad:**
- Tiempo: O(1) - crea un número fijo de objetos
- Espacio: O(1)

---

### `buildInternalSupportTripod(hollowMesh)`

**Descripción:** Construye el trípode de soporte interno.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `hollowMesh` | `THREE.Mesh` | Malla de la esfera hueca (padre del trípode) |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en buildInternalMechanism()
```

**Lógica:**
1. Crea grupo trípode con renderOrder 4
2. Crea acoplador central para el eje
3. Para cada uno de los 3 puntos:
   - Calcula ángulo (120° entre cada uno)
   - Crea varilla que conecta centro con punto de anclaje
   - Orienta correctamente la varilla
   - Añade esfera de anclaje

**Complejidad:**
- Tiempo: O(1) - siempre crea 3 varillas
- Espacio: O(1)

---

### `buildAgitationBalls()`

**Descripción:** Construye y posiciona las bolas de agitación.

**Parámetros:** N/A

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en buildInternalMechanism()
```

**Lógica:**
1. Limpia bolas anteriores si existen
2. Para cada una de las 24 bolas:
   - Crea malla esférica con número
   - Aplica material con textura del número
   - Posiciona en el grupo de bolas
   - Configura propiedades de sombra
3. Establece estados iniciales para animación

**Complejidad:**
- Tiempo: O(n) donde n = 24 (número fijo de bolas)
- Espacio: O(n)

---

### `applyAgitationBallAppearance(balls, config)`

**Descripción:** Aplica apariencia (colores y números) a las bolas de agitación.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `balls` | `THREE.Mesh[]` | Array de mallas de bolas |
| `config` | `BiomboConfig` | Configuración con tipo de bola y colores |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en createSecondaryRig, etc.
```

**Lógica:**
1. Para cada bola:
   - Obtiene número desde userData
   - Crea material con textura del número
   - Usa paleta de colores según tipo de bola (yellow/red/blue/green)

**Complejidad:**
- Tiempo: O(n) donde n es el número de bolas
- Espacio: O(1)

---

### `createNumberedBallMesh(value, config, radius)`

**Descripción:** Crea una malla esférica con número.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `value` | `number` | Número a mostrar en la bola (1-90) |
| `config` | `BiomboConfig` | Configuración del biombo |
| `radius` | `number` | Radio de la esfera (0.92) |

**Retorno:** `THREE.Mesh`

**Ejemplo de uso:**
```typescript
const ball = engine['createNumberedBallMesh'](42, config, 0.92);
```

**Lógica:**
1. Crea geometría esférica (32 segmentos)
2. Crea material con textura del número
3. Retorna la malla resultante

**Complejidad:**
- Tiempo: O(1)
- Espacio: O(1)

---

### `createNumberedBallMaterial(value, config)`

**Descripción:** Crea material para una bola numerada.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `value` | `number` | Número de la bola |
| `config` | `BiomboConfig` | Configuración con colores por tipo |

**Retorno:** `THREE.MeshStandardMaterial`

**Ejemplo de uso:**
```typescript
const material = engine['createNumberedBallMaterial'](15, config);
```

**Lógica:**
1. Crea mapa de textura con el número
2. Configura roughness 0.15 para acabado semibrillante
3. Configura metalness 0.1 para reflejos suaves

**Complejidad:**
- Tiempo: O(1)
- Espacio: O(1)

---

### `createBallNumberTexture(value, config)`

**Descripción:** Crea textura canvas con el número de la bola.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `value` | `number` | Número a mostrar |
| `config` | `BiomboConfig` | Configuración con tipo de bola |

**Retorno:** `THREE.CanvasTexture`

**Ejemplo de uso:**
```typescript
const texture = engine['createBallNumberTexture'](7, config);
```

**Lógica:**
1. Crea canvas 256x256
2. Llena con color base (amarillo para yellow balls, paleta según número)
3. Dibuja círculo blanco central
4. Escribe el número en negro
5. Añade barra inferior para números especiales (6, 9, 66, etc.)

**Edge Cases:**

- Números con doble dígito tienen barra decorativa
- Colores alternan según paleta para yellow balls

**Complejidad:**
- Tiempo: O(1)
- Espacio: O(1)

---

### `spawnBallExitThroughBottom(ballNumber, index, config, machineRoot, agitationBalls)`

**Descripción:** Crea animación de bola saliendo por la parte inferior del biombo.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `ballNumber` | `number` | Número de la bola a extraer |
| `index` | `number` | Índice en la secuencia de extracción |
| `config` | `BiomboConfig` | Configuración del biombo |
| `machineRoot` | `THREE.Group` | Root de la máquina |
| `agitationBalls` | `THREE.Mesh[]` | Array de bolas de agitación |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en startRound()
```

**Lógica:**
1. Crea bola con número y material
2. Marca como 'isDrawnBall'
3. Calcula posición final según índice (espaciado de 2.15)
4. Aplica curvatura a rampa (slopeY: 0.072, slopeZ: 0.015)
5. Crea curva CatmullRom con puntos:
   - Inicio en (-8.2, 0.2)
   - Caída inicial
   - Entrada en rampa
   - Punto medio de rampa
   - Posición final calculada
6. Añade bola al machineRoot
7. Oculta bola de agitación correspondiente
8. Inicia animación con duración 1.85s

**Complejidad:**
- Tiempo: O(1)
- Espacio: O(1)

---

### `clearTimers()`, `clearSecondaryTimers()`, `clearTertiaryTimers()`, `clearQuaternaryTimers()`

**Descripción:** Limpian los timers de extracción de bolas.

**Parámetros:** N/A para todos

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en play()
engine.clearTimers();
engine.clearSecondaryTimers();
engine.clearTertiaryTimers();
engine.clearQuaternaryTimers();
```

**Lógica:**
- Itera sobre array de timers
- Llama a `window.clearTimeout()` para cada uno
- Limpia el array y actualiza referencia en rig correspondiente

**Complejidad:**
- Tiempo: O(n) donde n es número de timers activos
- Espacio: O(1)

---

### `clearBallEffects(machineRoot?)`

**Descripción:** Limpia efectos de animación de bolas saliendo.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `machineRoot` | `THREE.Group \| undefined` | Root de máquina específica (opcional) |

**Retorno:** `void`

**Ejemplo de uso:**
```typescript
// Se llama internamente en play() y destroy()
engine.clearBallEffects();
```

**Lógica:**
1. Si se proporciona machineRoot, solo limpia efectos de esa máquina
2. Para cada efecto:
   - Remueve malla del padre
   - Libera geometría
   - Libera materiales (array o single)
3. Reanuda visibilidad de todas las bolas de agitación
4. Actualiza arrays de efectos

**Complejidad:**
- Tiempo: O(n) donde n es número de efectos activos
- Espacio: O(1)

---

## Tipos Internos

### `BallExitAnimation`

**Descripción:** Objeto que representa una animación de bola saliendo del biombo.

**Propiedades:**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `mesh` | `THREE.Mesh` | Malla de la bola en animación |
| `startAt` | `number` | Timestamp de inicio (performance.now()) |
| `duration` | `number` | Duración en segundos (1.85) |
| `curve` | `THREE.CatmullRomCurve3` | Curva de trayectoria |
| `targetSlotPos` | `THREE.Vector3` | Posición final en la ranura |
| `ballNumber` | `number` | Número de la bola |
| `hasSettled` | `boolean` | Si ha completado la animación |
| `startRotZ/Y/X`? | `number \| undefined` | Rotaciones iniciales |
| `targetRotZ`? | `number \| undefined` | Rotación objetivo Z |

---

### `AgitationBallState`

**Descripción:** Estado de una bola de agitación durante la simulación.

**Propiedades:**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `mesh` | `THREE.Mesh` | Malla de la bola |
| `velocity` | `THREE.Vector3` | Vector de velocidad actual |
| `phase` | `number` | Fase de animación (para oscilación) |
| `radius` | `number` | Radio de la bola (0.92) |

---

### `SecondaryBiomboRig` / `TertiaryBiomboRig` / `QuaternaryBiomboRig`

**Descripción:** Tipo para rigs secundarios, terciarios y cuaternarios.

**Propiedades:**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `config` | `BiomboConfig` | Configuración de la máquina |
| `root` | `THREE.Group` | Grupo raíz clonado |
| `drumGroup` | `THREE.Group` | Grupo del tambor |
| `rotationShaftGroup` | `THREE.Group` | Grupo del eje de rotación |
| `mechanismGroup` | `THREE.Group` | Grupo del mecanismo interno |
| `agitationBalls` | `THREE.Mesh[]` | Array de bolas de agitación |
| `agitationBallStates` | `AgitationBallState[]` | Estados de las bolas |
| `drawTimers` | `number[]` | Timers de extracción |
| `mainRotationAngle` | `number` | Ángulo de rotación principal |
| `mechanismBias` | `number` | Sesgo del mecanismo |

---

## Valores Constantes

### `shuffleDurationMs`

**Valor:** `8000`

Duración en milisegundos de la fase de mezcla antes de empezar a extraer bolas.

---

### `rotationCenter`

**Valor:** `new THREE.Vector3(0, 0, 0)`

Punto central de rotación del biombo.

---

### `agitationPalette`

**Valor:** Array de 8 colores hexadecimales

Paleta de colores para bolas de agitación:
- Cyan (0x00d2ff)
- Amarillo (0xffd200)
- Rosa (0xff3b6f)
- Verde (0x00e676)
- Blanco (0xffffff)
- Morado (0x9c27b0)
- Naranja (0xff9100)
- Azul (0x3d5afe)

---

## Flujo de Ejecución Típico

```typescript
// 1. Inicialización
const engine = inject(BiomboEngineService);
await engine.initialize(container, config);

// 2. Configurar máquinas adicionales (opcional)
engine.setSecondaryConfig(secondaryConfig);
engine.setTertiaryConfig(tertiaryConfig);
engine.setQuaternaryConfig(quaternaryConfig);

// 3. Cambiar fondo si es necesario
await engine.changeBackground(1);

// 4. Verificar estado y jugar
if (engine.canStartRound()) {
  engine.play();
}

// 5. Observar resultados
const balls = engine.extractedBalls();
console.log(`Bolas: ${balls.join(', ')}`);

// 6. Esperar a que termine
while (!engine.isRoundFinished()) {
  // Esperar...
}

// 7. Limpiar recursos
engine.destroy();
```

---

## Consideraciones de Rendimiento

### Gestión de Memoria

- Todas las texturas se liberan al cambiar de fondo
- Las bolas extraídas se eliminan del árbol de escena
- Los timers se limpian antes de iniciar nueva ronda
- La geometría y materiales se liberan en `clearBallEffects`

### Optimizaciones

- Uso de `requestAnimationFrame` para animación suave
- Reutilización de objetos donde es posible
- Cálculos de física solo cuando es necesario (`isAgitating`)
- RenderOrder configurado para optimizar orden de dibujo

---

## Manejo de Errores

### Errores Comunes

1. **WebGL no disponible:**
   ```typescript
   Error: 'WebGL 2 no está disponible en este navegador...'
   ```

2. **Modelos 3D fallan al cargar:**
   ```typescript
   Error: 'Error al cargar modelos'
   ```

3. **Fallo al cambiar fondo:**
   ```typescript
   Error: 'No se pudo cambiar el fondo: {mensaje}'
   ```

4. **Máquinas sin objetos requeridos:**
   ```typescript
   Error: 'No se encontró la mesa de madera en ornaments.fbx.'
   ```

### Captura de Errores

- Todos los errores críticos se capturan en `errorMessage` o `backgroundError`
- Los errores de inicialización se re-lanzan para detener el flujo
- Los errores de operación (como cambiar fondo) se loguean pero no detienen la aplicación

---

## Complejidad Computacional

| Operación | Complejidad Temporal | Complejidad Espacial |
|-----------|----------------------|----------------------|
| `initialize()` | O(n) - n modelos | O(n) - mallas 3D |
| `changeBackground()` | O(1) + carga textura | O(1) |
| `play()` | O(k) - k bolas | O(k) - efectos |
| `arrangeBallsNaturally()` | O(n²) - n=24 bolas | O(n) |
| `spawnBallExitThroughBottom()` | O(1) | O(1) |
| `destroy()` | O(n) - recursos | O(1) después |

---

## Notas Finales

- Este servicio está diseñado para funcionar con Angular Signals para reactividad
- Usa Three.js para renderizado 3D y Rapier para física (si está disponible)
- Soporta hasta 4 máquinas biombo simultáneas
- Optimizado para rendimiento en navegadores modernos con WebGL 2
- Todos los métodos públicos están documentados; los privados son de uso interno
