---
id: hornos-compartidos
title: Hornos compartidos
difficulty: hard
author: jorgesimoes
signature: "function solve(dishes: [number, number][]): number[]"
tags: [intervals, greedy, simulation]
blockedSabotages: [max-lines-3]
---

La cocina tiene hornos numerados `0, 1, 2, ...` (tantos como hagan falta). Cada plato `[inicio, fin]` ocupa un horno desde `inicio` hasta `fin`. El horno queda libre **justo en** `fin`: otro plato que empieza en `fin` puede usarlo.

Los platos se asignan en orden de `inicio`. Si dos empiezan a la vez, va primero el que aparece antes en la lista. A cada plato le toca el horno libre con el **número más bajo**.

Devuelve, para cada plato **en el orden de la lista original**, el número de horno que le tocó.

Detalles:

- `inicio < fin`, todos enteros `>= 0`. La lista puede venir desordenada o vacía.
