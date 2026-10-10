# Sharping Code — Glosario

Juego multijugador interno para el equipo de desarrollo. Una cocina recibe comandas, y cada comanda es un pequeño puzzle de programación en JS/TS.

Reglas del juego: [docs/game-design.md](docs/game-design.md).

## Términos

- **Partida**: una sesión de juego de 15 minutos. Hasta ~10 jugadores remotos conectados a la misma partida.
- **Cocina**: el espacio compartido de una partida. Hay una sola cocina por partida.
- **Jugador**: un participante. Cocina como máximo una comanda a la vez.
- **Comanda**: un puzzle de programación (enunciado + tests) que entra a la cocina. Tiene dificultad, puntos y un reloj. Varios jugadores pueden cocinar la misma comanda; no se bloquea.
- **Dificultad**: fácil, media o difícil. Define los puntos base y el reloj de la comanda.
- **Entrega**: cuando un jugador envía su solución y pasa todos los tests en el backend.
- **Degustar** (`taste`): correr tu código contra los casos públicos de la comanda antes de entregar. Gratis: no da puntos ni multa. Pasar no garantiza pasar los casos ocultos.
- **Plato mal hecho**: una entrega que falla los tests. Cuesta una multa fija.
- **Cliente se va**: el reloj de la comanda llega a cero. La comanda se cierra y ya no admite entregas.
- **Hora punta**: los últimos 3 minutos de la partida. Las comandas valen el doble.
- **Condimento**: un sabotaje que se gana al ser el primero en entregar una comanda difícil. Se usa contra otro jugador.
- **Sabotaje**: una restricción extra (por ejemplo "sin bucles" o "máximo 3 líneas") pegada a un jugador hasta su próxima entrega correcta.
- **Catálogo**: el banco de puzzles. Cada puzzle es un archivo en el repo, escrito a mano y revisado por PR.
- **Autor**: el jugador que escribió un puzzle del catálogo. Ese puzzle no le aparece en la partida.
- **Podio**: 1º, 2º y 3º lugar al final de la partida, más premios graciosos.
