// ВСЕ числа игры живут здесь. Тайминги — в КАДРАХ (1 кадр = 1/60 с),
// расстояния — в мировых единицах (плоская логика, до изометрии).

// ---- Атаки босса: данные ----
// Тип определяет правила защиты (M3/M4) и цвет телеграфа:
//   directional — направленный удар, парируется только в верный сектор;
//   thrust — укол, уклоняться; slam — круговой удар по земле, уклоняться;
//   grab — захват, нельзя парировать, только уклон.
export type BossAttackType = 'directional' | 'thrust' | 'slam' | 'grab';

// Сторона направленного удара — с какой стороны он прилетает игроку,
// если игрок смотрит на босса: left — слева, right — справа, center — в лоб.
// Верный сектор = направление на босса, повёрнутое на boss.sideOffset градусов.
export type AttackSide = 'left' | 'center' | 'right';

// Зона поражения на полу. Отсчёт от центра босса, ориентация — по взгляду босса.
export type AttackShape =
  | { kind: 'arc'; range: number; arc: number } // сектор круга: радиус от центра босса, ширина в градусах
  | { kind: 'line'; length: number; width: number } // полоса вперёд от центра босса
  | { kind: 'circle'; radius: number }; // круг вокруг босса

interface StepBase {
  shape: AttackShape;
  telegraph: number; // кадров телеграфа (зона видна, удара ещё нет)
  track: number; // первые N кадров телеграфа босс доворачивается к игроку, дальше направление зафиксировано
  active: number; // кадров, когда удар может попасть
  recovery: number; // кадров восстановления после удара (у не последнего шага комбо — пауза до следующего)
  damage: number; // урон по HP игрока
}

export type BossAttackStep = StepBase &
  ({ type: 'directional'; side: AttackSide } | { type: 'thrust' | 'slam' | 'grab' });

export interface BossAttack {
  name: string;
  weight: number; // вес при случайном выборе
  engage: number; // босс подходит до этой дистанции (центр–центр), потом начинает атаку
  steps: readonly BossAttackStep[]; // несколько шагов = комбо
}

const SLASH = { kind: 'arc', range: 140, arc: 120 } as const;
const THRUST = { kind: 'line', length: 210, width: 40 } as const;

// Порядок важен: debug-клавиши 1–6 выбирают атаку по номеру в этом списке.
const BOSS_ATTACKS: readonly BossAttack[] = [
  {
    name: 'Рубящий',
    weight: 3,
    engage: 110,
    steps: [{ type: 'directional', side: 'left', shape: SLASH, telegraph: 40, track: 28, active: 5, recovery: 30, damage: 20 }],
  },
  {
    name: 'Двойной рубящий',
    weight: 2,
    engage: 110,
    steps: [
      { type: 'directional', side: 'left', shape: SLASH, telegraph: 36, track: 24, active: 5, recovery: 8, damage: 15 },
      { type: 'directional', side: 'right', shape: SLASH, telegraph: 30, track: 18, active: 5, recovery: 34, damage: 15 },
    ],
  },
  {
    name: 'Укол',
    weight: 2,
    engage: 160,
    steps: [{ type: 'thrust', shape: THRUST, telegraph: 45, track: 30, active: 6, recovery: 36, damage: 25 }],
  },
  {
    name: 'Удар по земле',
    weight: 2,
    engage: 100,
    steps: [{ type: 'slam', shape: { kind: 'circle', radius: 130 }, telegraph: 45, track: 0, active: 6, recovery: 40, damage: 25 }],
  },
  {
    name: 'Захват',
    weight: 1,
    engage: 70,
    steps: [{ type: 'grab', shape: { kind: 'arc', range: 95, arc: 60 }, telegraph: 40, track: 30, active: 6, recovery: 40, damage: 30 }],
  },
  {
    name: 'Рубящий → укол',
    weight: 2,
    engage: 110,
    steps: [
      { type: 'directional', side: 'right', shape: SLASH, telegraph: 36, track: 24, active: 5, recovery: 8, damage: 15 },
      { type: 'thrust', shape: THRUST, telegraph: 32, track: 16, active: 6, recovery: 36, damage: 20 },
    ],
  },
];

