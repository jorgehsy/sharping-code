# Diseño del juego — Cocina

Términos definidos en [CONTEXT.md](../CONTEXT.md).

## Contexto

- Proyecto interno. No es público y no debe exponer información confidencial.
- Jugadores: devs senior, muy competitivos. Hasta ~10, remotos, en una misma partida.
- Lenguaje de los puzzles: solo JS/TS (por ahora).
- La IA no está permitida, pero **no** hay detección ni bloqueo. Confiamos en el equipo. Los puzzles se diseñan para que la IA ayude poco, sin obsesionarse con eso.
- Validación: los tests corren en el backend (se define en la arquitectura).

## Partida

- Dura 15 minutos. Los últimos 3 son **hora punta** y las comandas valen x2.
- Hay ~5 comandas visibles a la vez. Cuando una se cierra, entra otra.
- Una sola cocina.
- Se puede entrar con la partida empezada; arrancas con 0 puntos.

## Comandas

| Dificultad | Reloj aprox. |
|------------|--------------|
| Fácil      | 3 min        |
| Media      | 6 min        |
| Difícil    | 10 min       |

- Un jugador cocina **una comanda a la vez**.
- Una comanda **no se bloquea**: varios jugadores pueden cocinarla al mismo tiempo.
- La comanda sigue abierta hasta que se acaba su reloj (**el cliente se va**).

## Puntaje

- **Entregas que bajan de valor**: 1ª entrega 100%, 2ª 60%, 3ª 30% de los puntos base.
- **Plato mal hecho**: multa fija (ej. -10). Se puede reintentar.
- **Hora punta**: x2.
- **Empate**: gana quien llegó primero a ese puntaje.

## Sabotaje

- Solo las comandas **difíciles** dan condimento, y solo a la **1ª entrega** _(supuesto, por confirmar)_.
- Máximo 2 condimentos guardados.
- El sabotaje se **pega al jugador** hasta su próxima entrega correcta, cocine la comanda que cocine. Cambiar de comanda no lo quita.
- Un jugador puede tener como máximo 1 sabotaje activo a la vez.

## Catálogo de puzzles

- Se escriben a mano y se revisan por PR.
- El autor de un puzzle no lo recibe en la partida.
- Los puzzles viven en este mismo repo. Cualquiera del equipo puede ver soluciones y casos ocultos: lo aceptamos, igual que con la IA.

### Formato

Una carpeta por puzzle:

```
puzzles/
  suma-de-pares/
    puzzle.md      # frontmatter + enunciado
    cases.json     # casos públicos y ocultos
    solution.ts    # solución de referencia (solo CI)
```

`puzzle.md`:

```md
---
id: suma-de-pares
title: Suma de pares
difficulty: easy        # easy | medium | hard
author: jorgesimoes
signature: "function solve(nums: number[]): number"
tags: [arrays]
blockedSabotages: []    # sabotajes que no aplican a este puzzle
---

Enunciado...
```

`cases.json`:

```json
{
  "public": [{ "input": [[1, 2, 3, 4]], "output": 6 }],
  "hidden": [{ "input": [[]], "output": 0 }]
}
```

Reglas:

- Los tests son **datos** (entrada → salida), no código. `input` es la lista de argumentos.
- `public` se muestra en la comanda como ejemplos. `hidden` solo lo corre el backend.
- La salida se compara con deep equal.
- CI corre `solution.ts` contra todos los casos. Si falla, el PR no entra.
- Para casos que no se expresan como datos (errores, async), más adelante: `checker.ts` opcional.

## Final

- Podio 1º / 2º / 3º.
- Premios graciosos (ej. "más saboteado", "más platos quemados").

## Para después

- Modalidades: **caja negra**, **caza de bugs**, **code golf** (pueden entrar como tipos de comanda).
- Modalidad **cocina por bloques** (estilo Human Resource Machine): en vez de escribir JS, se arma el programa con bloques ya hechos (ciclos, condicionales, saltos) y el cocinero lo ejecuta paso a paso en la cocina.
  - A favor: encaja con Phaser (arrastrar bloques en el canvas), ver la ejecución es divertido, el runner pasa a ser un intérprete propio (sin ejecutar JS del jugador) y los sabotajes salen solos ("sin saltos", "máx. 6 bloques").
  - En contra: es otro tipo de juego (resolver con pocas piezas, no programar rápido), cuesta bastante (editor + intérprete + animación) y no frena a la IA (le copias el enunciado y te da los bloques).
  - Antes de adoptarla: prototipo de 1 día con 2 puzzles y probarlo con 2-3 colegas.
- Varias cocinas (equipos).
- Más lenguajes.

## Abierto

- Valores exactos de puntos base por dificultad.
- Lista de condimentos.

Arquitectura: [architecture.md](architecture.md).
