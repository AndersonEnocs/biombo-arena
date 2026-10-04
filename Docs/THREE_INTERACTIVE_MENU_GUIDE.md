# Guía de Menús Interactivos en Three.js

## Introducción

Esta guía explica cómo crear menús interactivos en Three.js para tu proyecto biombo-arena. Los menús interactivos permiten superponer elementos de interfaz de usuario (UI) sobre la escena 3D, creando experiencias inmersivas y funcionales.

---

## Técnicas Principales

Three.js ofrece varias técnicas para crear UI interactiva:

1. **Canvas Blending** - Superposición de canvas HTML
2. **HTMLMesh** - Elementos HTML directamente en la escena 3D
3. **InteractionManager** - Gestión de eventos de UI
4. **Raycasting** - Detección de clics en elementos UI

---

## 1. Canvas Blending (Técnica Recomendada)

El método más común y compatible para superponer UI sobre la escena 3D.

### Conceptos Clave

- **Canvas**: Elemento HTML `<canvas>` que se renderiza sobre el canvas de Three.js
- **Blending**: Configuración de mezcla de colores para transparencia
- **Eventos**: Captura de eventos del DOM (click, mousemove)

### Ejemplo Básico: Menú Simple

```typescript
import * as THREE from 'three';

// 1. Crear canvas overlay
const overlayCanvas = document.createElement('canvas');
overlayCanvas.width = window.innerWidth;
overlayCanvas.height = window.innerHeight;

// 2. Configurar blending para transparencia
const canvasContext = overlayCanvas.getContext('2d');
canvasContext.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Fondo semitransparente
canvasContext.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

// 3. Crear elementos UI (botones, texto)
const menuContainer = document.createElement('div');
menuContainer.style.position = 'absolute';
menuContainer.style.top = '20px';
menuContainer.style.left = '20px';
menuContainer.style.zIndex = '1000';

const button = document.createElement('button');
button.textContent = 'Pausar';
button.style.position = 'absolute';
button.style.top = '20px';
button.style.left = '20px';
button.style.padding = '10px 20px';
button.style.background = '#ff6b6b';
button.style.color = 'white';
button.style.border = 'none';
button.style.cursor = 'pointer';

// 4. Agregar botón al canvas overlay
menuContainer.appendChild(button);
document.body.appendChild(overlayCanvas);
document.body.appendChild(menuContainer);

// 5. Manejar eventos del botón
button.addEventListener('click', () => {
  console.log('Menú pausado');
});
```

### Configuración de Blending Avanzado

```typescript
// Configuración de blending para canvas overlay
const blendMode = {
  premultiplyAlpha: true,      // Importante para transparencia correcta
  blendFunc: [
    THREE.SrcAlphaFactor,      // Función de mezcla fuente
    THREE.OneMinusSrcAlpha      // Función de mezcla destino
  ]
};

// Aplicar blending al renderer
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
```

---

## 2. HTMLMesh (Elementos HTML en Escena 3D)

HTMLMesh permite insertar elementos HTML directamente en la escena 3D, con posicionamiento basado en coordenadas 3D.

### Instalación del Addon

```typescript
import { HTMLMesh } from 'three/addons/objects/HTMLMesh.js';
```

### Ejemplo: Botón 3D Flotante

```typescript
import * as THREE from 'three';
import { HTMLMesh } from 'three/addons/objects/HTMLMesh.js';

// Crear elemento HTML
const buttonElement = document.createElement('div');
buttonElement.innerHTML = '<span>🎮</span>';
buttonElement.style.cssText = `
  position: absolute;
  width: 60px;
  height: 40px;
  background: rgba(255, 107, 107, 0.9);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
`;

// Crear HTMLMesh
const htmlMesh = new HTMLMesh({
  element: buttonElement,
  material: {
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  }
});

// Posicionar en escena (coordenadas 3D)
htmlMesh.position.set(0, 5, -10); // Flotante en el aire
htmlMesh.lookAt(camera.position); // Mirar hacia la cámara

scene.add(htmlMesh);

// Manejar clics
buttonElement.addEventListener('click', () => {
  console.log('Botón 3D presionado');
});
```

