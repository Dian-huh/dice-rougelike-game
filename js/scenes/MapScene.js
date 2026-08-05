import { NODE_TYPES } from '../data/mapData.js';
import { gameState } from '../data/gameState.js';

export class MapScene extends Phaser.Scene {
    constructor() { 
        super({ key: 'MapScene' }); 
    }

    create() {
        // 1. 如果全域存檔尚未初始化，自動啟動新遊戲
        if (!gameState.mapData) {
            gameState.initNewGame();
        }

        this.add.text(400, 30, '🗺️ 冒險地圖 (請選擇路線)', { fontSize: '20px', fill: '#00ffff' }).setOrigin(0.5);
        this.renderMapUI();
    }

    renderMapUI() {
        const startY = 500;
        const floorGapY = 90;

        gameState.mapData.forEach((floorNodes, floorIdx) => {
            const floorNumber = floorIdx + 1;
            const y = startY - (floorIdx * floorGapY);
            const isCurrentFloor = (floorNumber === gameState.currentFloor);

            const totalNodes = floorNodes.length;
            floorNodes.forEach((node, nodeIdx) => {
                const x = 400 + (nodeIdx - (totalNodes - 1) / 2) * 160;
                const typeConfig = NODE_TYPES[node.type] || NODE_TYPES.BATTLE;
                const isClickable = isCurrentFloor && !node.visited;

                const btnBg = this.add.rectangle(x, y, 130, 50, isClickable ? 0x333355 : 0x111122)
                    .setStrokeStyle(2, isClickable ? 0x00ffff : 0x555555);

                this.add.text(x, y, typeConfig.name, {
                    fontSize: '13px',
                    fill: isClickable ? '#ffffff' : '#888888'
                }).setOrigin(0.5);

                if (isClickable) {
                    btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                        node.visited = true;
                        this.enterNode(node);
                    });
                }
            });
        });
    }

    enterNode(node) {
        if (node.type === 'REST') {
            gameState.hero.hp = Math.min(gameState.hero.maxHp, gameState.hero.hp + 15);
            alert(`🔥 在營火旁休息，恢復了 15 點生命值！`);
            gameState.nextFloor();
            this.scene.restart();
        } 
        else if (node.type === 'EVENT') {
            alert(`❓ 遇到神秘商人，獲得 20 金幣！`);
            gameState.hero.gold = (gameState.hero.gold || 0) + 20;
            gameState.nextFloor();
            this.scene.restart();
        } 
        else {
            // 切換至戰鬥場景，完全由 gameState 自動對接，零傳參負擔
            this.scene.start('BattleScene');
        }
    }
}