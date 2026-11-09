import Phaser from 'phaser';
import { CONFIG, STEP_MS } from './config';
import { Debug } from './debug';
import { Input } from './input';
import { Player } from './player';
import { worldToScreen } from './world/iso';

export class ArenaScene extends Phaser.Scene {
  private player!: Player;
  private inputMap!: Input;
  private debug!: Debug;
  private g!: Phaser.GameObjects.Graphics; // всё динамическое, перерисовывается каждый кадр
  private acc = 0; // накопленное время для фиксированного шага, мс
  private tickCount = 0;
  private camX = 0;
  private camY = 0;

  constructor() {
    super('arena');
  }

  create(): void {
    const half = CONFIG.arena.size / 2;
    this.player = new Player(half, half);
    this.inputMap = new Input(this);
    this.debug = new Debug(this);
    this.drawFloor();
    this.g = this.add.graphics().setDepth(10);

    const start = worldToScreen(this.player.x, this.player.y);
    this.camX = start.x;
    this.camY = start.y;
  }

  update(_time: number, delta: number): void {
    this.debug.pollKeys();

    // Фиксированный шаг: логика тикает ровно 60 раз в секунду игрового времени.
    if (this.debug.paused) {
      this.acc = 0;
      if (this.debug.stepRequested) this.tick();
      this.debug.stepRequested = false;
    } else {
      this.acc += delta * this.debug.timeScale;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < CONFIG.sim.maxStepsPerFrame) {
        this.tick();
        this.acc -= STEP_MS;
        steps++;
      }
      if (steps === CONFIG.sim.maxStepsPerFrame) this.acc = 0;
    }

    this.render(this.debug.paused ? 1 : this.acc / STEP_MS);
  }

  private tick(): void {
    this.tickCount++;
    this.player.tick(this.inputMap.sample(this.player.x, this.player.y));
  }

  // alpha — доля пути между прошлым и текущим кадром логики (сглаживание на мониторах >60 Гц).
  private render(alpha: number): void {
    const p = this.player;
    const v = CONFIG.view;
    const pos = worldToScreen(p.prevX + (p.x - p.prevX) * alpha, p.prevY + (p.y - p.prevY) * alpha);

    this.camX += (pos.x - this.camX) * CONFIG.camera.lerp;
    this.camY += (pos.y - this.camY) * CONFIG.camera.lerp;
    this.cameras.main.centerOn(this.camX, this.camY);

    const g = this.g;
    g.clear();

    // Тень = след игрока на полу.
    const r = CONFIG.player.radius * CONFIG.iso.k;
    g.fillStyle(v.playerShadow, v.playerShadowAlpha);
    g.fillEllipse(pos.x, pos.y, r * 2 * Math.SQRT2, r * Math.SQRT2);

    // Debug рисует на полу — до тела, чтобы оно не перекрывалось.
    this.debug.draw(g, p, this.tickCount);

    // Маркер направления прицела на полу.
    const aim = worldToScreen(
      p.x + Math.cos(p.aimAngle) * v.aimMarkerDist,
      p.y + Math.sin(p.aimAngle) * v.aimMarkerDist,
    );
    const real = worldToScreen(p.x, p.y);
    g.fillStyle(v.aimMarker, 1);
    g.fillCircle(pos.x + aim.x - real.x, pos.y + aim.y - real.y, v.aimMarkerSize);

    // Тело: «столбик», стоящий на точке pos.
    g.fillStyle(v.playerBody, 1);
    g.fillRoundedRect(pos.x - v.playerBodyWidth / 2, pos.y - v.playerBodyHeight, v.playerBodyWidth, v.playerBodyHeight, v.playerBodyWidth / 2);

  }

  private drawFloor(): void {
    const v = CONFIG.view;
    const size = CONFIG.arena.size;
    const g = this.add.graphics().setDepth(0);
    const corners = [worldToScreen(0, 0), worldToScreen(size, 0), worldToScreen(size, size), worldToScreen(0, size)];

    g.fillStyle(v.floorFill, 1);
    g.fillPoints(corners, true);

    g.lineStyle(1, v.floorLine, 1);
    for (let t = CONFIG.arena.gridStep; t < size; t += CONFIG.arena.gridStep) {
      const a = worldToScreen(t, 0);
      const b = worldToScreen(t, size);
      const c = worldToScreen(0, t);
      const d = worldToScreen(size, t);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineBetween(c.x, c.y, d.x, d.y);
    }

    g.lineStyle(2, v.floorBorder, 1);
    g.strokePoints(corners, true);
  }
}
