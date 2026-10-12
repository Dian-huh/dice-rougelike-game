import { MainMenuScene } from './scenes/MainMenuScene.js';
import { MapScene } from './scenes/MapScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { DebugSystem } from './systems/DebugSystem.js';
import { GAME_W, GAME_H, patchTextPadding } from './config/layout.js';
patchTextPadding();
const config = {
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#111118',
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MainMenuScene, MapScene, BattleScene]
};

const game = new Phaser.Game(config);

DebugSystem.init(game);
window.DEBUG = DebugSystem;