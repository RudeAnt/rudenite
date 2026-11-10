import type Phaser from 'phaser';
import type { AttackShape } from './config';
import { floorArc, worldToScreen, type Vec2 } from './world/iso';

// Общие помощники отрисовки (сцена и debug). Вход — мир, выход — экран.

// Контур зоны атаки на полу (замкнутый многоугольник в экранных координатах).
export function zonePolygon(x: number, y: number, facing: number, shape: AttackShape, steps: number): Vec2[] {
  switch (shape.kind) {
    case 'arc': {
      const half = (shape.arc * Math.PI) / 360;
      return [worldToScreen(x, y), ...floorArc(x, y, shape.range, facing - half, facing + half, steps)];
    }
    case 'circle':
      return floorArc(x, y, shape.radius, 0, Math.PI * 2, steps);
    case 'line': {
      const c = Math.cos(facing);
      const s = Math.sin(facing);
      const w = shape.width / 2;
      const L = shape.length;
      const pt = (u: number, v: number) => worldToScreen(x + u * c - v * s, y + u * s + v * c);
      return [pt(0, -w), pt(L, -w), pt(L, w), pt(0, w)];
    }
  }
}

// Стрелка на полу из мировой точки from в мировую точку to (острие у to).
export function floorArrow(g: Phaser.GameObjects.Graphics, from: Vec2, to: Vec2, color: number, width: number, head: number): void {
  const a = worldToScreen(from.x, from.y);
  const b = worldToScreen(to.x, to.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const base = { x: b.x - Math.cos(ang) * head, y: b.y - Math.sin(ang) * head };
  g.lineStyle(width, color, 1);
  g.lineBetween(a.x, a.y, base.x, base.y);
  g.fillStyle(color, 1);
  const side = head * 0.6;
  g.fillTriangle(
    b.x,
    b.y,
    base.x + Math.cos(ang + Math.PI / 2) * side,
    base.y + Math.sin(ang + Math.PI / 2) * side,
    base.x + Math.cos(ang - Math.PI / 2) * side,
    base.y + Math.sin(ang - Math.PI / 2) * side,
  );
}
