---
id: palindromo-casi
title: Casi palíndromo
difficulty: medium
author: jorgesimoes
signature: "function solve(s: string): boolean"
tags: [strings, two-pointers]
blockedSabotages: []
---

El cliente quiere saber si un texto es un **palíndromo** o puede llegar a serlo **eliminando como máximo un carácter**.

Compara tal cual: sin ignorar mayúsculas, espacios ni signos.

Ejemplos:

- `"aba"` → `true` (ya es palíndromo)
- `"abca"` → `true` (quitando `"c"` o `"b"`)
- `"abc"` → `false`
