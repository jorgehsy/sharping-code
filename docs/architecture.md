# Arquitectura

Reglas del juego: [game-design.md](game-design.md). Decisiones: [adr/](adr/).

## Stack

- Todo TS: frontend, backend e infra.
- IaC: **AWS CDK**. Cuenta sandbox propia.
- Sin login: se entra con **nickname + código de partida**. Puede haber varias partidas a la vez.

## Diagrama

```
Browser (SPA + Monaco)
  │  acciones (crear, unirse, tomar, entregar, sabotear)
  ├──► API Gateway HTTP API ──► Lambdalith (Powertools Router) ──► DynamoDB
  │                                 │  invoke síncrono
  │                                 ├──► Runner Lambda (aislada)
  │                                 │  publish HTTP (IAM / SigV4)
  │                                 └──► AppSync Events
  │                                            ▲
  │                       Game clock (Lambda durable function) ──┘ (+ DynamoDB)
  │  suscripción WebSocket (API key)
  └◄──────────── canal /game/{code}
```

## Piezas

### Frontend
- SPA estática en S3 + CloudFront. React + Vite, editor Monaco; vista cocina en Phaser 4 (fase 2). Ver [ADR 0003](adr/0003-frontend-react-phaser.md).
- Los relojes se calculan en el cliente desde timestamps del server.

### API — Lambdalith
- API Gateway **HTTP API** (menor latencia y costo que REST; no necesitamos usage plans ni WAF).
- Una Lambda con `Router` de `@aws-lambda-powertools/event-handler/http`, validación con Zod.
- Logger / Tracer / Metrics de Powertools.
- Al unirse, el backend devuelve un `playerToken` (UUID) que el cliente manda en cada acción.

### Tiempo real — AppSync Events
- Un canal por partida: `/game/{code}`.
- Clientes: solo **suscribirse**, con API key.
- Publicar: solo con **IAM** (lambdalith y game clock). Los clientes no pueden publicar.
- Publish por HTTP: `POST https://HTTP_DOMAIN/event`, máx. 5 eventos por llamada.

### Estado — DynamoDB
- Single table. Partición `GAME#{code}`.
- Orden de entregas (1º / 2º / 3º) con update condicional atómico sobre la comanda.

### Runner Lambda
- Separada de la lambdalith. Ejecuta código de jugadores.
- Rol solo con logs. **Sin VPC** (costo cero en reposo): el código del jugador tiene salida a internet, aceptado.
- Proceso hijo nuevo por ejecución con `node --permission` (sin fs, sin child_process, sin workers) y `env: {}` (no ve credenciales).
- Quita tipos con `stripTypeScriptTypes` de `node:module` (mode `transform`), sin esbuild en runtime.
- El hijo solo recibe inputs y devuelve los resultados; la comparación (deep equal) la hace el padre.
- Chequea sabotajes por AST (ej. "sin bucles").

### Game clock — Lambda durable function
- Una ejecución durable por partida, iniciada al empezar la partida.
- El reloj es **solo tiempo**: las entregas no cierran comandas, así que el próximo evento siempre es conocido (vence una comanda, empieza hora punta, termina la partida).
- Loop: el plan completo (`buildSchedule`, puro y sembrado con el código de partida) se calcula al principio; por cada *tick* (acciones del mismo instante) hay un `wait` y un `step` que actualiza DynamoDB (`ORDER#`) y publica. Sin tick fijo: ~20-30 ticks por partida. Rotación de comandas: ver [api.md](api.md).
- `durableConfig.executionTimeout` cubre la partida con margen (ej. 20 min).
- Ojo con el modelo de replay: el código del loop debe ser determinista; todo lo no determinista (hora, random, I/O) va dentro de `step`.

## Infra (CDK)

- Un solo stack `SharpingCodeStack` (`infra/lib/stack.ts`) dividido en constructs: Data, Realtime, Runner, Clock, Api.
- Las Lambdas se empaquetan con la API JS de esbuild en `infra/lib/bundling.ts` (ESM, minify, node24, arm64), no con `NodejsFunction`: este ejecuta `pnpm exec esbuild` desde la raíz y el shim hoisted de pnpm falla.
- La lambdalith empaqueta `@aws-sdk/client-lambda` (el SDK del runtime podría no conocer `DurableExecutionName`); el resto del SDK es externo.
- Pendiente: hosting del frontend (S3 + CloudFront) y restringir CORS de la HTTP API a ese dominio.

## Rendimiento ("snappy")
- arm64, bundles chicos (esbuild).
- Precalentar lambdalith y runner al empezar la partida.
- La lambdalith responde la acción y publica el evento en paralelo.
