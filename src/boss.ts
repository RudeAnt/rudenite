import { CONFIG } from './config';

export type BossState = 'idle' | 'hurt' | 'dead';

const B = CONFIG.boss;

export class Boss {
  readonly x: number;
  readonly y: number;
  hp: number = B.hp;
  posture = 0;
  state: BossState = 'idle';
  stateFrame = 0;
  framesSinceDamage = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  private setState(next: BossState): void {
    this.state = next;
    this.stateFrame = 0;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  takeHit(damage: number, postureDamage: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - damage);
    // Полная шкала пока просто упирается в максимум; оглушение — в M3.
    this.posture = Math.min(B.postureMax, this.posture + postureDamage);
    this.framesSinceDamage = 0;
    this.setState(this.hp === 0 ? 'dead' : 'hurt'); // повторное попадание перезапускает вспышку
  }

  // Один кадр логики.
  tick(): void {
    this.stateFrame++;
    if (!this.alive) return;

    this.framesSinceDamage++;
    if (this.framesSinceDamage >= B.postureRegenDelay) {
      this.posture = Math.max(0, this.posture - B.postureRegenRate);
    }

    switch (this.state) {
      case 'hurt':
        if (this.stateFrame >= B.hurtFrames) this.setState('idle');
        break;
      case 'idle':
        break;
    }
  }
}

// Проверка баланса: может ли спам обычных ударов заполнить posture.
// Хитстоп замораживает и босса, поэтому в расчёт не входит.
export function checkPostureBalance(): void {
  const a = CONFIG.player.attack;
  const cycle = a.startup + a.active + a.recovery;
  const regenPerCycle = Math.max(0, cycle - B.postureRegenDelay) * B.postureRegenRate;
  if (a.postureDamage >= regenPerCycle) {
    console.warn(
      `[config] спам ударов заполнит posture: +${a.postureDamage} за удар, регенерация ${regenPerCycle.toFixed(1)} за цикл ${cycle} кадров`,
    );
  }
}
