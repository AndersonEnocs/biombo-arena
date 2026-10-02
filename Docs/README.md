# Documentación de desarrollo - Biombo Arena

## 1. Descripción general

Este proyecto es una aplicación web con Ionic + Angular para visualizar una arena 3D tipo "biombo"/"lottery arena" usando Three.js y Rapier. La lógica principal está enfocada en simular un mecanismo visual con bolas, animación 3D, iluminación y render del entorno.

Tecnologías principales:
- Angular 22
- Ionic Angular
- TypeScript
- Three.js
- Rapier 3D (para física/colisiones)
- Capacitor (opcional para móvil/desktop)

## 2. Punto de entrada

La app se inicia desde el bootstrap de Angular y la navegación principal se define en:
- src/app/app.routes.ts

Rutas principales:
- /home: pantalla principal con selector de modo single/dual
- /arena: render 3D del biombo
- /: redirige a /home

## 3. Estructura del código

src/
- app/
  - app.routes.ts
  - home/
    - home.page.ts
  - features/
    - biombo/
      - components/
        - biombo-canvas/
          - biombo-canvas.component.ts
        - biombo-card/
          - biombo-card.component.ts
      - models/
        - ball.entity.ts
        - cam-controller.entity.ts
        - solid.entity.ts
      - services/
        - biombo-engine.service.ts
      - utilities/
        - biombo.interfaces.ts
        - biombo.interfaces.spec.ts
  - core/
    - services/
      - rapier-loader.service.ts

### Componentes clave

- `HomePage`:
  Define el menú del proyecto y decide si se muestra un o dos biombo en paralelo.

- `BiomboCanvasComponent`:
  Crea el contenedor de render 3D y maneja el resize del viewport.

- `BiomboEngineService`:
  Es el motor principal: crea la escena, cámara, renderer, luces, modelos 3D y la animación del sistema.

- `SolidEntity`:
  Encapsula la carga y posición de meshes/objetos físicos.

- `RapierLoaderService`:
  Carga la librería física de Rapier para la simulación del mecanismo.

## 4. Cómo funciona la app

La lógica principal del render se concentra en `BiomboEngineService`:

1. Se inicializa la escena Three.js.
2. Se carga el skybox y la configuración del entorno.
3. Se crea la cámara y el renderer WebGL.
4. Se construye la estructura del biombo: eje, anillos, soportes y superficies.
5. Se cargan los modelos 3D y se integran a la escena.
6. Se crean bolas, efectos de animación y dinámica visual.
7. El engine entra en un loop de animación para redibujar en cada frame.

La UI no dibuja el 3D directamente; delega ese trabajo al servicio y al canvas component.

## 5. Requisitos para desarrollar

Necesitas tener instalado:
- Node.js 18+ o versión compatible con Angular 22
- npm
- Git

Recomendado:
- Navegador moderno: Chrome o Edge
- WebGL activo

## 6. Instalación

Desde la raíz del proyecto:

```bash
npm install
```

Si hay dependencias viejas o un entorno inconsistente, limpia e instala de nuevo:

```bash
rm -rf node_modules package-lock.json
npm install
```

## 7. Ejecutar en desarrollo

Inicia el servidor Angular:

```bash
npm run start
```

Esto normalmente levanta la app en:
- http://localhost:4200

Si quieres forzar la dirección y puerto:

```bash
npx ng serve --host 0.0.0.0 --port 4200
```

## 8. Scripts útiles

En package.json ya están definidos estos comandos:

```bash
npm run start
```
Lanza el proyecto en modo desarrollo.

```bash
npm run build
```
Genera la build de producción.

```bash
npm run watch
```
Compila en modo observador para desarrollo continuo.

```bash
npm run test
```
Ejecuta las pruebas del proyecto.

```bash
npm run lint
```
Revisa estilo y errores de lint.

## 9. Ejecutar con Capacitor (opcional)

Si quieres compilarlo como app móvil/desktop:

```bash
npx cap sync
npx cap open android
```

O para iOS:

```bash
npx cap open ios
```

## 10. Buenas prácticas para desarrollo

- Mantén la lógica 3D dentro de `BiomboEngineService` y no la mezcles con la capa UI.
- Si cambias modelos o assets 3D, revisa la ruta de carga en los loaders de `SolidEntity`/`initialize()`.
- Verifica rendimiento al activar más de un biombo; la escena puede requerir más potencia.
- Si WebGL falla, revisa:
  - navegador compatible
  - aceleración por hardware
  - consola del navegador para errores de render

## 11. Flujo típico de trabajo

1. Instala dependencias.
2. Ejecuta `npm run start`.
3. Abre la app en el navegador.
4. Cambia entre `home` y `arena` según la vista que quieras probar.
5. Modifica el servicio y los modelos para ajustar la escena.
6. Valida con `npm run build` antes de cerrar cambios importantes.

## 12. Detecciones rápidas de errores comunes

### Error de WebGL
- Verifica que el navegador soporte WebGL 2 o WebGL.
- Revisa si el GPU está habilitado.

### Assets no cargan
- Confirma que los archivos existen en `src/assets/`.
- Revisa la ruta usada por `CubeTextureLoader` y `SolidEntity.load`.

### App no arranca
- Ejecuta:

```bash
npm install
npm run start
```

- Si sigue fallando, revisa la versión de Node y las dependencias.

## 13. Resumen

La aplicación está organizada como un proyecto Ionic + Angular con un motor 3D central basado en Three.js. La parte más importante para entender es:
- UI en `home.page.ts`
- Contenedor gráfico en `biombo-canvas.component.ts`
- Motor 3D en `biombo-engine.service.ts`

Si quieres probar la app en desarrollo, la forma más directa es:

```bash
npm install
npm run start
```

Y abrir la URL que indique Angular en el navegador.
