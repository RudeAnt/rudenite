// Хитстоп как кривая масштаба времени (замедлилось → минимум → разогналось обратно).
// Кривая идёт в РЕАЛЬНЫХ кадрах (60 Гц, с учётом F2 slow-mo); на i-м реальном кадре
//   scale = 1 − (1 − minScale) · sin^power(π · (i + 0.5) / frames).
// power: 1 — резкий вход и выход, 2 — плавные края, больше — ещё плавнее края и уже провал.
// «Потерянное время» = Σ(1 − scale), в игровых кадрах: на столько логика отстанет от реального времени.

export interface HitSlowConfig {
  readonly frames: number; // общая длительность, реальных кадров
  readonly minScale: number; // масштаб времени в самой глубокой точке, 0..1
  readonly power: number; // степень сглаживания кривой, >= 1
}

export function hitSlowScale(c: HitSlowConfig, i: number): number {
  const u = (i + 0.5) / c.frames;
  return 1 - (1 - c.minScale) * Math.pow(Math.sin(Math.PI * u), c.power);
}

export function hitSlowLostTime(c: HitSlowConfig): number {
  let lost = 0;
  for (let i = 0; i < c.frames; i++) lost += 1 - hitSlowScale(c, i);
  return lost;
}

export class HitSlow {
  label = ''; // что вызвало (для debug)
  frame = 0; // реальных кадров кривой прошло
  lost = 0; // потеряно игровых кадров с начала текущей кривой
  lastScale = 1; // масштаб, применённый на последнем реальном кадре
  private cfg: HitSlowConfig | null = null;

  get active(): boolean {
    return this.cfg !== null;
  }

  get config(): HitSlowConfig | null {
    return this.cfg;
  }

  // Новое попадание перезапускает кривую.
  start(cfg: HitSlowConfig, label: string): void {
    this.cfg = cfg;
    this.label = label;
    this.frame = 0;
    this.lost = 0;
  }

  // Один реальный кадр: вернуть масштаб для него и сдвинуть кривую.
  advance(): number {
    if (!this.cfg) return (this.lastScale = 1);
    const s = hitSlowScale(this.cfg, this.frame);
    this.lost += 1 - s;
    this.frame++;
    if (this.frame >= this.cfg.frames) this.cfg = null;
    return (this.lastScale = s);
  }

  clear(): void {
    this.cfg = null;
    this.frame = 0;
    this.lost = 0;
    this.lastScale = 1;
  }
}
