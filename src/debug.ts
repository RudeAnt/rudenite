import Phaser from 'phaser';
import type { Boss } from './boss';
import { CONFIG } from './config';
import type { Player } from './player';
import { requiredGuardAngle } from './combat';
import { zonePolygon } from './draw';
import { angleToSector } from './input';
import { floorArc, worldToScreen } from './world/iso';

export interface DebugInfo {
  tick: number; // кадров логики
  realTick: number; // реальных кадров
  time: string; // масштаб времени и хитстоп
  buffer: string; // содержимое буфера ввода
}

// F1 — оверлей, F2 — slow-motion, F3 — пауза, F4 — шаг на один кадр (на паузе).
// Только при включённом оверлее: G — бессмертие игрока, 1–6 — следующая атака босса.
export class Debug {
  enabled = false;
  slowMo = false;
  paused = false;
  stepRequested = false;
  immortal = false;
  forcedAttack: number | null = null; // сцена забирает и передаёт боссу

  private kImmortal: Phaser.Input.Keyboard.Key;
  private kAttacks: Phaser.Input.Keyboard.Key[];
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
    this.kImmortal = kb.addKey(K.G);
    const digits = [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX, K.SEVEN, K.EIGHT, K.NINE];
    this.kAttacks = digits.slice(0, CONFIG.boss.attacks.length).map((code) => kb.addKey(code));

    const style = { fontFamily: 'monospace', fontSize: `${v.debugFontSize}px` };
    this.text = scene.add
      .text(v.debugMargin, v.debugMargin, '', { ...style, color: v.debugTextColor })
      .setScrollFactor(0)
      .setDepth(100);
    this.hint = scene.add
      .text(v.debugMargin, v.debugMargin, 'WASD — бег · ПКМ — удар · R — рестарт · F1 — debug', { ...style, color: v.hintTextColor })
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
    if (!this.enabled) return;
    if (just(this.kImmortal)) this.immortal = !this.immortal;
    this.kAttacks.forEach((k, i) => {
      if (just(k)) this.forcedAttack = i;
    });
  }

  // Подсказка видна, пока оверлей выключен; бессмертие не должно потеряться из виду.
  private updateHint(): void {
    const v = CONFIG.view;
    this.hint.setVisible(!this.enabled);
    this.hint.setText(`WASD — бег · ПКМ — удар · R — рестарт · F1 — debug${this.immortal ? '   [БЕССМЕРТИЕ]' : ''}`);
    this.hint.setColor(this.immortal ? v.immortalTextColor : v.hintTextColor);
  }

  get timeScale(): number {
    return this.slowMo ? CONFIG.sim.slowMoScale : 1;
  }

  // Всё рисуется по реальной позиции логики, без сглаживания.
  draw(g: Phaser.GameObjects.Graphics, player: Player, boss: Boss, info: DebugInfo): void {
    this.text.setVisible(this.enabled);
    this.updateHint();
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

    // Взгляд босса и зона текущего шага (во всех фазах шага).
    const bossCenter = worldToScreen(boss.x, boss.y);
    const look = worldToScreen(boss.x + Math.cos(boss.facing) * v.debugFacingLen, boss.y + Math.sin(boss.facing) * v.debugFacingLen);
    g.lineStyle(1, v.debugBossZone, 1);
    g.lineBetween(bossCenter.x, bossCenter.y, look.x, look.y);
    const step = boss.step;
    if (step) g.strokePoints(zonePolygon(boss.x, boss.y, boss.facing, step.shape, v.telegraphSteps), true);

    const mode = this.paused ? 'ПАУЗА (F4 — шаг)' : this.slowMo ? `SLOW x${CONFIG.sim.slowMoScale}` : 'x1';
    this.text.setText(
      [
        `DEBUG  [F1 оверлей] [F2 slow-mo] [F3 пауза] [F4 реальный кадр] [R рестарт] [G бессмертие] [1–${this.kAttacks.length} атака]`,
        `время: ${mode}   кадр логики: ${info.tick}   реальный кадр: ${info.realTick}   fps: ${Math.round(this.scene.game.loop.actualFps)}`,
        info.time,
        `буфер (реальные кадры): ${info.buffer}`,
        `player: ${player.state}${phase ? ` (${phase})` : ''}  кадр в состоянии: ${player.stateFrame}`,
        `pos: ${player.x.toFixed(0)}, ${player.y.toFixed(0)}  скорость: ${player.speed.toFixed(2)}/${CONFIG.player.speed}  множитель: ${player.moveScale}  фаза удара: ${phase ?? '—'}${player.lungeStep > 0 ? `  рывок +${player.lungeStep.toFixed(1)}` : ''}`,
        `aim: ${Phaser.Math.RadToDeg(player.aimAngle).toFixed(0)}°  сектор ${player.aimSector}/${n}`,
        `player hp: ${player.hp}/${CONFIG.player.hp}   бессмертие [G]: ${this.immortal ? 'ВКЛ' : 'выкл'}`,
        `boss: ${boss.state}  кадр: ${boss.stateFrame}  hp ${boss.hp}/${CONFIG.boss.hp}  posture ${boss.posture.toFixed(1)}/${CONFIG.boss.postureMax}  без урона: ${boss.framesSinceDamage}`,
        `boss pos: ${boss.x.toFixed(0)}, ${boss.y.toFixed(0)}  взгляд: ${Phaser.Math.RadToDeg(boss.facing).toFixed(0)}°  дистанция: ${Math.hypot(player.x - boss.x, player.y - boss.y).toFixed(0)}`,
        this.attackLine(player, boss),
        `следующая атака [1–${this.kAttacks.length}]: ${this.forcedAttack !== null ? CONFIG.boss.attacks[this.forcedAttack].name : boss.forcedNext !== null ? CONFIG.boss.attacks[boss.forcedNext].name : 'случайная'}`,
      ].join('\n'),
    );
  }

  private attackLine(player: Player, boss: Boss): string {
    const atk = boss.attack;
    if (!atk) return 'атака: —';
    const step = boss.step;
    let line = `атака: ${atk.name}  шаг ${boss.stepIndex + 1}/${atk.steps.length}`;
    if (!step) return `${line}  (подход, engage ${atk.engage})`;
    const len = boss.state === 'telegraph' ? step.telegraph : boss.state === 'active' ? step.active : step.recovery;
    line += `  ${step.type}${step.type === 'directional' ? ` ${step.side}` : ''}  ${boss.state} ${boss.stateFrame}/${len}`;
    if (boss.state === 'telegraph') line += boss.tracking ? `  доворот до ${step.track}` : '  направление зафиксировано';
    const guard = requiredGuardAngle(player, boss, step);
    if (guard !== null) line += `  верный сектор ${angleToSector(guard)} (у игрока ${player.aimSector})`;
    return line;
  }
}
