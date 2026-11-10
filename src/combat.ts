import Phaser from 'phaser';
import type { Boss } from './boss';
import { CONFIG, type AttackShape, type BossAttackStep } from './config';
import type { Player } from './player';

// Тела не перекрываются: выталкиваем игрока по линии центров.
// Если игрок упёрся в стену — оставшееся перекрытие снимаем, сдвигая босса.
export function resolveBodyCollision(player: Player, boss: Boss): void {
  const minDist = CONFIG.player.radius + CONFIG.boss.radius;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;
  const nx = dist === 0 ? 1 : dx / dist;
  const ny = dist === 0 ? 0 : dy / dist;
  player.x = boss.x + nx * minDist;
  player.y = boss.y + ny * minDist;
  player.clampToArena();

  const rx = player.x - boss.x;
  const ry = player.y - boss.y;
  const rest = minDist - Math.hypot(rx, ry);
  if (rest > 0) {
    boss.x -= nx * rest;
    boss.y -= ny * rest;
    boss.clampToArena();
  }
}

// Задевает ли сектор круга (из точки o, по направлению angle) круг цели.
function sectorHitsCircle(ox: number, oy: number, angle: number, range: number, arcDeg: number, tx: number, ty: number, tr: number): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > range + tr) return false;
  if (dist <= tr) return true;
  const halfArc = Phaser.Math.DegToRad(arcDeg) / 2;
  const targetHalfWidth = Math.asin(tr / dist); // угловой радиус цели, видимый из o
  const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle));
  return diff <= halfArc + targetHalfWidth;
}

// Зона атаки босса (форма из config) против круга цели.
export function zoneHitsCircle(ox: number, oy: number, facing: number, shape: AttackShape, tx: number, ty: number, tr: number): boolean {
  switch (shape.kind) {
    case 'arc':
      return sectorHitsCircle(ox, oy, facing, shape.range, shape.arc, tx, ty, tr);
    case 'circle':
      return Math.hypot(tx - ox, ty - oy) <= shape.radius + tr;
    case 'line': {
      // В локальных координатах полосы: u — вдоль взгляда, v — поперёк.
      const dx = tx - ox;
      const dy = ty - oy;
      const c = Math.cos(facing);
      const s = Math.sin(facing);
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      const cu = Phaser.Math.Clamp(u, 0, shape.length);
      const cv = Phaser.Math.Clamp(v, -shape.width / 2, shape.width / 2);
      return Math.hypot(u - cu, v - cv) <= tr;
    }
  }
}

// Направление, в которое игроку надо поставить защиту от направленного удара:
// на босса, повёрнутое по стороне удара. Для остальных типов — null.
// Считается по текущим позициям (игрок может сместиться во время телеграфа).
// Мир «y вниз», поэтому для игрока, смотрящего на босса, левая сторона — минус угла.
export function requiredGuardAngle(player: Player, boss: Boss, step: BossAttackStep): number | null {
  if (step.type !== 'directional') return null;
  const toBoss = Math.atan2(boss.y - player.y, boss.x - player.x);
  const sign = step.side === 'left' ? -1 : step.side === 'right' ? 1 : 0;
  return toBoss + sign * Phaser.Math.DegToRad(CONFIG.boss.sideOffset);
}

// Возвращает true, если в этом кадре было попадание игрока по боссу.
export function resolvePlayerAttack(player: Player, boss: Boss): boolean {
  if (player.attackPhase !== 'active' || player.attackHasHit || !boss.alive) return false;
  const a = CONFIG.player.attack;
  if (!sectorHitsCircle(player.x, player.y, player.attackAngle, a.range, a.arc, boss.x, boss.y, CONFIG.boss.radius)) return false;
  player.attackHasHit = true;
  boss.takeHit(a.damage, a.postureDamage);
  return true;
}

// Возвращает true, если в этом кадре босс попал по игроку.
export function resolveBossAttack(boss: Boss, player: Player, invulnerable: boolean): boolean {
  const step = boss.step;
  if (boss.state !== 'active' || !step || boss.stepHasHit || !player.alive) return false;
  if (!zoneHitsCircle(boss.x, boss.y, boss.facing, step.shape, player.x, player.y, CONFIG.player.radius)) return false;
  boss.stepHasHit = true;
  player.takeHit(step.damage, invulnerable);
  return true;
}
