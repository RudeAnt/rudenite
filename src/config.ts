// ВСЕ числа игры живут здесь. Тайминги — в КАДРАХ (1 кадр = 1/60 с),
// расстояния — в мировых единицах (плоская логика, до изометрии).

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
    speed: 4.5, // скорость бега, мир. ед. за кадр
    spawnX: 630, // старт: на экране прямо под боссом
    spawnY: 630,
    attack: {
      startup: 6, // кадров замаха до удара
      active: 4, // кадров, когда удар может попасть
      recovery: 14, // кадров восстановления (стоим, но нажатие уже буферизуется)
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
    hurtFrames: 10, // длительность вспышки при попадании
  },

  combat: {
    hitstopFrames: 3, // заморозка логики при попадании, кадров
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
    hudTextColor: '#ffffff',
    hudFontSize: 20, // px
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
    debugTextColor: '#d7ffd9',
    debugFontSize: 14, // px
    debugMargin: 10, // px
    hintTextColor: '#7d8798',
  },
} as const;

export const STEP_MS = 1000 / CONFIG.sim.hz;
