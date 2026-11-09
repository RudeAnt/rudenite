import Phaser from 'phaser';
import { Boss, checkPostureBalance } from './boss';
import { resolveBodyCollision, resolvePlayerAttack } from './combat';
import { CONFIG, STEP_MS } from './config';
import { Debug } from './debug';
import { Input } from './input';
import { Player } from './player';
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
  private acc = 0; // накопленное время для фиксированного шага, мс
  private tickCount = 0;
  private hitstop = 0; // оставшиеся кадры заморозки после попадания
  private camX = 0;
  private camY = 0;

  constructor() {
    super('arena');
  }

  create(): void {
    checkPostureBalance();
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
    this.boss = new Boss(CONFIG.boss.spawnX, CONFIG.boss.spawnY);
    this.inputMap.actions.clear();
    this.hitstop = 0;
  }

  update(_time: number, delta: number): void {
    this.debug.pollKeys();
    if (Phaser.Input.Keyboard.JustDown(this.kRestart)) this.resetArena();

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

    // Хитстоп: обычный кадр логики (slow-mo и F4 работают как всегда), но мир заморожен.
    // Ввод не читается — нажатия копятся в буфере и не стареют.
    if (this.hitstop > 0) {
      this.hitstop--;
      this.player.holdPosition();
      return;
    }

    this.player.tick(this.inputMap.sample(this.player.x, this.player.y));
    this.boss.tick();
    resolveBodyCollision(this.player, this.boss);
    if (resolvePlayerAttack(this.player, this.boss)) this.hitstop = CONFIG.combat.hitstopFrames;
  }

  // alpha — доля пути между прошлым и текущим кадром логики (сглаживание на мониторах >60 Гц).
  private render(alpha: number): void {
    const p = this.player;
    const b = this.boss;
    const v = CONFIG.view;
    const ix = p.prevX + (p.x - p.prevX) * alpha; // сглаженная позиция игрока в мире
    const iy = p.prevY + (p.y - p.prevY) * alpha;
    const pos = worldToScreen(ix, iy);
    const bossPos = worldToScreen(b.x, b.y);

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

    // Debug рисует на полу — до тел, чтобы они не перекрывались.
    this.debug.draw(g, p, b, { tick: this.tickCount, hitstop: this.hitstop, buffer: this.inputMap.actions.describe() });

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
      g.fillStyle(v.playerBody, 1);
      g.fillRoundedRect(pos.x - v.playerBodyWidth / 2, pos.y - v.playerBodyHeight, v.playerBodyWidth, v.playerBodyHeight, v.playerBodyWidth / 2);
    };
    const drawBoss = () => {
      const h = b.alive ? v.bossBodyHeight : v.bossDeadHeight;
      const color = !b.alive
        ? v.bossDead
        : b.state === 'hurt'
          ? lerpColor(v.bossHurt, v.bossBody, b.stateFrame / CONFIG.boss.hurtFrames)
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

    this.hudText.setVisible(!b.alive);
    this.hudText.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.hudText.setText('Босс повержен\nR — рестарт');
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
