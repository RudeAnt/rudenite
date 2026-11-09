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
    aimMarker: 0xffffff,
    aimMarkerDist: 34, // мир. ед. от центра игрока
    aimMarkerSize: 4, // px
    debugHitbox: 0x00ff66,
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
