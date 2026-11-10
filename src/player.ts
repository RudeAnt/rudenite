import { CONFIG } from './config';
import type { InputFrame } from './input';

export type PlayerState = 'idle' | 'move' | 'attack' | 'hurt' | 'dead';
export type AttackPhase = 'startup' | 'active' | 'recovery';

const P = CONFIG.player;
const ATK = P.attack;
const ATTACK_TOTAL = ATK.startup + ATK.active + ATK.recovery;
const LUNGE_START = Math.max(0, ATK.startup - ATK.lunge.lead); // кадр удара, на котором начинается рывок
const LUNGE_NORM = (ATK.lunge.frames * (ATK.lunge.frames + 1)) / 2; // сумма весов затухания

export class Player {
  x = 0;
  y = 0;
  prevX = 0; // позиция на прошлом кадре логики — для сглаживания отрисовки
  prevY = 0;
  vx = 0; // скорость бега (инерция), мир. ед. за кадр
  vy = 0;
  moveScale = 1; // текущий множитель максимальной скорости (по фазе удара / состоянию)
  lungeStep = 0; // смещение рывка на этом кадре, мир. ед. (0 — рывка нет)
  aimAngle = 0;
  aimSector = 0;
  state: PlayerState = 'idle';
  stateFrame = 0; // сколько кадров мы в текущем состоянии (0 — кадр входа)
  attackAngle = 0; // направление удара, зафиксированное в момент начала атаки
  attackHasHit = false; // один удар — максимум одно попадание
  hp: number = CONFIG.player.hp;
  flash = 0; // кадров вспышки от попадания осталось

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

  get alive(): boolean {
    return this.state !== 'dead';
  }

  // Попадание босса. invulnerable (debug-бессмертие) — всё как обычно, кроме потери HP.
  takeHit(damage: number, invulnerable: boolean): void {
    if (!this.alive) return;
    if (!invulnerable) this.hp = Math.max(0, this.hp - damage);
    this.flash = CONFIG.player.hurtFlashFrames;
    this.state = this.hp === 0 ? 'dead' : 'hurt'; // повторное попадание перезапускает оцепенение
    this.stateFrame = 0;
  }

  // Один кадр логики (1/60 с).
  tick(input: InputFrame): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stateFrame++;
    if (this.flash > 0) this.flash--;
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
      case 'hurt':
        if (this.stateFrame >= CONFIG.player.staggerFrames) this.setState(free);
        break;
      case 'dead':
        break;
    }

    this.updateMovement(input);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  // Бег с инерцией (во всех состояниях, кроме смерти) + рывок удара.
  // Всё в кадрах логики, поэтому хитстоп-замедление замедляет и инерцию.
  private updateMovement(input: InputFrame): void {
    if (!this.alive) {
      this.vx = this.vy = 0;
      this.moveScale = 0;
      this.lungeStep = 0;
      return;
    }

    const phase = this.attackPhase;
    this.moveScale = phase ? ATK.moveScale[phase] : this.state === 'hurt' ? 0 : 1;
    const max = P.speed * this.moveScale;
    const tx = input.moveX * max;
    const ty = input.moveY * max;

    // Скорость тянется к желаемой: разгон, если желаемая не медленнее текущей, иначе торможение.
    const dx = tx - this.vx;
    const dy = ty - this.vy;
    const dist = Math.hypot(dx, dy);
    const rate = Math.hypot(tx, ty) >= this.speed ? P.accel : P.decel;
    if (dist <= rate) {
      this.vx = tx;
      this.vy = ty;
    } else {
      this.vx += (dx / dist) * rate;
      this.vy += (dy / dist) * rate;
    }

    // Рывок: линейно затухающее смещение по зафиксированному направлению удара.
    const li = this.stateFrame - LUNGE_START;
    this.lungeStep = phase && li >= 0 && li < ATK.lunge.frames ? (ATK.lunge.distance * (ATK.lunge.frames - li)) / LUNGE_NORM : 0;

    this.x += this.vx + Math.cos(this.attackAngle) * this.lungeStep;
    this.y += this.vy + Math.sin(this.attackAngle) * this.lungeStep;
    this.clampToArena();
  }

  // Упёрлись в стену — скорость в эту сторону гасится.
  clampToArena(): void {
    const min = P.radius;
    const max = CONFIG.arena.size - P.radius;
    if (this.x < min || this.x > max) this.vx = 0;
    if (this.y < min || this.y > max) this.vy = 0;
    this.x = Math.min(max, Math.max(min, this.x));
    this.y = Math.min(max, Math.max(min, this.y));
  }
}
