import { MapScene } from './scenes/MapScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { DebugSystem } from './systems/DebugSystem.js';

const config = {
    type: Phaser.AUTO,
    width: 850,
    height: 550,
    backgroundColor: '#111118',
    parent: 'game-container',
    scene: [MapScene, BattleScene]
};

const game = new Phaser.Game(config);

DebugSystem.init(game);
window.DEBUG = DebugSystem;