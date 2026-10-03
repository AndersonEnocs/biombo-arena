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
- pnpm 12.8.1 (la versión fijada en `package.json`)
- Git

Recomendado:
- Navegador moderno: Chrome o Edge
- WebGL activo

## 6. Instalación

Desde la raíz del proyecto:

```bash
pnpm install
```

Para instalar exactamente las dependencias registradas en el lockfile, por ejemplo en CI:

```bash
pnpm install --frozen-lockfile
```

## 7. Ejecutar en desarrollo

Inicia el servidor Angular:

```bash
pnpm start
```

Esto normalmente levanta la app en:
- http://localhost:4200

Si quieres forzar la dirección y puerto:

```bash
pnpm exec ng serve --host 0.0.0.0 --port 4200
```

## 8. Scripts útiles

En package.json ya están definidos estos comandos:

```bash
pnpm run start
```
Lanza el proyecto en modo desarrollo.

```bash
pnpm run build
```
Genera la build de producción.

```bash
pnpm run watch
```
Compila en modo observador para desarrollo continuo.

```bash
pnpm run test
```
Ejecuta las pruebas del proyecto.

```bash
pnpm run lint
```
Revisa estilo y errores de lint.

## 9. Ejecutar con Capacitor (opcional)

Si quieres compilarlo como app móvil/desktop:

```bash
pnpm exec cap sync
pnpm exec cap open android
```

O para iOS:

```bash
pnpm exec cap open ios
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
pnpm install
pnpm start
```

- Si sigue fallando, revisa la versión de Node y las dependencias.

## 13. Resumen

La aplicación está organizada como un proyecto Ionic + Angular con un motor 3D central basado en Three.js. La parte más importante para entender es:
- UI en `home.page.ts`
- Contenedor gráfico en `biombo-canvas.component.ts`
- Motor 3D en `biombo-engine.service.ts`

Si quieres probar la app en desarrollo, la forma más directa es:

```bash
pnpm install
pnpm start
```

Y abrir la URL que indique Angular en el navegador.

## 14. Apéndice A: migración de npm a pnpm

Este apéndice documenta el cambio del gestor de paquetes del proyecto y sirve como referencia para el desarrollo local y CI. La configuración actual fija pnpm `12.8.1` en `package.json`, mantiene las dependencias resueltas en `pnpm-lock.yaml` y usa `pnpm-workspace.yaml` para declarar permisos de scripts de instalación. El antiguo `package-lock.json` ya no forma parte del flujo; no se deben regenerar ni mantener dos lockfiles.

### Motivo y alcance

pnpm pasa a ser la fuente única de instalaciones y resolución de dependencias. El lockfile registra las versiones concretas y sus integridades para que los entornos de desarrollo y CI instalen el mismo árbol. El proyecto continúa usando los scripts de Angular/Ionic definidos en `package.json`; el cambio de gestor no modifica la arquitectura ni los comandos funcionales de la aplicación.

### Archivos de configuración

- `package.json`: el campo `packageManager` fija `pnpm@12.8.1`. Mantenerlo sincronizado si se actualiza pnpm y revisar el lockfile junto con cualquier cambio de dependencias.
- `pnpm-lock.yaml`: registro versionado de las dependencias directas y transitivas. Debe incluirse en cada cambio que lo modifique; no editarlo manualmente.
- `.npmrc`: configura el registro de npm, la instalación automática de peers, la validación estricta de peer dependencies y el modo hoisted del árbol `node_modules`. Este modo facilita la compatibilidad con herramientas que esperan una estructura plana. No es motivo para usar npm: pnpm sigue gestionando la instalación y el lockfile.
- `pnpm-workspace.yaml`: permite los scripts de instalación de `@parcel/watcher`, `esbuild`, `lmdb` y `msgpackr-extract` mediante `allowBuilds`. Si una dependencia nueva requiere ejecutar un script de instalación, revisa por qué lo necesita y autorízala explícitamente solo si es confiable.

### Preparar una instalación local

Usa Node.js compatible tanto con la versión de Angular del proyecto como con pnpm 12. Comprueba las versiones instaladas:

```bash
node --version
pnpm --version
```

La versión esperada de pnpm es `12.8.1`. Si pnpm no está disponible, puede habilitarse Corepack (incluido en algunas distribuciones de Node.js) y activar la versión fijada:

