import Phaser from 'phaser';
import { Boss, checkConfig } from './boss';
import { requiredGuardAngle, resolveBodyCollision, resolveBossAttack, resolvePlayerAttack } from './combat';
import { CONFIG, STEP_MS } from './config';
import { Debug } from './debug';
import { floorArrow, zonePolygon } from './draw';
import { HitSlow, hitSlowLostTime } from './hitslow';
import { Player } from './player';
import { angleToSector, Input } from './input';
import { floorArc, worldToScreen } from './world/iso';

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return mix(16) | mix(8) | mix(0);
}

export class ArenaScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private inputMap!: Input;
  private debug!: Debug;
  private g!: Phaser.GameObjects.Graphics; // всё динамическое в мире, перерисовывается каждый кадр
  private hud!: Phaser.GameObjects.Graphics; // шкалы, привязаны к экрану
  private hudText!: Phaser.GameObjects.Text;
  private kRestart!: Phaser.Input.Keyboard.Key;
  private acc = 0; // накопленное реальное время для фиксированного шага, мс
  private logicAcc = 0; // накопитель дробных кадров логики (каждый реальный кадр += масштаб времени)
  private tickCount = 0; // кадров логики
  private realTickCount = 0; // реальных кадров (60 Гц)
  private slow = new HitSlow(); // хитстоп: кривая масштаба времени
  private camX = 0;
  private camY = 0;

  constructor() {
    super('arena');
  }

  create(): void {
    checkConfig();
    this.inputMap = new Input(this);
    this.debug = new Debug(this);
    this.kRestart = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.drawFloor();
    this.g = this.add.graphics().setDepth(10);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.hudText = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: `${CONFIG.view.hudFontSize}px`, color: CONFIG.view.hudTextColor, align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(90);

    this.resetArena();
    const start = worldToScreen(this.player.x, this.player.y);
    this.camX = start.x;
    this.camY = start.y;
  }

  // Рестарт без перезапуска сцены: слушатели ввода не дублируются.
  private resetArena(): void {
    this.player = new Player(CONFIG.player.spawnX, CONFIG.player.spawnY);
    const { spawnX: bx, spawnY: by } = CONFIG.boss;
    this.boss = new Boss(bx, by, Math.atan2(this.player.y - by, this.player.x - bx));
    this.inputMap.actions.clear();
    this.slow.clear();
    this.logicAcc = 0;
  }

  update(_time: number, delta: number): void {
    this.debug.pollKeys();
    if (Phaser.Input.Keyboard.JustDown(this.kRestart)) this.resetArena();
    if (this.debug.forcedAttack !== null) {
      this.boss.forcedNext = this.debug.forcedAttack;
      this.debug.forcedAttack = null;
    }

    // Два уровня времени. Реальные кадры — ровно 60 в секунду (с учётом F2 slow-mo; F4 = один реальный кадр).
    // Кадры логики — целые, через накопитель дробных кадров с масштабом времени хитстопа.
    if (this.debug.paused) {
      this.acc = 0;
      if (this.debug.stepRequested) this.realTick();
      this.debug.stepRequested = false;
    } else {
      this.acc += delta * this.debug.timeScale;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < CONFIG.sim.maxStepsPerFrame) {
        this.realTick();
        this.acc -= STEP_MS;
        steps++;
      }
      if (steps === CONFIG.sim.maxStepsPerFrame) this.acc = 0;
    }

    // Доля пути от прошлого кадра логики к текущему. На паузе — ровно состояние логики.
    const alpha = this.debug.paused ? 1 : Math.min(1, this.logicAcc + (this.acc / STEP_MS) * this.slow.lastScale);
    this.render(alpha);
  }

  // Один реальный кадр. Буфер нажатий стареет здесь — в реальных кадрах, независимо от замедления.
  private realTick(): void {
    this.realTickCount++;
    this.inputMap.actions.advance();
    this.logicAcc += this.slow.advance();
    while (this.logicAcc >= 1) {
      this.logicAcc -= 1;
      this.tick();
    }
    // Кривая закончилась: остаток дробного кадра переносим в реальное время (при масштабе 1 это одно и то же),
    // чтобы дальше интерполяция шла как без хитстопа.
    if (!this.slow.active && this.logicAcc > 0 && !this.debug.paused) {
      this.acc += this.logicAcc * STEP_MS;
      this.logicAcc = 0;
    }
  }

  private tick(): void {
    this.tickCount++;
    this.player.tick(this.inputMap.sample(this.player.x, this.player.y));
    this.boss.tick(this.player);
    resolveBodyCollision(this.player, this.boss);
    // Оба попадания в одном кадре возможны: кривая удара по игроку сильнее, она и побеждает.
    const c = CONFIG.combat;
    const playerHit = resolvePlayerAttack(this.player, this.boss);
    const bossHit = resolveBossAttack(this.boss, this.player, this.debug.immortal);
    if (bossHit) this.slow.start(c.hitSlowBossHitsPlayer, 'босс → игрок');
    else if (playerHit) this.slow.start(c.hitSlowPlayerHitsBoss, 'игрок → босс');
  }

  private timeInfo(): string {
    const c = CONFIG.combat;
    const s = this.slow;
    const cur = s.config ? `  [${s.label} ${s.frame}/${s.config.frames}, потеряно ${s.lost.toFixed(2)}/${hitSlowLostTime(s.config).toFixed(2)}]` : '';
    return (
      `масштаб времени: ${s.lastScale.toFixed(2)}${cur}\n` +
      `потерянное время (кадров логики): по боссу ${hitSlowLostTime(c.hitSlowPlayerHitsBoss).toFixed(2)}, по игроку ${hitSlowLostTime(c.hitSlowBossHitsPlayer).toFixed(2)}`
    );
  }

  // alpha — доля пути между прошлым и текущим кадром логики (сглаживание на мониторах >60 Гц).
  private render(alpha: number): void {
    const p = this.player;
    const b = this.boss;
    const v = CONFIG.view;
    const ix = p.prevX + (p.x - p.prevX) * alpha; // сглаженная позиция игрока в мире
    const iy = p.prevY + (p.y - p.prevY) * alpha;
    const pos = worldToScreen(ix, iy);
    const bx = b.prevX + (b.x - b.prevX) * alpha;
    const by = b.prevY + (b.y - b.prevY) * alpha;
    const bossPos = worldToScreen(bx, by);

    this.camX += (pos.x - this.camX) * CONFIG.camera.lerp;
    this.camY += (pos.y - this.camY) * CONFIG.camera.lerp;
    this.cameras.main.centerOn(this.camX, this.camY);

    const g = this.g;
    g.clear();

    // Тени = следы на полу.
    g.fillStyle(v.playerShadow, v.playerShadowAlpha);
    for (const [s, radius] of [[pos, CONFIG.player.radius], [bossPos, CONFIG.boss.radius]] as const) {
      const r = radius * CONFIG.iso.k;
      g.fillEllipse(s.x, s.y, r * 2 * Math.SQRT2, r * Math.SQRT2);
    }

    this.drawTelegraph(ix, iy, bx, by);

    // Debug рисует на полу — до тел, чтобы они не перекрывались.
    this.debug.draw(g, p, b, { tick: this.tickCount, realTick: this.realTickCount, time: this.timeInfo(), buffer: this.inputMap.actions.describe() });

    // След удара на полу в active-кадрах.
    if (p.attackPhase === 'active') {
      const half = Phaser.Math.DegToRad(CONFIG.player.attack.arc) / 2;
      const arc = floorArc(ix, iy, CONFIG.player.attack.range, p.attackAngle - half, p.attackAngle + half, v.swingSteps);
      g.fillStyle(v.swingColor, v.swingAlpha);
      g.fillPoints([pos, ...arc], true);
    }

    // Маркер направления прицела на полу.
    const aim = worldToScreen(ix + Math.cos(p.aimAngle) * v.aimMarkerDist, iy + Math.sin(p.aimAngle) * v.aimMarkerDist);
    g.fillStyle(v.aimMarker, 1);
    g.fillCircle(aim.x, aim.y, v.aimMarkerSize);

    // Тела: кто ниже на экране — тот ближе к камере и рисуется позже.
    const drawPlayer = () => {
      const h = p.alive ? v.playerBodyHeight : v.playerDeadHeight;
      const color = !p.alive
        ? v.playerDead
        : p.flash > 0
          ? lerpColor(v.playerBody, v.playerHurt, p.flash / CONFIG.player.hurtFlashFrames)
          : v.playerBody;
      g.fillStyle(color, 1);
      g.fillRoundedRect(pos.x - v.playerBodyWidth / 2, pos.y - h, v.playerBodyWidth, h, Math.min(v.playerBodyWidth, h) / 2);
    };
    const drawBoss = () => {
      const h = b.alive ? v.bossBodyHeight : v.bossDeadHeight;
      const color = !b.alive
        ? v.bossDead
        : b.flash > 0
          ? lerpColor(v.bossBody, v.bossHurt, b.flash / CONFIG.boss.hurtFrames)
          : v.bossBody;
      g.fillStyle(color, 1);
      g.fillRoundedRect(bossPos.x - v.bossBodyWidth / 2, bossPos.y - h, v.bossBodyWidth, h, Math.min(v.bossBodyWidth, h) / 2);
    };
    if (pos.y < bossPos.y) {
      drawPlayer();
      drawBoss();
    } else {
      drawBoss();
      drawPlayer();
    }

    this.drawHud();
  }

  // Телеграф текущего шага атаки босса: зона на полу в цвете типа.
  // Телеграф: заливка нарастает, контур полупрозрачный пока босс доворачивается, яркий — после фиксации.
  // Удар (active): плотная заливка. Восстановление: ничего.
  // Направленный удар: у игрока клин верного сектора и стрелка «удар прилетит отсюда».
  private drawTelegraph(px: number, py: number, bx: number, by: number): void {
    const b = this.boss;
    const step = b.step;
    if (!step || b.state === 'recovery') return;
    const v = CONFIG.view;
    const g = this.g;
    const color = v.telegraphColors[step.type];
    const zone = zonePolygon(bx, by, b.facing, step.shape, v.telegraphSteps);

    if (b.state === 'active') {
      g.fillStyle(color, v.telegraphActiveAlpha);
      g.fillPoints(zone, true);
    } else {
      const t = Math.min(1, b.stateFrame / step.telegraph);
      g.fillStyle(color, v.telegraphAlphaStart + (v.telegraphAlphaEnd - v.telegraphAlphaStart) * t);
      g.fillPoints(zone, true);
      g.lineStyle(2, color, b.tracking ? v.telegraphLineTracking : v.telegraphLineLocked);
      g.strokePoints(zone, true);
    }

    const guard = requiredGuardAngle(this.player, b, step);
    if (guard === null || !this.player.alive) return;
    if (v.showGuardSector) {
      const n = CONFIG.aim.sectors;
      const size = (Math.PI * 2) / n;
      const from = angleToSector(guard) * size - size / 2;
      g.fillStyle(color, v.guardSectorAlpha);
      g.fillPoints([worldToScreen(px, py), ...floorArc(px, py, v.guardSectorRadius, from, from + size, v.telegraphSteps)], true);
    }
    const dx = Math.cos(guard);
    const dy = Math.sin(guard);
    floorArrow(
      g,
      { x: px + dx * v.guardArrowFar, y: py + dy * v.guardArrowFar },
      { x: px + dx * v.guardArrowNear, y: py + dy * v.guardArrowNear },
      color,
      v.guardArrowWidth,
      v.guardArrowHead,
    );
  }

  private drawHud(): void {
    const v = CONFIG.view;
    const b = this.boss;
    const h = this.hud;
    h.clear();
    const x = (this.scale.width - v.hudBarWidth) / 2;
    const bars: [number, number][] = [
      [b.hp / CONFIG.boss.hp, v.hudHp],
      [b.posture / CONFIG.boss.postureMax, v.hudPosture],
    ];
    bars.forEach(([fill, color], i) => {
      const y = v.hudTop + i * (v.hudBarHeight + v.hudBarGap);
      h.fillStyle(v.hudBarBg, v.hudBarBgAlpha);
      h.fillRect(x, y, v.hudBarWidth, v.hudBarHeight);
      h.fillStyle(color, 1);
      h.fillRect(x, y, v.hudBarWidth * fill, v.hudBarHeight);
    });

    // HP игрока — внизу экрана.
    const p = this.player;
    const py = this.scale.height - v.hudBottom - v.hudBarHeight;
    h.fillStyle(v.hudBarBg, v.hudBarBgAlpha);
    h.fillRect(x, py, v.hudBarWidth, v.hudBarHeight);
    h.fillStyle(v.hudPlayerHp, 1);
    h.fillRect(x, py, (v.hudBarWidth * p.hp) / CONFIG.player.hp, v.hudBarHeight);

    this.hudText.setVisible(!b.alive || !p.alive);
    this.hudText.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.hudText.setText(!p.alive ? 'Вы погибли\nR — рестарт' : 'Босс повержен\nR — рестарт');
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
