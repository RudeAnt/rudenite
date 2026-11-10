import Phaser from 'phaser';
import { CONFIG, type BossAttack, type BossAttackStep } from './config';

// idle → chase → telegraph → active → recovery → (следующий шаг комбо: telegraph) | idle
export type BossState = 'idle' | 'chase' | 'telegraph' | 'active' | 'recovery' | 'dead';

// То, что босс знает об игроке.
export interface BossTarget {
  x: number;
  y: number;
  alive: boolean;
}

const B = CONFIG.boss;
const TURN = Phaser.Math.DegToRad(B.turnSpeed);

export class Boss {
  x: number;
  y: number;
  prevX: number; // позиция на прошлом кадре логики — для сглаживания отрисовки
  prevY: number;
  facing: number; // направление взгляда, радианы в мире; по нему ориентирована зона атаки
  hp: number = B.hp;
  posture = 0;
  state: BossState = 'idle';
  stateFrame = 0;
  framesSinceDamage = 0;
  flash = 0; // кадров вспышки от попадания осталось (не состояние: атаку не прерывает)

  attackIndex = -1; // индекс в CONFIG.boss.attacks; -1 — нет текущей атаки
  stepIndex = 0;
  stepHasHit = false; // один шаг — максимум одно попадание
  forcedNext: number | null = null; // debug: какую атаку выбрать следующей
  private lastAttack = -1;
  private repeatCount = 0;

  constructor(x: number, y: number, facing: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.facing = facing;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get attack(): BossAttack | null {
    return this.attackIndex >= 0 ? B.attacks[this.attackIndex] : null;
  }

  // Текущий шаг атаки (во время telegraph/active/recovery), иначе null.
  get step(): BossAttackStep | null {
    const a = this.attack;
    if (!a || (this.state !== 'telegraph' && this.state !== 'active' && this.state !== 'recovery')) return null;
    return a.steps[this.stepIndex];
  }

  // Доворачивается ли босс сейчас к игроку во время телеграфа.
  get tracking(): boolean {
    const s = this.step;
    return this.state === 'telegraph' && s !== null && this.stateFrame < s.track;
  }

  private setState(next: BossState): void {
    this.state = next;
    this.stateFrame = 0;
  }

  takeHit(damage: number, postureDamage: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - damage);
    // Полная шкала пока просто упирается в максимум; оглушение — в M3.
    this.posture = Math.min(B.postureMax, this.posture + postureDamage);
    this.framesSinceDamage = 0;
    this.flash = B.hurtFrames;
    if (this.hp === 0) {
      this.attackIndex = -1;
      this.setState('dead');
    }
  }

  // Один кадр логики.
  tick(target: BossTarget): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stateFrame++;
    if (this.flash > 0) this.flash--;
    if (!this.alive) return;

    this.framesSinceDamage++;
    if (this.framesSinceDamage >= B.postureRegenDelay) {
      this.posture = Math.max(0, this.posture - B.postureRegenRate);
    }

    // Игрок погиб — босс прерывает всё и стоит.
    if (!target.alive) {
      if (this.state !== 'idle') {
        this.attackIndex = -1;
        this.setState('idle');
      }
      return;
    }

    switch (this.state) {
      case 'idle':
        this.turnToward(target);
        if (this.stateFrame >= B.idleFrames) {
          this.attackIndex = this.chooseAttack();
          this.stepIndex = 0;
          this.setState('chase');
          this.chase(target); // уже на дистанции — атака начнётся в этом же кадре
        }
        break;
      case 'chase':
        this.turnToward(target);
        this.chase(target);
        break;
      case 'telegraph': {
        const s = this.step!;
        if (this.stateFrame < s.track) this.turnToward(target);
        if (this.stateFrame >= s.telegraph) {
          this.stepHasHit = false;
          this.setState('active');
        }
        break;
      }
      case 'active':
        if (this.stateFrame >= this.step!.active) this.setState('recovery');
        break;
      case 'recovery':
        if (this.stateFrame >= this.step!.recovery) {
          if (this.stepIndex + 1 < this.attack!.steps.length) {
            this.stepIndex++;
            this.setState('telegraph');
          } else {
            this.attackIndex = -1;
            this.setState('idle');
          }
        }
        break;
    }
  }

  // Идём к игроку, пока не окажемся на дистанции атаки; тогда — телеграф первого шага.
  private chase(target: BossTarget): void {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const engage = this.attack!.engage;
    if (dist <= engage) {
      this.setState('telegraph');
      return;
    }
    const stepLen = Math.min(B.chaseSpeed, dist - engage);
    this.x += (dx / dist) * stepLen;
    this.y += (dy / dist) * stepLen;
    this.clampToArena();
  }

  private turnToward(target: BossTarget): void {
    const want = Math.atan2(target.y - this.y, target.x - this.x);
    const diff = Phaser.Math.Angle.Wrap(want - this.facing);
    this.facing = Phaser.Math.Angle.Wrap(this.facing + Phaser.Math.Clamp(diff, -TURN, TURN));
  }

  // Случайный выбор по весам; одна атака не больше B.maxRepeat раз подряд.
  private chooseAttack(): number {
    const list = B.attacks;
    let pick: number;
    if (this.forcedNext !== null && this.forcedNext < list.length) {
      pick = this.forcedNext;
    } else {
      const banned = this.repeatCount >= B.maxRepeat ? this.lastAttack : -1;
      const total = list.reduce((sum, a, i) => (i === banned ? sum : sum + a.weight), 0);
      let r = Math.random() * total;
      pick = list.findIndex((a, i) => i !== banned && (r -= a.weight) < 0);
      if (pick < 0) pick = list.findIndex((_, i) => i !== banned);
    }
    this.forcedNext = null;
    this.repeatCount = pick === this.lastAttack ? this.repeatCount + 1 : 1;
    this.lastAttack = pick;
    return pick;
  }

  clampToArena(): void {
    const min = B.radius;
    const max = CONFIG.arena.size - B.radius;
    this.x = Math.min(max, Math.max(min, this.x));
    this.y = Math.min(max, Math.max(min, this.y));
  }
}

// Проверки config при старте (предупреждения в консоль).
// Posture: может ли спам обычных ударов заполнить шкалу. Хитстоп замораживает и босса, в расчёт не входит.
export function checkConfig(): void {
  const a = CONFIG.player.attack;
  const cycle = a.startup + a.active + a.recovery;
  const regenPerCycle = Math.max(0, cycle - B.postureRegenDelay) * B.postureRegenRate;
  if (a.postureDamage >= regenPerCycle) {
    console.warn(
      `[config] спам ударов заполнит posture: +${a.postureDamage} за удар, регенерация ${regenPerCycle.toFixed(1)} за цикл ${cycle} кадров`,
    );
  }
  const atk = CONFIG.player.attack;
  if (atk.lunge.lead > atk.startup) {
    console.warn(`[config] lunge.lead ${atk.lunge.lead} > attack.startup ${atk.startup}: рывок начнётся с первого кадра удара`);
  }
  if (B.chaseSpeed >= CONFIG.player.speed) {
    console.warn(`[config] босс ходит не медленнее игрока: chaseSpeed ${B.chaseSpeed} >= player.speed ${CONFIG.player.speed}`);
  }
}
