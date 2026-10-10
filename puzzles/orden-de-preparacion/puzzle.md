---
id: orden-de-preparacion
title: Orden de preparación
difficulty: hard
author: jorgesimoes
signature: "function solve(steps: string[], deps: [string, string][]): string[] | null"
tags: [graphs, topological-sort]
blockedSabotages: [max-lines-3]
---

Una receta tiene **pasos** y **dependencias**. Cada dependencia `[a, b]` significa que `a` tiene que hacerse **antes** que `b`.

Devuelve el orden en que se hacen todos los pasos. Siempre que haya varios pasos listos para hacerse, elige primero el **menor alfabéticamente** (comparación normal de strings).

Si las dependencias forman un ciclo y la receta es imposible, devuelve `null`.

Detalles:

- Todos los pasos de `deps` están en `steps`. Puede haber dependencias repetidas.
- Un paso sin dependencias también va en el resultado.

Ejemplos:

- `steps = ["salsa", "pasta", "servir"]`, `deps = [["pasta", "servir"], ["salsa", "servir"]]` → `["pasta", "salsa", "servir"]`
- `steps = ["a", "b"]`, `deps = [["a", "b"], ["b", "a"]]` → `null`
