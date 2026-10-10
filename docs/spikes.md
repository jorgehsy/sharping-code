# Resultados de spikes — 2026-10-09

Cuenta sandbox `wwps-sandbox`, `us-east-1`. Código en `spikes/`.

## Runner (`spikes/runner`)

- Lambda arm64, Node 24, 1 GB, sin VPC. Asset 132 KB.
- Latencia medida desde el cliente (incluye red hasta us-east-1):
  - Cold: ~2.1 s (handler interno ~300 ms).
  - Warm: p50 207 ms, p95 239 ms. Handler interno p50 61 ms.
- Aislamiento verificado en Lambda real:
  - `process.env` vacío ✅
  - Leer `/proc/<ppid>/environ` → bloqueado por `--permission` ✅
  - `child_process` → bloqueado ✅
  - `fetch` a internet → **funciona** (aceptado: no hay credenciales ni fs).
  - TS con `enum` y funciones `async` → OK.

## Reloj durable (`spikes/clock`)

- Partida de 180 s, 9 eventos, publicados a AppSync Events por HTTP con IAM.
- Precisión del reloj (`at - plannedAt`): 0–67 ms, salvo el primer evento (645 ms, cold start).
- Entrega AppSync → cliente: ~250–550 ms (incluye red al cliente y ~76 ms de desfase del reloj local).
- Sin huecos en `seq`.
- Bug encontrado: banner de esbuild declaraba `createRequire` dos veces → corregido con alias.

## Conclusión

Las dos piezas riesgosas funcionan. La arquitectura se mantiene.

## Esqueleto en AWS (2026-10-09)

Partida real de 15 min contra `SharpingCodeStack`, escuchando el canal:

- Eventos #1–#4 sin saltos (`player.joined`, `game.started`, `rush.started`, `game.finished`).
- `rush.started` (espera de 12 min): **2,8 s tarde**. La durable function despertó ~1,8 s después de lo pedido (pedía 1 s antes) y arrancó en frío (init 350 ms + SDK). Entrega AppSync: 0,8 s.
- `game.finished` (espera de 3 min): 0,7 s tarde; entrega 0,45 s.
- Ajuste: `WAIT_MARGIN_MS` 1000 → 5000 y tope de sueño en el step 5 → 8 s. Pendiente re-medir.
- API en frío: 1–1,6 s por llamada.
