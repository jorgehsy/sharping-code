# 0001 — Serverless con AppSync Events + HTTP API lambdalith

## Estado
Aceptada — 2026-10-09

## Contexto
Juego en tiempo real, ~10 jugadores por partida, varias partidas simultáneas, uso esporádico. Se evaluó un servidor Node con estado en memoria (Fargate) frente a todo serverless.

## Decisión
Todo serverless:
- **AppSync Events** para el WebSocket pub/sub (sin manejar conexiones a mano). Clientes suscriben con API key; solo el backend publica, con IAM.
- **API Gateway HTTP API + una lambdalith** con Powertools `event-handler/http` para las acciones.
- **DynamoDB** para el estado.
- **Runner Lambda** aislada para ejecutar código de jugadores.
- **CDK** como IaC.

## Consecuencias
- Costo ~$0 sin uso.
- El estado compartido vive en DynamoDB: el orden de entregas se resuelve con updates condicionales.
- Más difícil de probar en local que un proceso único.
