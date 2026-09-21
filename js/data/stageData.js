import { createEnemyInstance } from './enemyData.js';
import { getRegionData } from './regionRegistry.js';

/**
 * 🟢 舊系統(mapData.js/generateProceduralMap)用的回退敵人池，
 * 只在沒有 regionId 可查（例如尚未遷移的舊存檔殘留節點、或debug情境）時才會走到這裡
 */
function getBattleEnemyIds(difficulty = 1, limitedToOne = false) {
    if (limitedToOne) {
        return difficulty >= 4 ? ['goblin_shaman'] : ['goblin'];
    }
    if (difficulty >= 4) {
        return ['goblin', 'goblin_shaman'];
    }
    if (difficulty >= 2) {
        return ['goblin', 'goblin'];
    }
    return ['goblin'];
}

// 🟢 依區域的 enemyPool.theme 隨機抽出陣容，抽取數量比照舊系統的難度縮放邏輯
function getRegionBattleEnemyIds(regionDef, difficulty = 1, limitedToOne = false) {
    const pool = regionDef.enemyPool.theme;
    const count = limitedToOne ? 1 : (difficulty >= 4 ? 2 : (difficulty >= 2 ? 2 : 1));
    return Array.from({ length: count }, () => Phaser.Utils.Array.GetRandom(pool));
}

/**
 * 關卡工廠：依「節點」與「區域上下文」動態組裝關卡資料
 * @param {object} node 地圖節點（來自 mapData.js 或 regionRegistry.generateRegionGraph()，皆含 type/difficulty）
 * @param {object} options
 *   - regionId: 目前所在區域id（來自 gameState.currentRegionId），無值代表舊系統/debug情境
 *   - isFinalOfRun: 本區域是否為本輪壓軸（來自 gameState.currentRegionIsFinal）
 *   - limitedToOne: 各個擊破效果生效中
 */
export function getStageData(node, options = {}) {
    const nodeType = (node && node.type) ? node.type : 'BATTLE';
    const difficulty = (node && node.difficulty) ? node.difficulty : 1;
    const limitedToOne = !!options.limitedToOne;
    const scaleTier = options.scaleTier || 0;
    const regionDef = options.regionId ? getRegionData(options.regionId) : null;

    let enemyIds = [];
    let stageName = '';

    const isForcedNode = !!(node && Array.isArray(node.forceEnemies) && node.forceEnemies.length > 0);

    if (isForcedNode) {
        enemyIds = node.forceEnemies;
        stageName = `${regionDef ? regionDef.name + ' - ' : ''}${node.label || '特殊戰鬥'}`;
    } else if (nodeType === 'BATTLE_FINAL' && regionDef) {
        if (options.isFinalOfRun) {
            enemyIds = [regionDef.regionBoss];
            stageName = `👑 ${regionDef.name} - 壓軸首領戰`;
        } else {
            enemyIds = [regionDef.eliteEnemy];
            stageName = `⚔️ ${regionDef.name} - 菁英戰`;
        }
    } else if (nodeType === 'BOSS') {
        // 🟢 舊系統(mapData.js)固定黑龍頭目戰，維持原行為
        enemyIds = ['black_dragon'];
        stageName = `👹 第 ${difficulty} 層 - 頭目戰：滅世黑龍`;
    } else if (regionDef) {
        enemyIds = getRegionBattleEnemyIds(regionDef, difficulty, limitedToOne);
        stageName = `⚔️ ${regionDef.name} - 一般戰鬥${limitedToOne ? '（各個擊破生效中）' : ''}`;
    } else {
        // 🟢 沒有區域上下文：回退舊系統邏輯（debug測試關卡等情境）
        enemyIds = getBattleEnemyIds(difficulty, limitedToOne);
        stageName = `⚔️ 第 ${difficulty} 層 - 一般戰鬥${limitedToOne ? '（各個擊破生效中）' : ''}`;
    }

    const enemies = enemyIds
        .map(id => createEnemyInstance(id, scaleTier))
        .filter(e => e !== null && e !== undefined);

    if (enemies.length === 0) {
        console.error(`⚠️ 關卡 (node=${node ? node.id : '?'}, type=${nodeType}) 找不到對應敵人資料，enemyIds=`, enemyIds);
    }

    const isBossFight = (nodeType === 'BOSS') || (nodeType === 'BATTLE_FINAL') || isForcedNode;
    return {
        name: stageName,
        enemies: enemies,
        rewardConfig: {
            baseGold: isBossFight ? 200 : 20 + difficulty * 10
        }
    };
}