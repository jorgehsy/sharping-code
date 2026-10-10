# Investigación: framework de frontend

Fecha: 2026-10-09. Contexto: [CONTEXT.md](../../CONTEXT.md), [game-design.md](../game-design.md), [architecture.md](../architecture.md).

## Resumen

El juego es **editor-céntrico**: el 80% del tiempo el jugador escribe código en Monaco. La capa visual (cocina) es decoración + feedback. Eso condiciona todo: el editor es DOM sí o sí, y Phaser solo aporta si se quiere una cocina animada de verdad.

## Estado de Phaser (verificado)

- **Phaser 4 es estable**: v4.0.0 "Caladan" salió el 10-abr-2026; última v4.2.1 "Giedi" (9-jul-2026). Fuentes: https://phaser.io/download/stable , https://phaser.io/download/phaser4
- Renderer nuevo, sistema unificado de filtros (bloom, glow, blur, sombras, color grading), iluminación simple, objetos Gradient/Noise por GPU. API pública "casi idéntica" a v3 (https://phaser.io/phaser4). Hay guía de migración y *skills* para agentes IA en el repo (https://github.com/phaserjs/phaser/tree/master/skills).
- Templates oficiales (https://docs.phaser.io/phaser/getting-started/project-templates): React(+TS), Vue(+TS), **Svelte** (sin TS listado), **Solid** (sin TS listado), Angular, Next, Remix, y bundlers Vite(+TS), Webpack, esbuild, Rollup, Parcel, Bun. Hay CLI `create-phaser-game`.
- `template-react-ts` (https://github.com/phaserjs/template-react-ts): React 19, Vite 6, TS 5.7. Estructura: `PhaserGame.tsx` (componente puente), `game/EventBus.ts` (emisor de eventos React <-> Phaser), `game/scenes/`. Es el patrón de referencia para el híbrido. No pude confirmar fecha del último commit ni si ya apunta a Phaser 4 en `package.json` (el README dice "Phaser 4"; verificar antes de usar).
- Los templates Svelte y Solid parecen más descuidados que React/Vue (sin variante TS): riesgo si se quiere ese framework.

## Datos sobre Phaser + DOM (Context7 + docs)

- Phaser tiene `DOMElement` (`this.add.dom`) con `dom.createContainer: true` **y requiere `parent`**. En v4 `DOMElement` lanza error si no tiene contenedor (guía de migración v3→v4). Fuente: https://github.com/phaserjs/phaser/blob/master/skills/v3-to-v4-migration/SKILL.md
- Los DOM elements de Phaser viven en una capa HTML **encima** del canvas, no se mezclan en el z-order del canvas. Con `transparent: true` el canvas deja ver el HTML detrás.
- `Scale.RESIZE` con `parent` al 100% permite que el canvas llene un contenedor DOM (clave para layouts mixtos).
- Meter Monaco dentro de `this.add.dom` es posible pero incómodo: foco/teclado compiten con el input de Phaser (hay que desactivar captura de teclas: `input.keyboard.disableGlobalCapture()`), y el escalado/transform de Phaser afecta al DOM. **No recomendado.** Escribir el editor *en* canvas (texto propio) es inviable: sin IME, selección, undo, autocompletado, accesibilidad.
- Peso Phaser: ~1 MB minificado / ~250-300 KB gzip el build completo de v3 (cifras de v3, no medí v4; **medir**). Hay builds custom y el Phaser Compressor (quitar WebGL/Matter/tilemaps baja mucho). Fuentes: https://phaser.io/tutorials/creating-custom-phaser-builds , https://phaser.io/news/2024/05/phaser-compressor-released
- Monaco: pesa varios MB (fuentes dispares, 2-5 MB sin comprimir). Se carga lazy y con workers por Vite (`?worker`, `MonacoEnvironment.getWorker`); importar desde `monaco-editor/esm/vs/editor/editor.api` para no arrastrar todo. Fuente: https://github.com/microsoft/monaco-editor/discussions/3719 . Esto domina el peso en **cualquier** opción; Phaser suma poco comparado.

## Comparativa

Escala: ++ muy bien, + bien, o neutro, - mal.

| Criterio | 1. React+Vite | 2. Phaser puro | 3. Híbrido Phaser + DOM | 4a. Svelte 5 / Solid | 4b. PixiJS / Kaplay / Excalibur |
|---|---|---|---|---|---|
| Fit editor-céntrico | ++ | - | + | ++ | - / - / - |
| Monaco | ++ (`@monaco-editor/react` o directo) | -- (overlay DOM hackeado) | ++ (Monaco en DOM, fuera del canvas) | ++ | igual que Phaser puro |
| Visual "cocina" animada | o (CSS/Framer Motion/Lottie) | ++ | ++ | o (CSS, transiciones nativas muy buenas) | ++ / + / + |
| Bundle inicial | + (~150 KB gzip + Monaco lazy) | o (Phaser ~250 KB+ gzip, + Monaco igual) | o (React + Phaser + Monaco lazy) | ++ (el más ligero) | + (Pixi ~150-200 KB gzip; Kaplay similar) |
| Estado realtime (AppSync Events) | ++ (store + hooks) | o (todo a mano, EventEmitter) | + (store externo; Phaser lee, React lee) | ++ (runes/signals) | o |
| HUD (comandas, relojes, podio, sabotajes) | ++ (HTML+CSS) | - (UI en canvas: botones, scroll, texto) | ++ (HUD en DOM) | ++ | - |
| DX | ++ (HMR, ecosistema, tests) | + (recarga de escenas, depuración canvas) | o (dos mundos, puente de eventos) | + | + |
| Curva de aprendizaje | ++ (ya la conoces) | o (escenas, loader, tweens) | o-- (Phaser + puente) | + | o |
| Testing | ++ (Vitest + Testing Library + Playwright) | - (canvas: solo e2e/pixeles, o aislar lógica) | o (DOM testeable; escenas no) | ++ | - |
| Riesgo | bajo | alto (UI + editor) | medio (complejidad + sincronía de foco) | bajo-medio (menos ecosistema) | medio-alto |

## 1. React + Vite (baseline)

- Todo el juego es UI: lista de comandas con relojes, editor, tests públicos, resultados, podio. Es HTML/CSS natural.
- Monaco con `@monaco-editor/react` (carga desde CDN por defecto; para bundle propio configurar loader con el paquete local, que importa para S3+CloudFront sin depender de jsDelivr).
- Realtime: un store (Zustand) alimentado por la suscripción WebSocket; relojes como derivados de timestamps del server (ya decidido en architecture.md).
- "Cocina" visual con CSS/SVG/Lottie: suficiente para fogones, tickets, humo, sartenes animadas simples. Techo bajo para partículas/iluminación/físicas.
- Riesgo: que se sienta como "otra web de ejercicios". Es mitigable con diseño.

## 2. Phaser puro

- Phaser no tiene widgets de UI de formulario ni texto editable. Todo lo no-juego (listas, botones, scroll, texto largo del enunciado) se construye a mano o con plugins (rexUI).
- Monaco tendría que ser un DOM overlay posicionado sobre el canvas: se pierde la ventaja de "Phaser puro" y se hereda el dolor de foco/teclado/escala. Sin ganancia frente al híbrido.
- Solo tiene sentido si el editor fuera un panel mínimo (p. ej. un `<textarea>`), lo cual contradice el requisito de juego de devs senior.
- Veredicto: descartar.

## 3. Híbrido: Phaser (cocina) + framework DOM (editor + HUD)

- Arquitectura: `<div id="kitchen">` con el canvas Phaser (fondo, animaciones, partículas, reacciones a eventos) y alrededor/encima paneles DOM: Monaco, comandas, HUD. El canvas escucha eventos del juego (entrega correcta, plato quemado, sabotaje recibido, hora punta) y los **representa**; no es fuente de verdad.
- Puente: patrón del template React (`EventBus` + `PhaserGame.tsx`). Mejor aún: el estado vive en un store externo; Phaser se suscribe a él. Así Phaser no conoce React.
- Layout: dos columnas (editor izquierda, cocina derecha) o cocina como banda superior/fondo con editor encima. Canvas con `Scale.RESIZE` en su contenedor. El foco del teclado debe pertenecer al editor: desactivar captura global de teclas en Phaser.
- Costes: dos modelos mentales (escenas Phaser + componentes), assets (sprites/atlases: hace falta arte), tests de la capa canvas casi inexistentes, y tamaño extra (~250 KB gzip, medir en v4).
- Beneficio real: efectos que en CSS son un infierno (humo, fuego, platos volando, iluminación hora punta con filtros v4, partículas al sabotear) y una curva de aprendizaje en un framework de juegos, que es lo que el usuario busca.
- Se puede **cargar Phaser lazy** (import dinámico) para no penalizar el primer render del lobby.
- Elección del framework DOM: React (template TS oficial, el más cuidado) vs Solid/Svelte (templates sin TS, menos mantenidos). Si se quiere el camino bendecido: React.

## 4. Otros candidatos

- **Svelte 5 / Solid** (sin motor de juego): fit excelente para editor + HUD, menos peso, estado reactivo fino ideal para relojes que actualizan cada segundo. Pero el usuario ya domina React; el beneficio es salir de la zona de confort en framework, no en juegos. Opción válida si la cocina visual es CSS/SVG. Template Phaser para ellos existe pero sin TS oficial.
- **PixiJS** (renderer 2D, v8): más pequeño y flexible que Phaser, sin "framework de juego" (escenas, input, tweens, audio: a mano). Para una cocina decorativa Phaser ya te da todo; Pixi solo gana si quieres control fino/peso. No verificado con fuentes en esta pasada.
- **Kaplay / Excalibur**: orientados a juegos de acción con colisiones/física. Sobran para esto; ecosistema de templates con Vite/TS más pequeño que Phaser. **No encajan** (sin verificar a fondo; solo descarte razonado por tipo de juego).
- Ninguno cambia el problema central: el editor es DOM.

## Realtime y testing (transversal)

- AppSync Events: suscripción WebSocket (protocolo propio con API key); lo mismo en cualquier opción. Aislar un módulo `realtime/` (cliente + reducer de eventos a estado) **independiente del framework visual**, testeable con Vitest. Así la decisión de frontend es reversible.
- Mantener la lógica de juego del lado cliente (relojes, puntaje mostrado, cola de comandas) en TS puro y testear ahí; la capa visual solo pinta.
- E2E con Playwright sobre el DOM (editor, HUD). El canvas se valida con smoke tests (no crashea, se monta) y capturas.

## Recomendación

Finalistas:

1. **Híbrido React + Phaser 4** (template `template-react-ts`), con Monaco y HUD en React y la cocina como capa Phaser alimentada por un store. Es la opción si el objetivo es salir de la zona de confort y la cocina animada es parte de la gracia. Mitigar riesgo: construir primero el juego **completo y jugable solo con DOM** (fase 1) y agregar Phaser como capa de feedback visual (fase 2) sin que sea camino crítico. Cargar Phaser lazy.
2. **React + Vite puro** (baseline), con la cocina en CSS/SVG/Lottie. Mínimo riesgo y entrega más rápida; techo visual bajo.

Mi posición: el híbrido, pero **en fase 2**. Arrancar como (2) con arquitectura que deje un hueco para el canvas (store externo, eventos de dominio) hace que (1) sea una adición, no una reescritura. Descartar Phaser puro, Kaplay y Excalibur. Svelte/Solid solo si el usuario prefiere aprender un framework DOM nuevo antes que un motor de juego.

## Preguntas para grillar al usuario

1. ¿Qué fracción de la pantalla es visual de cocina vs editor+HUD? Si la cocina ocupa <25%, ¿justifica un motor de juego?
2. ¿Qué animaciones concretas imaginas (humo, fuego, platos volando, personajes, iluminación hora punta)? ¿Cuáles no se pueden hacer en CSS/SVG?
3. ¿Quién produce el arte (sprites, atlases, tiles)? Sin artista, ¿vale usar assets gratis/IA o estilo geométrico/pixel-art simple?
4. ¿Qué pesa más: aprender Phaser por gusto, o llegar a una partida jugable pronto? ¿Cuál es la fecha objetivo del primer playtest con el equipo?
5. ¿Quién mantiene esto en 6 meses? Si lo toca otro dev del equipo, ¿React es mejor denominador común que Phaser?
6. ¿Aceptas que la cocina sea solo reflejo del estado (sin lógica de juego en Phaser)? ¿O quieres interacción en el canvas (arrastrar comandas, clicar fogones)?
7. ¿Hay presupuesto de carga? Con Monaco ya son varios MB: ¿importan +250 KB gzip de Phaser en oficinas/VPN, o se carga lazy tras el lobby?
8. ¿Dispositivos objetivo? Solo desktop (probable) vs móvil/tablet: afecta layout canvas+editor y si Monaco es viable.
9. ¿Cómo se verá a 10 jugadores: ¿se renderiza a los otros jugadores en la cocina (avatares, estados) o solo el tablero de puntaje? Eso define cuánto trabajo real tiene el canvas.
10. ¿Quieres que el repo siga siendo 100% TS con tests automatizados en el frontend? Si sí, ¿aceptas que la capa Phaser quede sin tests unitarios?

## Fuentes

- https://phaser.io/download/stable
- https://phaser.io/download/phaser4
- https://phaser.io/phaser4
- https://docs.phaser.io/phaser/getting-started/project-templates
- https://github.com/phaserjs/template-react-ts
- https://github.com/phaserjs/phaser/tree/master/skills (vía Context7 `/phaserjs/phaser`)
- https://phaser.io/tutorials/creating-custom-phaser-builds
- https://phaser.io/news/2024/05/phaser-compressor-released
- https://github.com/microsoft/monaco-editor/discussions/3719
