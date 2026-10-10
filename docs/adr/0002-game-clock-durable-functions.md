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

## Actualización — reloj reactivo
El plan precalculado (`buildSchedule`) asumía que solo el tiempo libera slots. Pero una comanda con 3 entregas ya no admite más y seguía ocupando su slot hasta vencer: la cocina se vaciaba.

Ahora el loop es reactivo: `step('tick-i')` lee las comandas de DynamoDB, decide (función pura `decideTick`), persiste y publica; luego espera con `ctx.waitForCallback('wake-i', …)`. El submitter guarda el `callbackId` en `META.clockCallbackId`. La API, tras la 3ª entrega de una comanda, completa ese callback (`SendDurableExecutionCallbackSuccess`, best effort) y el reloj rellena el slot al instante. Sin entrega que lo despierte, el callback vence en el próximo evento conocido (`timeout` = siguiente vencimiento menos `WAIT_MARGIN_MS`; el resto se duerme dentro del step): el `CallbackTimeoutError` es el camino normal. Una señal perdida (llega mientras corre un tick, o al `callbackId` anterior ya consumido) solo retrasa el relleno hasta el próximo despertar, porque cada tick relee el estado. Para acotar ese retraso, ninguna espera dura más de 30 s (`maxIdleSeconds`): un tick sin nada que hacer es barato.

Operaciones con nombre único por iteración (`tick-i`, `wake-i`): ~vencimientos + rellenos + 2 ticks por partida.

