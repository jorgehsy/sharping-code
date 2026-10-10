# 0002 — Reloj de partida con Lambda durable functions

## Estado
Aceptada — 2026-10-09

## Contexto
Serverless no tiene `setInterval`. Alguien debe cerrar comandas vencidas, abrir nuevas, activar la hora punta y terminar la partida. Opciones: Step Functions (loop `Wait → tick`) o Lambda durable functions.

## Decisión
**Lambda durable functions**, una ejecución por partida. Es un proyecto para probar cosas; aceptamos el riesgo de una tecnología nueva.

El loop espera (`wait`) hasta el próximo evento conocido y ejecuta un `step` que actualiza DynamoDB y publica en AppSync Events. No hay tick fijo.

## Consecuencias
- Todo el loop en TS, sin ASL.
- Hay que respetar el modelo de replay: código determinista fuera de los `step`.
- Si falla, el plan B es Step Functions con el mismo `step` como Lambda tick.