```bash
corepack enable
corepack prepare pnpm@12.8.1 --activate
pnpm --version
```

Después, desde la raíz del repositorio:

```bash
pnpm install --frozen-lockfile
pnpm start
```

`--frozen-lockfile` falla si el manifiesto y el lockfile no concuerdan, en vez de actualizar el lockfile silenciosamente. Para compilar y comprobar los scripts disponibles:

```bash
pnpm build
pnpm test
pnpm lint
```

### Conversión inicial desde npm

Estos pasos describen el procedimiento de conversión para una copia que todavía conserva `package-lock.json`; no recrees ese archivo en la versión actual del repositorio.

1. Revisa los cambios locales y confirma que `package.json` y el lockfile de npm corresponden al mismo estado de dependencias.
2. Instala pnpm `12.8.1` y ejecuta `pnpm import` desde la raíz. El comando importa la resolución de `package-lock.json` a `pnpm-lock.yaml`.
3. Añade o verifica el campo `"packageManager": "pnpm@12.8.1"` en `package.json`.
4. Ejecuta `pnpm install` y revisa los cambios en `pnpm-lock.yaml`, junto con los avisos de peer dependencies y scripts de instalación.
5. Valida build, pruebas y lint. Una vez que el lockfile de pnpm sea correcto, elimina `package-lock.json` y las referencias de documentación o CI a npm.
6. Versiona `package.json`, `pnpm-lock.yaml`, la configuración pnpm necesaria y los cambios de CI en el mismo cambio.

Si `pnpm import` no está disponible en una versión concreta de pnpm, consulta la ayuda de esa versión; no borres el lockfile antiguo antes de completar y validar la conversión.

### Operaciones habituales

Usa los equivalentes siguientes y evita mezclar gestores en el mismo checkout:

| Operación | Comando |
| --- | --- |
| Instalar dependencias | `pnpm install` |
| Instalar sin cambiar el lockfile | `pnpm install --frozen-lockfile` |
| Añadir dependencia de ejecución | `pnpm add <paquete>` |
| Añadir dependencia de desarrollo | `pnpm add -D <paquete>` |
| Quitar dependencia | `pnpm remove <paquete>` |
| Ejecutar un script de `package.json` | `pnpm run <script>` |
| Ejecutar una herramienta local | `pnpm exec <comando>` |

Al añadir, quitar o actualizar dependencias, revisa y versiona juntos `package.json` y `pnpm-lock.yaml`. No uses `npm install`, `npm ci` ni `npx` para este proyecto: pueden crear un lockfile competidor o ejecutar una herramienta distinta de la instalada localmente.

### CI y revisión antes de integrar

Configura el pipeline para usar pnpm `12.8.1` y realizar una instalación inmutable antes de las verificaciones. Por ejemplo, si el agente ya tiene Node.js y Corepack disponibles:

```bash
corepack enable
corepack prepare pnpm@12.8.1 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
```

Antes de integrar una migración o un cambio de dependencias, confirma que:

- `package.json` declara la versión acordada de pnpm y no hay un `package-lock.json` en uso.
- `pnpm install --frozen-lockfile` termina sin modificar archivos versionados.
- Build, pruebas y lint terminan correctamente.
- Los avisos de peer dependencies y los permisos de scripts de instalación se han revisado, no ocultado sin análisis.
- Los pasos de CI, documentación y Capacitor usan pnpm de forma consistente.

### Problemas frecuentes

- **La instalación congelada indica que el lockfile está desactualizado:** no quites la opción en CI. En local ejecuta `pnpm install` para actualizarlo intencionalmente, revisa el diff y versiona el lockfile con `package.json`.
- **La versión de pnpm no coincide:** comprueba `packageManager` y activa `pnpm@12.8.1` antes de instalar.
- **Falla una peer dependency:** inspecciona qué paquetes declaran el requisito y corrige o actualiza las versiones relacionadas. La configuración estricta puede convertir incompatibilidades en errores.
- **Un paquete necesita un script de instalación no autorizado:** revisa el paquete y su script; si es confiable y necesario, añade su permiso a `allowBuilds` en `pnpm-workspace.yaml`.
- **Un comando de npm o `npx` aparece en CI o en instrucciones locales:** sustitúyelo por `pnpm run` o `pnpm exec`, según corresponda, para mantener el gestor y la resolución de herramientas consistentes.
