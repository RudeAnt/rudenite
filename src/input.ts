import Phaser from 'phaser';
import { CONFIG } from './config';
import { screenDirToWorld, screenToWorld } from './world/iso';

// Снимок ввода на один кадр логики. Всё уже в мировых координатах.
export interface InputFrame {
  moveX: number; // единичный вектор движения (или 0,0)
  moveY: number;
  aimAngle: number; // угол от игрока к курсору, радианы, в мире
  aimSector: number; // 0..N-1
}

export function angleToSector(angle: number): number {
  const n = CONFIG.aim.sectors;
  const size = (Math.PI * 2) / n;
  const a = Phaser.Math.Angle.Normalize(angle + size / 2); // 0..2π, сектор 0 центрирован на угле 0
  return Math.floor(a / size) % n;
}

export class Input {
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
  }

  sample(playerX: number, playerY: number): InputFrame {
    // WASD — относительно экрана: W ведёт вверх по экрану.
    const dx = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);
    const dy = (this.keys.down.isDown ? 1 : 0) - (this.keys.up.isDown ? 1 : 0);
    const move = screenDirToWorld(dx, dy);

    // Курсор: пиксели окна → точка сцены (с учётом камеры) → мир.
    const p = this.scene.input.activePointer;
    const scenePt = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const cursor = screenToWorld(scenePt.x, scenePt.y);
    const aimAngle = Math.atan2(cursor.y - playerY, cursor.x - playerX);

    return { moveX: move.x, moveY: move.y, aimAngle, aimSector: angleToSector(aimAngle) };
  }
}
