---
id: saldo-negativo
title: Caja en rojo
difficulty: easy
author: jorgesimoes
signature: "function solve(moves: number[]): number"
tags: [loops]
blockedSabotages: []
---

La caja empieza en 0 y aplica los movimientos en orden (positivo entra dinero, negativo sale). **Devuelve la posición del primer movimiento tras el cual el saldo queda por debajo de 0**, contando desde 0. Si nunca pasa, devuelve `-1`.
