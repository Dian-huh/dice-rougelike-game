// 地圖節點類型定義
export const NODE_TYPES = {
    BATTLE: {
        id: 'BATTLE', name: '⚔️ 一般戰鬥', color: '#ff6666',
        onEnter: (scene, node) => scene.scene.start('BattleScene', { node })
    },
    EVENT: {
        id: 'EVENT', name: '❓ 隨機事件', color: '#ffff66',
        onEnter: (scene, node) => scene.showEventUI(node)
    },
    REST: {
        id: 'REST', name: '🔥 營火休息', color: '#66ff66',
        onEnter: (scene, node, gameState) => {
            gameState.hero.hp = Math.min(gameState.hero.maxHp, gameState.hero.hp + 15);
            alert(`🔥 在營火旁休息，恢復了 15 點生命值！`);
            scene.afterNodeCompleted(node);
        }
    },
    BOSS: {
        id: 'BOSS', name: '👹 頭目戰', color: '#ff0000',
        onEnter: (scene, node) => scene.scene.start('BattleScene', { node })
    },
    // 🟢 Step1(regionRegistry.js) 新增的佔位型別：最終層節點固定用這個 type。
    // 目前 onEnter 先當一般戰鬥處理；「該出現 eliteEnemy 還是 regionBoss」的判斷邏輯
    // 待 Step3(isFinalSelection) 決定選中的區域、Step6(stageData銜接) 決定敵人池時才會真正生效，
    // 這裡先確保「有這個節點類型可以正常進入戰鬥」不出錯即可
    BATTLE_FINAL: {
        id: 'BATTLE_FINAL', name: '👑 區域最終戰', color: '#ff00ff',
        onEnter: (scene, node) => scene.scene.start('BattleScene', { node })
    }
};

/**
 * 隨機生成包含多個樓層地圖結構的函式
 * @param {number} totalFloors 總樓層數 (例如 5)
 */
export function generateProceduralMap(totalFloors = 5) {
    const mapNodes = [];

    for (let floor = 1; floor <= totalFloors; floor++) {
        const floorNodes = [];

        // 最後一層固定為 BOSS 房
        if (floor === totalFloors) {
            floorNodes.push({
                id: `node_${floor}_1`,
                floor: floor,
                type: NODE_TYPES.BOSS.id,
                difficulty: floor,
                visited: false
            });
        } 
        // 第一層固定為一般戰鬥，讓玩家暖身
        else if (floor === 1) {
            floorNodes.push({
                id: `node_${floor}_1`,
                floor: floor,
                type: NODE_TYPES.BATTLE.id,
                difficulty: 1,
                visited: false
            });
        } 
        // 中間樓層：隨機生成 2~3 個分叉節點
        else {
            const nodeCount = Phaser.Math.Between(2, 3);
            const pool = [NODE_TYPES.BATTLE.id, NODE_TYPES.BATTLE.id, NODE_TYPES.EVENT.id, NODE_TYPES.REST.id];

            for (let i = 0; i < nodeCount; i++) {
                const randomType = Phaser.Utils.Array.GetRandom(pool);
                floorNodes.push({
                    id: `node_${floor}_${i + 1}`,
                    floor: floor,
                    type: randomType,
                    difficulty: floor,
                    visited: false
                });
            }
        }

        mapNodes.push(floorNodes);
    }

    return mapNodes;
}