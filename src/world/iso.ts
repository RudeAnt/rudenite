import { CONFIG } from '../config';

// Единственное место, где мир превращается в экран и обратно.
// Логика игры про изометрию не знает.

export interface Vec2 {
  x: number;
  y: number;
}

export function worldToScreen(x: number, y: number): Vec2 {
  const k = CONFIG.iso.k;
  return { x: (x - y) * k, y: ((x + y) * k) / 2 };
}

export function screenToWorld(sx: number, sy: number): Vec2 {
  const k = CONFIG.iso.k;
  const a = sx / k;
  const b = (2 * sy) / k;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// Направление на экране (например «вверх») → единичный вектор в мире,
// который на экране выглядит именно как это направление.
export function screenDirToWorld(dx: number, dy: number): Vec2 {
  const x = dx + 2 * dy;
  const y = 2 * dy - dx;
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}