### Menú Contextual Dinámico

```typescript
// Crear menú contextual que sigue al cursor
class DynamicMenu {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private position: THREE.Vector3 = new THREE.Vector3();
  
  constructor(scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d')!;
    
    // Configurar blending
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'auto';
    
    scene.add(this.canvas as any);
  }
  
  showAtPosition(position: THREE.Vector3) {
    this.position.copy(position);
    this.update();
  }
  
  private update() {
    // Proyectar posición 3D a coordenadas de pantalla
    const vector = this.position.clone();
    vector.project(camera);
    
    const x = (vector.x * .5 + .5) * window.innerWidth;
    const y = (-vector.y * .5 + .5) * window.innerHeight;
    
    // Dibujar menú
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.context.fillRect(0, 0, 200, 150);
    
    this.context.fillStyle = 'white';
    this.context.font = '16px Arial';
    this.context.fillText('Opciones del menú', 10, 30);
  }
}
```

---

## 3. InteractionManager (Gestión de Eventos)

El `InteractionManager` ayuda a gestionar eventos de UI en la escena 3D, especialmente para controles como OrbitControls o PointerLockControls.

### Configuración Básica

```typescript
import { InteractionManager } from 'three/addons/controls/InteractionManager.js';

const interactionManager = new InteractionManager();

// Registrar controlador
interactionManager.register(camera);

// Manejar eventos de UI
document.addEventListener('click', (event) => {
  // Obtener posición del mouse en coordenadas normalizadas
  const rect = event.target.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = -(event.clientY - rect.top) / rect.height;
  
  console.log(`Click en: ${x.toFixed(2)}, ${y.toFixed(2)}`);
});
```

### Manejo de Eventos de UI con PointerLock

```typescript
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const controls = new PointerLockControls(camera, document.body);

// Mostrar menú cuando se pierde el control
document.addEventListener('pointerlockchange', () => {
  if (!controls.isLocked) {
    // Mostrar menú de pausa
    showPauseMenu();
  }
});

// Ocultar menú cuando se gana el control
document.addEventListener('pointerlockchange', () => {
  if (controls.isLocked) {
    hidePauseMenu();
  }
});
```

---

## 4. Raycasting para Detección de UI

El raycasting permite detectar clics en elementos UI superpuestos sobre la escena 3D.

### Ejemplo: Menú con Detección de Clics

```typescript
import * as THREE from 'three';

// Crear canvas UI
const uiCanvas = document.createElement('canvas');
uiCanvas.width = window.innerWidth;
uiCanvas.height = window.innerHeight;

// Crear elementos interactivos
const interactiveElements: { element: HTMLElement; position: THREE.Vector3 }[] = [];

function createUIElement(
  x: number, 
  y: number, 
  width: number, 
  height: number,
  onClick: () => void
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  
  // Dibujar fondo semitransparente
  context.fillStyle = 'rgba(0, 0, 0, 0.5)';
  context.fillRect(0, 0, width, height);
  
  // Dibujar borde
  context.strokeStyle = '#ff6b6b';
  context.lineWidth = 2;
  context.strokeRect(0, 0, width, height);
  
  // Dibujar texto
  context.fillStyle = 'white';
  context.font = 'bold 18px Arial';
  context.textAlign = 'center';
  context.fillText('Botón Interactivo', width / 2, height / 2 + 6);
  
  // Agregar al DOM
  canvas.style.position = 'absolute';
  canvas.style.left = `${x}px`;
  canvas.style.top = `${y}px`;
  document.body.appendChild(canvas);
  
  return canvas;
}

// Configurar raycaster para detección de UI
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

document.addEventListener('click', (event) => {
  // Calcular posición del mouse en coordenadas normalizadas
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // Realizar raycasting
  raycaster.setFromCamera(mouse, camera);
  
  // Intersectar con elementos UI
  const intersects = raycaster.intersectObjects(scene.children);
  
  for (const intersect of intersects) {
    if (intersect.object instanceof HTMLCanvasElement) {
      console.log('Clic en elemento UI:', intersect.point);
      onClick();
      break;
    }
  }
});
```

---

## 5. Menú de Pausa Completo

