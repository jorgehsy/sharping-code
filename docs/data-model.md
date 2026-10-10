# Modelo de datos (DynamoDB)

Single table (env `TABLE_NAME`), claves `pk` / `sk`, TTL en el atributo `ttl` (epoch segundos, creación + 24 h). Código: `packages/platform/src/table.ts`.

Todos los ítems de una partida comparten `pk = GAME#{code}`, así que un `Query` por `pk` trae todo.

| `sk` | Contenido |
|---|---|
| `META` | `status` (`lobby`/`running`/`finished`), `hostPlayerId`, `createdAt`, `startedAt?`, `rushAt?`, `endsAt?`, `seq` |
| `PLAYER#{playerId}` | `nickname`, `score`, `scoreUpdatedAt?` (desempate: quién llegó antes al puntaje), `joinedAt`, `currentOrderId?`, `condiments`, `sabotage?` |
| `TOKEN#{playerToken}` | `playerId` (token → jugador con un `GetItem`) |
| `ORDER#{orderId}` | `puzzleId`, `title`, `difficulty`, `basePoints`, `openedAt`, `expiresAt`, `deliveries`, `deliveredBy?` (set de playerIds con entrega ranqueada) |

## Notas

- `seq` de `META` es el contador de eventos. `emit()` reserva N números con un solo `UpdateItem ADD seq :n` (`UPDATED_NEW`), así el `seq` es correlativo por partida incluso con publicadores concurrentes (lambdalith y reloj).
- Rank de entrega: update condicional sobre `ORDER#` (`ADD deliveries 1, deliveredBy {player}` con condición `deliveries < 3 AND expiresAt > :now AND player ∉ deliveredBy`); el valor resultante es el rank (1º/2º/3º). Si falla por `deliveries >= 3` es una 4ª entrega (0 puntos). Los puntos se aplican después en `PLAYER`: no es una transacción única (el rank hay que leerlo antes), una caída entre medias deja la entrega contada sin puntos.
- `ORDER#` lo escribe el reloj (`PutItem` condicional `attribute_not_exists`, idempotente ante reintentos del step) en el mismo step que emite `order.opened`. Los vencidos se quedan hasta el TTL; el API filtra por `expiresAt`.
- Sabotaje: transacción con `condiments >= 1` (atacante), `attribute_not_exists(sabotage)` (objetivo) y `META.status = running`.
- Catálogo de puzzles: `packages/game/src/catalog.generated.ts`, generado desde `puzzles/` con `pnpm gen:catalog` (se regenera en `cdk:synth`/`cdk:deploy`; `validate:puzzles` y un test fallan si está desactualizado). Va dentro del bundle de las Lambdas.
- Los ítems `TOKEN#` son independientes de `PLAYER#` para que la validación de cada acción sea un `GetItem` directo.
- Sin GSI: no hay accesos fuera de la partición de una partida.
