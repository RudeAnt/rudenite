import Phaser from 'phaser';
import type { Boss } from './boss';
import { CONFIG } from './config';
import type { Player } from './player';

// Игрок не проходит сквозь босса: выталкиваем по линии центров.
// Босс в центре арены, поэтому выталкивание за стены невозможно.
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
}

// Задевает ли дуга удара (сектор круга) хёртбокс босса (круг).
export function attackReaches(player: Player, boss: Boss): boolean {
  const a = CONFIG.player.attack;
  const dx = boss.x - player.x;
  const dy = boss.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > a.range + CONFIG.boss.radius) return false;
  if (dist <= CONFIG.boss.radius) return true;
  const halfArc = Phaser.Math.DegToRad(a.arc) / 2;
  const bossHalfWidth = Math.asin(CONFIG.boss.radius / dist); // угловой радиус босса, видимый от игрока
  const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - player.attackAngle));
  return diff <= halfArc + bossHalfWidth;
}

// Возвращает true, если в этом кадре было попадание.
export function resolvePlayerAttack(player: Player, boss: Boss): boolean {
  if (player.attackPhase !== 'active' || player.attackHasHit || !boss.alive) return false;
  if (!attackReaches(player, boss)) return false;
  player.attackHasHit = true;
  boss.takeHit(CONFIG.player.attack.damage, CONFIG.player.attack.postureDamage);
  return true;
}
