# API y eventos

Arquitectura: [architecture.md](architecture.md). Términos: [CONTEXT.md](../CONTEXT.md).

## Ciclo de partida

`lobby` → `running` → `finished`. Quien crea la partida es el **host**; solo el host la inicia.

Se puede entrar en `lobby` o en `running` (llegas tarde, empiezas con 0 puntos).

## Rutas (HTTP API → lambdalith)

Todas las acciones mandan el header `x-player-token`.

| Ruta | Qué hace | Responde |
|---|---|---|
| `POST /games` | Crea partida `{nickname}` | `{code, playerId, playerToken}` |
| `POST /games/{code}/players` | Unirse `{nickname}` | `{playerId, playerToken}` |
| `POST /games/{code}/start` | Host inicia; arranca el reloj durable | `204` |
| `GET /games/{code}` | Snapshot del estado | jugadores, puntajes, comandas abiertas (solo las que no vencieron según el server), tu comanda, tus condimentos, tu sabotaje, timestamps y `seq` |
| `POST /games/{code}/orders/{id}/take` | Tomar comanda (suelta la anterior) | `TakeOrderResponse`: enunciado, firma, casos públicos (nunca los ocultos) |
| `POST /games/{code}/orders/{id}/submit` | Entregar `{source}` | ver abajo |
| `POST /games/{code}/orders/{id}/taste` | Degustar `{source}` (solo casos públicos, gratis) | ver abajo |
| `POST /games/{code}/sabotages` | Sabotear `{targetPlayerId}` | `204` |

Errores: `401` token ausente/inválido, `404` partida/comanda/objetivo inexistente, `409` regla del juego (partida no `running`, comanda vencida, sabotaje rechazado…), `422` body inválido. Cuerpo `{message}`.

### Take

- Requiere partida `running` (y `now < endsAt`) y comanda no vencida; si no, `409`. Comanda inexistente: `404`.
- Fija `PLAYER.currentOrderId` (suelta la anterior) y emite `order.taken`. Volver a tomar la misma comanda no emite nada.

### Submit

- **Síncrono**: el resultado vuelve en la respuesta HTTP al que entregó. El evento del canal es para que se enteren los demás.
- **Hay que haber tomado la comanda** (`currentOrderId == id`); si no, `409`. También `409` si la comanda venció, la partida no está `running` o ya entregaste esa comanda (una entrega correcta por jugador y comanda).
- Un solo instante de servidor (`t`, al recibir la petición) decide vencimiento, hora punta y orden de llegada: la latencia del runner no te quita nada.
- OK → `{passed: true, rank, points, scores}`. `points` ya incluye hora punta (x2).
  - **4ª entrega correcta o posterior**: `200 {passed: true, rank: 4, points: 0}`. No emite `order.delivered`, pero igual limpia tu sabotaje (sirve para escapar de él). Solo existen 3 rangos.
  - 1ª entrega de una comanda difícil: +1 condimento (tope 2; si ya estás al tope no hay `condiment.earned`).
  - Si tenías sabotaje, se limpia y se emite `sabotage.cleared`.
- Falla en caso **público** → `{passed: false, reason, case: {input, expected, actual}, penalty, scores}`.
- Falla en caso **oculto** → `{passed: false, hidden: true, reason, penalty, scores}`. No se muestran los datos para no filtrar los casos ocultos.
- Cualquier fallo (compilación, sabotaje incumplido, timeout, runtime, resultado incorrecto) es **plato mal hecho**: multa de `BURNED_DISH_PENALTY` y `dish.burned`. El puntaje puede quedar negativo.
- Orden de eventos de una entrega: `order.delivered`, `condiment.earned`, `sabotage.cleared` (un solo `emit`, `seq` consecutivos).

### Taste (degustar)

- Corre `{source}` contra los casos **públicos** de la comanda, en el mismo runner que la entrega y con tu sabotaje activo.
- **Gratis**: sin multa, sin puntos, sin eventos, sin escrituras en DB.
- Mismas validaciones que submit (`409` si no tomaste la comanda, venció o la partida no está `running`). No rechaza una comanda que ya entregaste.
- Corre **todos** los casos (un throw en uno no corta los demás) → `{ok: true, cases: [{input, expected, actual?, error?, passed}], durationMs}`.
- Si no se pudo correr nada (compilación, sabotaje incumplido, timeout, runtime fuera de `solve`) → `{ok: false, reason, message, durationMs}`.
- Pasar los públicos no garantiza pasar los ocultos.
- Límite: 1 degustación en vuelo por jugador, **solo en el cliente**.

