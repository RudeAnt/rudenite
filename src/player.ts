import { CONFIG } from './config';
import type { InputFrame } from './input';

export type PlayerState = 'idle' | 'move';

export class Player {
  x = 0;
  y = 0;
  prevX = 0; // позиция на прошлом кадре логики — для сглаживания отрисовки
  prevY = 0;
  aimAngle = 0;
  aimSector = 0;
  state: PlayerState = 'idle';
  stateFrame = 0; // сколько кадров мы в текущем состоянии

  constructor(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  private setState(next: PlayerState): void {
    if (next === this.state) return;
    this.state = next;
    this.stateFrame = 0;
  }

  // Один кадр логики (1/60 с).
  tick(input: InputFrame): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stateFrame++;
    this.aimAngle = input.aimAngle;
    this.aimSector = input.aimSector;

    const wantsMove = input.moveX !== 0 || input.moveY !== 0;

    switch (this.state) {
      case 'idle':
        if (wantsMove) this.setState('move');
        break;
      case 'move':
        if (!wantsMove) this.setState('idle');
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