export const CONFIG = {
  sim: {
    hz: 60, // частота фиксированного шага логики
    maxStepsPerFrame: 5, // защита от «спирали смерти» при лагах
    slowMoScale: 0.25, // множитель времени в slow-motion
  },

  iso: {
    k: 0.6, // масштаб проекции: screenX = (x - y) * k, screenY = (x + y) * k / 2
  },

  arena: {
    size: 900, // сторона квадратной арены, мир. ед.
    gridStep: 100, // шаг сетки пола, мир. ед.
  },

  player: {
    radius: 18, // радиус коллизии (круг на полу), мир. ед.
    speed: 4.5, // максимальная скорость бега, мир. ед. за кадр
    // Инерция: скорость тянется к желаемой не быстрее accel (разгон) / decel (торможение), мир. ед./кадр².
    // Полный разгон ≈ speed/accel кадров, остановка ≈ speed/decel кадров.
    accel: 0.9,
    decel: 0.7,
    spawnX: 630, // старт: на экране прямо под боссом
    spawnY: 630,
    hp: 100,
    staggerFrames: 18, // оцепенение после попадания босса (прерывает удар, бег не управляется — только торможение)
    hurtFlashFrames: 12, // вспышка при попадании
    attack: {
      startup: 6, // кадров замаха до удара
      active: 4, // кадров, когда удар может попасть
      recovery: 14, // кадров восстановления (нажатие уже буферизуется)
      // Множитель максимальной скорости бега по фазам удара (1 — как без удара).
      moveScale: { startup: 0.5, active: 0.1, recovery: 0.6 },
      // Рывок вперёд по направлению удара: начинается за lead кадров до конца startup,
      // длится frames кадров, скорость линейно затухает до нуля. Отдельно от инерции бега.
      lunge: { distance: 24, frames: 6, lead: 3 },
      range: 70, // дальность дуги удара от центра игрока, мир. ед.
      arc: 100, // ширина дуги удара, градусы
      damage: 10, // урон по HP босса
      postureDamage: 10, // урон по posture босса
    },
  },

  boss: {
    spawnX: 450, // центр арены
    spawnY: 450,
    radius: 40, // хёртбокс и коллизия, мир. ед.
    hp: 200,
    postureMax: 100,
    // Регенерация posture: через postureRegenDelay кадров без урона — postureRegenRate за кадр.
    // Спам обычных ударов НЕ должен заполнять шкалу: за цикл атаки игрока
    // (startup+active+recovery = 24 кадра) регенерация (24-8)*0.65 = 10.4 > postureDamage 10.
    // Если нарушить это условие — в консоли будет предупреждение.
    postureRegenDelay: 8,
    postureRegenRate: 0.65,
    hurtFrames: 10, // длительность вспышки при попадании (атаку босса не прерывает)
    chaseSpeed: 2.2, // скорость ходьбы, мир. ед. за кадр (должна быть ниже player.speed)
    turnSpeed: 2.5, // скорость доворота, градусов за кадр
    idleFrames: 40, // пауза между атаками
    maxRepeat: 2, // одна и та же атака — не больше стольких раз подряд
    sideOffset: 90, // сдвиг верного сектора для left/right относительно направления на босса, градусы
    attacks: BOSS_ATTACKS,
  },

  combat: {
    // Хитстоп = кривая замедления времени (см. src/hitslow.ts). Масштаб глобальный.
    // frames — длительность в реальных кадрах, minScale — масштаб в самой глубокой точке,
    // power — сглаживание (1 резко, 2 плавно, больше — плавнее края, уже провал).
    // Потерянное время при power 2 ≈ (1 − minScale) · frames / 2 игровых кадров (точное — в F1).
    hitSlowPlayerHitsBoss: { frames: 5, minScale: 0.4, power: 2 }, // ≈1.5 кадра (старый хитстоп — 3)
    hitSlowBossHitsPlayer: { frames: 8, minScale: 0.35, power: 2 }, // ≈2.6 кадра (старый — 6)
  },

  input: {
    bufferFrames: 8, // сколько кадров живёт нажатие, если действие пока недоступно
  },

  aim: {
    sectors: 4, // на сколько секторов делится направление курсора
  },

  camera: {
    lerp: 0.12, // 0..1: доля пути до игрока за один кадр отрисовки (1 = жёстко)
  },

  // Только внешний вид, на логику не влияет.
  view: {
    background: 0x14161b,
    floorFill: 0x242a33,
    floorLine: 0x343c48,
    floorBorder: 0x6b7a90,
    playerBody: 0x4fc3f7,
    playerShadow: 0x000000,
    playerShadowAlpha: 0.35,
    playerHurt: 0xff5252,
    playerDead: 0x5c6370,
    playerDeadHeight: 10, // px
    playerBodyWidth: 22, // px
    playerBodyHeight: 44, // px
    bossBody: 0xe57373,
    bossHurt: 0xffffff,
    bossDead: 0x5c6370,
    bossBodyWidth: 46, // px
    bossBodyHeight: 80, // px
    bossDeadHeight: 18, // px
    swingColor: 0xffffff, // след удара в active-кадрах
    swingAlpha: 0.35,
    swingSteps: 10, // сегментов в дуге удара
    hudBarWidth: 360, // px
    hudBarHeight: 10, // px
    hudBarGap: 6, // px между шкалами
    hudTop: 40, // px от верха экрана
    hudBarBg: 0x000000,
    hudBarBgAlpha: 0.5,
    hudHp: 0xe53935,
    hudPosture: 0xffb300,
    hudPlayerHp: 0x66bb6a,
    hudBottom: 40, // px от низа экрана до шкалы HP игрока
    hudTextColor: '#ffffff',
    hudFontSize: 20, // px
    // Телеграфы атак босса: цвет по типу.
    telegraphColors: { directional: 0xffeb3b, thrust: 0xb388ff, slam: 0xff7043, grab: 0xff1744 },
    telegraphAlphaStart: 0.06, // заливка зоны в начале телеграфа…
    telegraphAlphaEnd: 0.3, // …и к его концу
    telegraphLineTracking: 0.45, // прозрачность контура, пока босс ещё доворачивается
    telegraphLineLocked: 1, // контур после фиксации направления
    telegraphActiveAlpha: 0.75, // заливка в кадрах удара
    telegraphSteps: 16, // сегментов в дугах телеграфа
    // Подсказка для направленного удара: клин верного сектора у игрока + стрелка «удар прилетит отсюда».
    showGuardSector: true, // false — скрыть клин верного сектора у игрока (стрелка остаётся)
    guardSectorRadius: 80, // мир. ед.
    guardSectorAlpha: 0.22,
    guardArrowFar: 120, // начало стрелки от центра игрока, мир. ед.
    guardArrowNear: 30, // острие стрелки от центра игрока, мир. ед.
    guardArrowWidth: 4, // px
    guardArrowHead: 14, // px
    aimMarker: 0xffffff,
    aimMarkerDist: 34, // мир. ед. от центра игрока
    aimMarkerSize: 4, // px
    debugHitbox: 0x00ff66,
    debugHurtbox: 0x40c4ff,
    debugAttackInactive: 0x888888, // дуга удара в startup/recovery
    debugAttackActive: 0xff1744, // дуга удара в active
    debugSector: 0xffd54f,
    debugSectorAlpha: 0.18,
    debugSectorRadius: 90, // мир. ед.
    debugSectorSteps: 12, // сегментов в дуге сектора
    debugCircleSteps: 24, // сегментов в круге хитбокса
    debugBossZone: 0xff9100, // контур зоны текущего шага атаки босса
    debugFacingLen: 70, // мир. ед., линия взгляда босса
    debugTextColor: '#d7ffd9',
    debugFontSize: 14, // px
    debugMargin: 10, // px
    hintTextColor: '#7d8798',
    immortalTextColor: '#ffd54f',
  },
} as const;

export const STEP_MS = 1000 / CONFIG.sim.hz;
