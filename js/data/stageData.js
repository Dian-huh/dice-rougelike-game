import { createEnemyInstance } from './enemyData.js';

/**
 * 依「難度（樓層數）」決定一般戰鬥節點要召喚哪些小怪
 * 目前敵人池只有哥布林，之後新增怪物（如哥布林薩滿）時，
 * 只需要在這裡依難度擴充陣容組合即可，不需要動到 BattleScene。
 * @param {number} difficulty 樓層數，數字越大代表越後期
 */
function getBattleEnemyIds(difficulty = 1, limitedToOne = false) {
    if (limitedToOne) {
        return difficulty >= 4 ? ['goblin_shaman'] : ['goblin']; // 🟢 各個擊破生效中，只出現1隻
    }
    if (difficulty >= 4) {
        return ['goblin', 'goblin_shaman'];
    }
    if (difficulty >= 2) {
        return ['goblin', 'goblin'];
    }
    return ['goblin'];
}

/**
 * 關卡工廠：依「樓層 stageId」與「節點類型 nodeType」動態組裝關卡資料
 * @param {string} stageId  例如 '1-3'，代表第 3 層（格式：世界-樓層）
 * @param {string} nodeType 'BATTLE' | 'BOSS'（EVENT / REST 節點不會進入戰鬥場景，不在此處理）
 */
export function getStageData(stageId = '1-1', nodeType = 'BATTLE', options = {}) {
    const floorNumber = parseInt(String(stageId).split('-')[1], 10) || 1;
    const limitedToOne = !!options.limitedToOne;

    let enemyIds = [];
    let stageName = '';

    if (nodeType === 'BOSS') {
        enemyIds = ['black_dragon'];
        stageName = `👹 第 ${floorNumber} 層 - 頭目戰：滅世黑龍`;
    } else {
        enemyIds = getBattleEnemyIds(floorNumber, limitedToOne);
        stageName = `⚔️ 第 ${floorNumber} 層 - 一般戰鬥${limitedToOne ? '（各個擊破生效中）' : ''}`;
    }

    const enemies = enemyIds
        .map(id => createEnemyInstance(id))
        .filter(e => e !== null && e !== undefined);

    // 防呆：如果 enemyData.js 缺少對應資料，明確印出警告方便除錯
    if (enemies.length === 0) {
        console.error(`⚠️ 關卡 [${stageId}] (${nodeType}) 找不到對應敵人資料，enemyIds=`, enemyIds);
    }

    return {
        name: stageName,
        enemies: enemies,
        rewardConfig: {
            baseGold: nodeType === 'BOSS' ? 100 : 15 + floorNumber * 5
        }
    };
}