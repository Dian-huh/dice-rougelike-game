import { createEnemyInstance } from './enemyData.js';

/**
 * 🧪 測試專用 getStageData：強制第一關/所有關卡都出現【滅世黑龍】
 */
export function getStageData(stageId = 1, nodeType = 'BATTLE') {
    // 🐉 強制將敵人設為黑龍 (black_dragon)
    const enemyIds = ['goblin'];
    const stageName = `🐉 第 ${stageId} 層 - 黑龍機制測試關卡`;

    // 實例化黑龍怪物物件
    const enemies = enemyIds
        .map(id => createEnemyInstance(id))
        .filter(e => e !== null && e !== undefined);

    // 如果 enemyData.js 找不到 black_dragon，印出警告防呆
    if (enemies.length === 0) {
        console.error("⚠️ 找不到 'black_dragon' 的資料！請檢查 enemyData.js 是否有註冊 black_dragon");
    }

    return {
        name: stageName,
        enemies: enemies,
        rewardConfig: {
            baseGold: 100
        }
    };
}