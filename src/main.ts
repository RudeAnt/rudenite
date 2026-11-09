import Phaser from 'phaser';
import { CONFIG } from './config';
import { ArenaScene } from './scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: CONFIG.view.background,
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [ArenaScene],
});
