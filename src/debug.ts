import Phaser from 'phaser';
import { CONFIG } from './config';
import type { Player } from './player';
import { worldToScreen } from './world/iso';

// F1 — оверлей, F2 — slow-motion, F3 — пауза, F4 — шаг на один кадр (на паузе).
export class Debug {
  enabled = false;
  slowMo = false;
  paused = false;
  stepRequested = false;

  private text: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private kOverlay: Phaser.Input.Keyboard.Key;
  private kSlow: Phaser.Input.Keyboard.Key;
  private kPause: Phaser.Input.Keyboard.Key;
  private kStep: Phaser.Input.Keyboard.Key;

  constructor(private scene: Phaser.Scene) {
    const v = CONFIG.view;
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.kOverlay = kb.addKey(K.F1);
    this.kSlow = kb.addKey(K.F2);
    this.kPause = kb.addKey(K.F3);
    this.kStep = kb.addKey(K.F4);

    const style = { fontFamily: 'monospace', fontSize: `${v.debugFontSize}px` };
    this.text = scene.add
      .text(v.debugMargin, v.debugMargin, '', { ...style, color: v.debugTextColor })
      .setScrollFactor(0)
      .setDepth(100);
    this.hint = scene.add
      .text(v.debugMargin, v.debugMargin, 'WASD — бег · F1 — debug', { ...style, color: v.hintTextColor })
      .setScrollFactor(0)
      .setDepth(100);
  }

  // Вызывается раз в кадр отрисовки.
  pollKeys(): void {
    const just = Phaser.Input.Keyboard.JustDown;
    if (just(this.kOverlay)) this.enabled = !this.enabled;
    if (just(this.kSlow)) this.slowMo = !this.slowMo;
    if (just(this.kPause)) this.paused = !this.paused;
    if (just(this.kStep) && this.paused) this.stepRequested = true;
  }

  get timeScale(): number {
    return this.slowMo ? CONFIG.sim.slowMoScale : 1;
  }

  draw(g: Phaser.GameObjects.Graphics, player: Player, tick: number): void {
    this.text.setVisible(this.enabled);
    this.hint.setVisible(!this.enabled);
    if (!this.enabled) return;
    const v = CONFIG.view;

    // Сектор прицела: клин на полу.
    const n = CONFIG.aim.sectors;
    const size = (Math.PI * 2) / n;
    const from = player.aimSector * size - size / 2;
    const pts = [worldToScreen(player.x, player.y)];
    for (let i = 0; i <= v.debugSectorSteps; i++) {
      const a = from + (size * i) / v.debugSectorSteps;
      pts.push(worldToScreen(player.x + Math.cos(a) * v.debugSectorRadius, player.y + Math.sin(a) * v.debugSectorRadius));
    }
    g.fillStyle(v.debugSector, v.debugSectorAlpha);
    g.fillPoints(pts, true);

    // Хитбокс игрока: круг в мире (на экране — эллипс). Рисуем по реальной позиции, без сглаживания.
    const circle = [];
    for (let i = 0; i < v.debugCircleSteps; i++) {
      const a = (Math.PI * 2 * i) / v.debugCircleSteps;
      circle.push(worldToScreen(player.x + Math.cos(a) * CONFIG.player.radius, player.y + Math.sin(a) * CONFIG.player.radius));
    }
    g.lineStyle(1, v.debugHitbox, 1);
    g.strokePoints(circle, true);

    const mode = this.paused ? 'ПАУЗА (F4 — шаг)' : this.slowMo ? `SLOW x${CONFIG.sim.slowMoScale}` : 'x1';
    this.text.setText(
      [
        `DEBUG  [F1 оверлей] [F2 slow-mo] [F3 пауза] [F4 шаг]`,
        `время: ${mode}   кадр логики: ${tick}   fps: ${Math.round(this.scene.game.loop.actualFps)}`,
        `player: ${player.state}  кадр в состоянии: ${player.stateFrame}`,
        `pos: ${player.x.toFixed(0)}, ${player.y.toFixed(0)}`,
        `aim: ${Phaser.Math.RadToDeg(player.aimAngle).toFixed(0)}°  сектор ${player.aimSector}/${n}`,
      ].join('\n'),
    );
  }
}
