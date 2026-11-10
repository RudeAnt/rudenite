import Phaser from 'phaser';
import type { Boss } from './boss';
import { CONFIG } from './config';
import type { Player } from './player';
import { floorArc, worldToScreen } from './world/iso';

export interface DebugInfo {
  tick: number;
  hitstop: number; // сколько кадров хитстопа осталось
  buffer: string; // содержимое буфера ввода
}

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
      .text(v.debugMargin, v.debugMargin, 'WASD — бег · E — удар · R — рестарт · F1 — debug', { ...style, color: v.hintTextColor })
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

  // Всё рисуется по реальной позиции логики, без сглаживания.
  draw(g: Phaser.GameObjects.Graphics, player: Player, boss: Boss, info: DebugInfo): void {
    this.text.setVisible(this.enabled);
    this.hint.setVisible(!this.enabled);
    if (!this.enabled) return;
    const v = CONFIG.view;
    const center = worldToScreen(player.x, player.y);

    // Сектор прицела: клин на полу.
    const n = CONFIG.aim.sectors;
    const size = (Math.PI * 2) / n;
    const from = player.aimSector * size - size / 2;
    g.fillStyle(v.debugSector, v.debugSectorAlpha);
    g.fillPoints([center, ...floorArc(player.x, player.y, v.debugSectorRadius, from, from + size, v.debugSectorSteps)], true);

    // Дуга удара: серая в startup/recovery, красная в active.
    const phase = player.attackPhase;
    if (phase) {
      const half = Phaser.Math.DegToRad(CONFIG.player.attack.arc) / 2;
      const arc = floorArc(player.x, player.y, CONFIG.player.attack.range, player.attackAngle - half, player.attackAngle + half, v.swingSteps);
      g.lineStyle(phase === 'active' ? 2 : 1, phase === 'active' ? v.debugAttackActive : v.debugAttackInactive, 1);
      g.strokePoints([center, ...arc], true);
    }

    // Хитбокс игрока и хёртбокс босса: круги в мире (на экране — эллипсы).
    g.lineStyle(1, v.debugHitbox, 1);
    g.strokePoints(floorArc(player.x, player.y, CONFIG.player.radius, 0, Math.PI * 2, v.debugCircleSteps), true);
    g.lineStyle(1, v.debugHurtbox, 1);
    g.strokePoints(floorArc(boss.x, boss.y, CONFIG.boss.radius, 0, Math.PI * 2, v.debugCircleSteps), true);

    const mode = this.paused ? 'ПАУЗА (F4 — шаг)' : this.slowMo ? `SLOW x${CONFIG.sim.slowMoScale}` : 'x1';
    this.text.setText(
      [
        `DEBUG  [F1 оверлей] [F2 slow-mo] [F3 пауза] [F4 шаг] [R рестарт]`,
        `время: ${mode}   кадр логики: ${info.tick}   fps: ${Math.round(this.scene.game.loop.actualFps)}`,
        `хитстоп: ${info.hitstop}   буфер: ${info.buffer}`,
        `player: ${player.state}${phase ? ` (${phase})` : ''}  кадр в состоянии: ${player.stateFrame}`,
        `pos: ${player.x.toFixed(0)}, ${player.y.toFixed(0)}`,
        `aim: ${Phaser.Math.RadToDeg(player.aimAngle).toFixed(0)}°  сектор ${player.aimSector}/${n}`,
        `boss: ${boss.state}  кадр: ${boss.stateFrame}  hp ${boss.hp}/${CONFIG.boss.hp}  posture ${boss.posture.toFixed(1)}/${CONFIG.boss.postureMax}  без урона: ${boss.framesSinceDamage}`,
      ].join('\n'),
    );
  }
}
