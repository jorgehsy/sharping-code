import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, KitchenScene, type KitchenDeps } from './KitchenScene.ts';

/**
 * Starts the tavern inside `parent` (sized by CSS, 5:3). Phaser only displays: its own input is off so it
 * never touches keyboard focus (Monaco, Alt+K and the other shortcuts stay with the page).
 * Always pair with `game.destroy(true)` on unmount.
 */
export function createKitchenGame(parent: HTMLElement, deps: KitchenDeps): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#000000',
    pixelArt: true,
    banner: false,
    autoFocus: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new KitchenScene(deps),
  });
}
