import Phaser from 'phaser';
import { CONFIG } from './config';
import { screenDirToWorld, screenToWorld } from './world/iso';

export type Action = 'attack';

// Буфер нажатий. Браузерные события копятся в raw между кадрами логики
// (ничего не теряется при slow-mo, паузе и хитстопе), а на кадре логики
// переходят в буфер, где живут CONFIG.input.bufferFrames кадров или пока
// их не «съест» автомат игрока. Несколько нажатий одного действия
// между двумя кадрами логики считаются одним.
export class ActionBuffer {
  private raw = new Set<Action>();
  private ages = new Map<Action, number>(); // действие → возраст в кадрах логики

  press(a: Action): void {
    this.raw.add(a);
  }

  // Ровно раз за кадр логики (не вызывается во время хитстопа — буфер не стареет).
  advance(): void {
    for (const [a, age] of this.ages) {
      if (age + 1 > CONFIG.input.bufferFrames) this.ages.delete(a);
      else this.ages.set(a, age + 1);
    }
    for (const a of this.raw) this.ages.set(a, 0);
    this.raw.clear();
  }

  consume(a: Action): boolean {
    return this.ages.delete(a);
  }

  clear(): void {
    this.raw.clear();
    this.ages.clear();
  }

  describe(): string {
    const parts = [...this.ages].map(([a, age]) => `${a} ${age}/${CONFIG.input.bufferFrames}`);
    if (this.raw.size) parts.push(`ждут тика: ${[...this.raw].join(',')}`);
    return parts.length ? parts.join('  ') : '—';
  }
}

// Снимок ввода на один кадр логики. Всё уже в мировых координатах.
export interface InputFrame {
  moveX: number; // единичный вектор движения (или 0,0)
  moveY: number;
  aimAngle: number; // угол от игрока к курсору, радианы, в мире
  aimSector: number; // 0..N-1
  actions: ActionBuffer; // нажатия; автомат забирает их через consume()
}

export function angleToSector(angle: number): number {
  const n = CONFIG.aim.sectors;
  const size = (Math.PI * 2) / n;
  const a = Phaser.Math.Angle.Normalize(angle + size / 2); // 0..2π, сектор 0 центрирован на угле 0
  return Math.floor(a / size) % n;
}

export class Input {
  readonly actions = new ActionBuffer();
  private keys: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.W),
      down: kb.addKey(K.S),
      left: kb.addKey(K.A),
      right: kb.addKey(K.D),
    };

    // Атака — E. Автоповтор при удержании не срабатывает (Key.emitOnRepeat = false).
    kb.addKey(K.E).on(Phaser.Input.Keyboard.Events.DOWN, () => this.actions.press('attack'));

    // ПКМ ничего не делает, но контекстное меню браузера поверх игры
    // съедает отпускание клавиш (залипает WASD) — поэтому оставляем подавление.
    scene.input.mouse?.disableContextMenu();
  }

  // Ровно раз за кадр логики (кроме кадров хитстопа).
  sample(playerX: number, playerY: number): InputFrame {
    this.actions.advance();

    // WASD — относительно экрана: W ведёт вверх по экрану.
    const dx = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);
    const dy = (this.keys.down.isDown ? 1 : 0) - (this.keys.up.isDown ? 1 : 0);
    const move = screenDirToWorld(dx, dy);

    // Курсор: пиксели окна → точка сцены (с учётом камеры) → мир.
    const p = this.scene.input.activePointer;
    const scenePt = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const cursor = screenToWorld(scenePt.x, scenePt.y);
    const aimAngle = Math.atan2(cursor.y - playerY, cursor.x - playerX);

    return { moveX: move.x, moveY: move.y, aimAngle, aimSector: angleToSector(aimAngle), actions: this.actions };
  }
}