Ejemplo práctico de implementación completa para biombo-arena:

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class PauseMenu {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private isVisible = false;
  
  constructor(scene: THREE.Scene) {
    // Crear canvas overlay
    this.canvas = document.createElement('canvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    // Configurar blending
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none'; // Permitir clicks a través
    
    document.body.appendChild(this.canvas);
    
    this.context = this.canvas.getContext('2d')!;
  }
  
  show() {
    this.isVisible = true;
    this.canvas.style.pointerEvents = 'auto';
    
    // Dibujar fondo semitransparente
    this.context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Dibujar título
    this.context.fillStyle = 'white';
    this.context.font = 'bold 48px Arial';
    this.context.textAlign = 'center';
    this.context.fillText('PAUSA', this.canvas.width / 2, 100);
    
    // Crear botones
    this.createButton('Reanudar', this.canvas.width / 2, 200, () => this.hide());
    this.createButton('Guardar Juego', this.canvas.width / 2, 280, () => console.log('Guardando...'));
    this.createButton('Opciones', this.canvas.width / 2, 360, () => this.showOptionsMenu());
    this.createButton('Salir al Menú Principal', this.canvas.width / 2, 440, () => quitToMenu());
  }
  
  hide() {
    this.isVisible = false;
    this.canvas.style.pointerEvents = 'none';
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  private createButton(text: string, x: number, y: number, onClick: () => void) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.position = 'absolute';
    button.style.left = `${x - 100}px`;
    button.style.top = `${y}px`;
    button.style.padding = '12px 24px';
    button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '16px';
    button.style.fontWeight = 'bold';
    button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    
    // Agregar al canvas
    this.canvas.appendChild(button);
    
    // Manejar eventos del botón
    button.addEventListener('mouseenter', () => {
      button.style.background = 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)';
      button.style.transform = 'translateY(-2px)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      button.style.transform = 'translateY(0)';
    });
    
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // Evitar propagación
      onClick();
    });
  }
  
  private showOptionsMenu() {
    this.context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.context.fillStyle = '#333';
    this.context.font = 'bold 24px Arial';
    this.context.textAlign = 'center';
    this.context.fillText('Opciones', this.canvas.width / 2, 150);
    
    // Botones de opciones
    const options = [
      { text: 'Volumen: Alto', x: this.canvas.width / 2, y: 200 },
      { text: 'Calidad: Alta', x: this.canvas.width / 2, y: 280 },
      { text: 'Pantalla Completa', x: this.canvas.width / 2, y: 360 }
    ];
    
    options.forEach(opt => {
      const button = document.createElement('button');
      button.textContent = opt.text;
      button.style.position = 'absolute';
      button.style.left = `${opt.x - 120}px`;
      button.style.top = `${opt.y}px`;
      button.style.padding = '10px 20px';
      button.style.background = '#444';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.borderRadius = '6px';
      button.style.cursor = 'pointer';
      this.canvas.appendChild(button);
    });
  }
}

// Uso en biombo-arena
const pauseMenu = new PauseMenu(scene);

// Mostrar menú cuando se presiona ESC o P
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'p') {
    pauseMenu.show();
  }
});
```

---

## 6. Menú de Instrucciones Flotante

Menú que muestra instrucciones sobre la escena 3D:

```typescript
class InstructionsMenu {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  
  constructor(scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '10px';
    this.canvas.style.right = '10px';
    this.canvas.style.background = 'rgba(0, 0, 0, 0.6)';
    this.canvas.style.padding = '15px';
    this.canvas.style.borderRadius = '8px';
    this.canvas.style.color = 'white';
    this.canvas.style.fontFamily = 'Arial, sans-serif';
    
    document.body.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d')!;
    
    this.update();
  }
  
  private update() {
    const instructions = `
      🎮 CONTROLES:
      - WASD: Moverse
      - Flechas: Rotar cámara
      - R: Reiniciar posición
      - P: Pausar juego
      
      💡 CONSEJOS:
      - Usa el mouse para apuntar
      - Presiona clic izquierdo para disparar
      - Ctrl + Clic para saltar
      
      🏆 OBJETIVO:
      - Recoge todas las bolas
      - Evita los obstáculos
      - Llega a la meta
    `;
    
    this.context.font = '14px Arial';
    this.context.lineHeight = '1.4';
    this.context.textAlign = 'left';
    this.context.fillText(instructions, 15, 30);
  }
}