### Sabotage

- El atacante solo manda el objetivo; **la regla se elige al azar** entre las que no están en `blockedSabotages` del puzzle que cocina el objetivo (si no cocina nada, todas).
- `409` con mensaje claro si: te saboteas a ti mismo, no tienes condimentos, el objetivo ya tiene sabotaje, todas las reglas están bloqueadas para su puzzle, o se perdió una carrera (condimento gastado / otro atacante primero).
- Gasta 1 condimento y pega la regla en una transacción (condiciones: condimento disponible, objetivo sin sabotaje, partida `running`). Emite `sabotage.applied`.

### Snapshot: campos de jugadores y comandas

- `players[]` incluye `currentOrderId` (comanda que cocina, o `null`) y `sabotage` (regla activa o `null`). `currentOrderId` sigue la misma regla que `me.currentOrderId`: es `null` si la comanda ya no está abierta o si ese jugador ya la entregó.
- `orders[].deliveredBy`: playerIds con entrega correcta **en orden de llegada** (índice = rank - 1). `deliveries` siempre es `deliveredBy.length`.
- En DynamoDB, `currentOrderId` no se limpia al entregar; el snapshot lo calcula con la regla de arriba.

### Reconexión

Al entrar (o al volver tras perder conexión / recargar): `GET /games/{code}` para el estado completo, y luego suscribirse al canal. `seq` del snapshot es el último evento ya reflejado en él: descarta eventos con `seq <= snapshot.seq`.

## Eventos — canal `/game/{code}`

Sobre común: `{type, seq, at, data}`. `seq` es correlativo por partida; si el cliente detecta un salto, espera ~1 s a que llegue lo que falta y, si sigue faltando, vuelve a pedir el snapshot.

AppSync Events **no respeta el orden dentro de un mismo publish por lotes** (medido: `2,5,3,7,6,4`). El cliente reordena por `seq`.

| Evento | Datos |
|---|---|
| `player.joined` | `playerId, nickname` |
| `game.started` | `startedAt, rushAt, endsAt` |
| `order.opened` | `orderId, title, difficulty, basePoints, expiresAt` |
| `order.taken` | `orderId, playerId` |
| `order.delivered` | `orderId, playerId, rank, points, scores` |
| `dish.burned` | `playerId, orderId, penalty, scores` |
| `order.expired` | `orderId` |
| `condiment.earned` | `playerId` |
| `sabotage.applied` | `fromPlayerId, toPlayerId, rule` |
| `sabotage.cleared` | `playerId` |
| `rush.started` | — |
| `game.finished` | `podium, awards (id de premio → playerId), scores` |

Los eventos que mueven puntos llevan `scores` completo (no deltas), para tolerar eventos perdidos.

### Rotación de comandas (reloj)

- 5 *slots*. Al empezar se abren 5 a la vez (mezcla fácil/fácil/media/media/difícil). Un slot se libera cuando su comanda **vence** (`order.expired`) o cuando **se llena** (3 entregas): en ambos casos se abre otra de inmediato (`order.opened`). Al vencer, `expired` va antes de `opened` en el mismo `emit`.
- Comanda llena: no tiene evento propio. Los clientes ya la quitan con `order.delivered` rank 3; el snapshot no la lista (`orders[]` omite las que tienen `deliveries >= 3`, y por eso `currentOrderId` de quien la cocinaba es `null`). Cuando pasa su `expiresAt` **no** se emite `order.expired`. El reemplazo llega ~1-2 s después de la 3ª entrega; si el aviso de la API se pierde, como mucho ~30 s después (el reloj nunca espera más de 30 s).
- Reloj por dificultad (`ORDER_CLOCK_MS`). `expiresAt` se **recorta a `endsAt`**: ninguna comanda sobrevive a la partida, y las que terminan con la partida no emiten `order.expired` (basta `game.finished`).
- No se abre una comanda si queda menos del 50 % de su reloj hasta `endsAt` (ej. difícil necesita ≥ 5 min); si ninguna dificultad cabe, el slot queda vacío.
- El reloj es reactivo: en cada tick lee las comandas de DynamoDB y decide (`decideTick`, puro, en `packages/clock/src/schedule.ts`). El PRNG se siembra con código de partida + contador de comandas; ids `o01`, `o02`… Ver ADR 0002.
- `order.opened` solo lo emite el reloj; puede llegar justo antes o después de `game.started` (distintas Lambdas): usar `seq`, no el orden de llegada entre tipos.
