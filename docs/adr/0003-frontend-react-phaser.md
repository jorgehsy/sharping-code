# ADR 0003 — Frontend: React + Phaser 4, en dos fases

Estado: aceptado (2026-10-09). Research: [research/frontend-framework.md](../research/frontend-framework.md).

## Contexto

El jugador pasa la mayor parte del tiempo escribiendo código (Monaco, que es DOM). Queremos además una cocina animada y protagonista, donde se vea a los otros jugadores cocinando. Queremos un primer playtest pronto.

## Decisión

- **React + Vite + TS** para todo lo que es HTML: lobby, editor (Monaco), HUD, podio.
- **Phaser 4** para la vista cocina, con avatares de todos los jugadores. Solo **muestra** el estado; no tiene lógica de juego ni acciones.
- **Dos vistas que se alternan**: vista cocina y vista editor a pantalla completa. En la vista editor, lo que pasa en la cocina llega como **avisos** (toasts + HUD), sin mini-cocina.
- **Fases**: fase 1 = juego jugable solo con React (la vista cocina es una lista simple). Fase 2 = Phaser reemplaza la vista cocina, leyendo el mismo store.
- Estado del cliente en un **store externo** (independiente de React y de Phaser) alimentado por la suscripción a AppSync Events. Así Phaser se agrega sin reescribir.
- Phaser se carga lazy. Arte: assets gratis / IA / estilo simple.
- Solo desktop.

## Descartado

- Phaser puro: Monaco dentro del canvas da problemas de foco, teclado y escala.
- Svelte/Solid: serían dos cosas nuevas a la vez (framework DOM + motor de juego).
- Kaplay/Excalibur: pensados para juegos de acción.

## Consecuencias

- La capa Phaser casi no se testea con unit tests: solo smoke + e2e (Playwright). La lógica vive en TS puro, testeado.
- Bundle: Monaco domina el peso; Phaser suma ~250 KB gzip (medir en v4).