// Crear menú de instrucciones
const instructionsMenu = new InstructionsMenu(scene);
```

---

## 7. Integración con biombo-engine.service.ts

Para integrar menús interactivos en tu servicio biombo:

```typescript
// En src/features/biombo/services/biombo-engine.service.ts

export class BiomboEngineService {
  // ...existing code...
  
  private pauseMenu: PauseMenu | null = null;
  private instructionsMenu: InstructionsMenu | null = null;
  
  initUI() {
    // Inicializar menús UI
    this.pauseMenu = new PauseMenu(this.scene);
    this.instructionsMenu = new InstructionsMenu(this.scene);
    
    // Configurar atajos de teclado
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.togglePauseMenu();
      } else if (event.key === 'p') {
        this.togglePauseMenu();
      }
    });
    
    // Configurar botón de pausa en HTML
    const pauseButton = document.getElementById('pause-button');
    if (pauseButton) {
      pauseButton.addEventListener('click', () => this.togglePauseMenu());
    }
  }
  
  togglePauseMenu() {
    if (this.pauseMenu) {
      if (this.pauseMenu.isVisible) {
        this.pauseMenu.hide();
      } else {
        this.pauseMenu.show();
      }
    }
  }
  
  showPauseMenu() {
    if (this.pauseMenu) {
      this.pauseMenu.show();
    }
  }
  
  hidePauseMenu() {
    if (this.pauseMenu) {
      this.pauseMenu.hide();
    }
  }
}
```

---

## 8. Mejores Prácticas

### Rendimiento

- **Limpiar recursos**: Eliminar elementos UI cuando no se necesitan
- **Reutilizar canvas**: No crear nuevos canvas en cada frame
- **Optimizar eventos**: Usear `requestAnimationFrame` para actualizaciones de UI

```typescript
// Limpiar menú al salir del juego
function cleanupUI() {
  if (pauseMenu) {
    pauseMenu.hide();
    pauseMenu.canvas.remove();
  }
  
  if (instructionsMenu) {
    instructionsMenu.update = () => {}; // Detener actualizaciones
  }
}
```

### Accesibilidad

- **Textos alternativos**: Añadir atributos `aria-label` a elementos UI
- **Contraste adecuado**: Asegurar que el texto sea legible
- **Teclado**: Permitir navegación con teclado

```typescript
const button = document.createElement('button');
button.setAttribute('aria-label', 'Reanudar juego');
button.setAttribute('tabindex', '0'); // Permitir foco con teclado
```

### Responsividad

- **Ajustar al redimensionamiento**: Escalar UI al cambiar tamaño de ventana

```typescript
window.addEventListener('resize', () => {
  const canvas = document.querySelector('.ui-overlay') as HTMLCanvasElement;
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
});
```

---

## Referencias

- [Three.js Documentation - HTML Overlay](https://threejs.org/examples/webgl_html_overlay.html)
- [Three.js Documentation - InteractionManager](https://threejs.org/docs/#api/en/controls/InteractionManager)
- [Three.js Documentation - HTMLMesh](https://threejs.org/docs/#api/en/objects/HTMLMesh)
- [Three.js Blending Documentation](https://threejs.org/docs/#api/en/constants/Material)

---

## Conclusión

Los menús interactivos en Three.js son esenciales para crear experiencias de usuario completas. La combinación de canvas blending, HTMLMesh y raycasting te permite crear interfaces ricas e inmersivas que se integran perfectamente con tu escena 3D.

Para biombo-arena, recomendamos:
1. Usar **canvas blending** para menús principales (pausa, opciones)
2. Usar **HTMLMesh** para elementos flotantes en la escena
3. Implementar **raycasting** para detección precisa de clics
4. Seguir las **mejores prácticas** de rendimiento y accesibilidad

¡Ahora estás listo para crear menús interactivos profesionales en tu juego biombo-arena! 🎮
