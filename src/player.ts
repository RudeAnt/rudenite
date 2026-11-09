import { CONFIG } from './config';
import type { InputFrame } from './input';

export type PlayerState = 'idle' | 'move' | 'attack';
export type AttackPhase = 'startup' | 'active' | 'recovery';

const ATK = CONFIG.player.attack;
const ATTACK_TOTAL = ATK.startup + ATK.active + ATK.recovery;

export class Player {
  x = 0;
  y = 0;
  prevX = 0; // позиция на прошлом кадре логики — для сглаживания отрисовки
  prevY = 0;
  aimAngle = 0;
  aimSector = 0;
  state: PlayerState = 'idle';
  stateFrame = 0; // сколько кадров мы в текущем состоянии (0 — кадр входа)
  attackAngle = 0; // направление удара, зафиксированное в момент начала атаки
  attackHasHit = false; // один удар — максимум одно попадание

  constructor(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  get attackPhase(): AttackPhase | null {
    if (this.state !== 'attack') return null;
    if (this.stateFrame < ATK.startup) return 'startup';
    if (this.stateFrame < ATK.startup + ATK.active) return 'active';
    return 'recovery';
  }

  private setState(next: PlayerState): void {
    if (next === this.state) return;
    this.state = next;
    this.stateFrame = 0;
  }

  // Вход в атаку — отдельно от setState: атака может перезапуститься из атаки.
  private startAttack(angle: number): void {
    this.state = 'attack';
    this.stateFrame = 0;
    this.attackAngle = angle;
    this.attackHasHit = false;
  }

  // Убрать сглаживание (кадр не сдвинулся — например, хитстоп).
  holdPosition(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  // Один кадр логики (1/60 с).
  tick(input: InputFrame): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stateFrame++;
    this.aimAngle = input.aimAngle;
    this.aimSector = input.aimSector;

    const wantsMove = input.moveX !== 0 || input.moveY !== 0;
    const free = wantsMove ? 'move' : 'idle';

    switch (this.state) {
      case 'idle':
      case 'move':
        if (input.actions.consume('attack')) this.startAttack(input.aimAngle);
        else this.setState(free);
        break;
      case 'attack':
        if (this.stateFrame >= ATTACK_TOTAL) {
          if (input.actions.consume('attack')) this.startAttack(input.aimAngle);
          else this.setState(free);
        }
        break;
    }

    if (this.state === 'move') {
      this.x += input.moveX * CONFIG.player.speed;
      this.y += input.moveY * CONFIG.player.speed;
      this.clampToArena();
    }
  }

  private clampToArena(): void {
    const min = CONFIG.player.radius;
    const max = CONFIG.arena.size - CONFIG.player.radius;
    this.x = Math.min(max, Math.max(min, this.x));
    this.y = Math.min(max, Math.max(min, this.y));
  }
}
