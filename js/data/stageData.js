import { createEnemyInstance } from './enemyData.js';
import { getRegionData } from './regionRegistry.js';

// 依區域的 enemyPool.theme 隨機抽出陣容
function getRegionBattleEnemyIds(regionDef, difficulty = 1, limitedToOne = false) {
    const pool = regionDef.enemyPool.theme;
    const count = (limitedToOne || difficulty < 2) ? 1 : 2;
    return Array.from({ length: count }, () => Phaser.Utils.Array.GetRandom(pool));
}

export function getStageData(node, options = {}) {
    const nodeType = (node && node.type) ? node.type : 'BATTLE';
    const difficulty = (node && node.difficulty) ? node.difficulty : 1;
    const limitedToOne = !!options.limitedToOne;
    const scaleTier = options.scaleTier || 0;
    const regionDef = options.regionId ? getRegionData(options.regionId) : null;

    if (!regionDef) {
        console.error(`⚠️ getStageData 缺少有效的區域上下文 (regionId=${options.regionId})`);
        return null;   // BattleSetup 已有 stageInfo || {...} 的防呆
    }

    let enemyIds = [];
    let stageName = '';
    const isForcedNode = !!(node && Array.isArray(node.forceEnemies) && node.forceEnemies.length > 0);

    if (isForcedNode) {
        enemyIds = node.forceEnemies;
        stageName = `${regionDef.name} - ${node.label || '特殊戰鬥'}`;
    } else if (nodeType === 'BATTLE_FINAL') {
        if (options.isFinalOfRun) {
            enemyIds = Array.isArray(regionDef.regionBoss) ? [...regionDef.regionBoss] : [regionDef.regionBoss];
            stageName = `👑 ${regionDef.name} - 壓軸首領戰`;
        } else {
            enemyIds = [regionDef.eliteEnemy];
            stageName = `⚔️ ${regionDef.name} - 菁英戰`;
        }
    } else {
        enemyIds = getRegionBattleEnemyIds(regionDef, difficulty, limitedToOne);
        stageName = `⚔️ ${regionDef.name} - 一般戰鬥${limitedToOne ? '（各個擊破生效中）' : ''}`;
    }

    const enemies = enemyIds.map(id => createEnemyInstance(id, scaleTier)).filter(Boolean);
    if (enemies.length === 0) {
        console.error(`⚠️ 關卡 (node=${node ? node.id : '?'}, type=${nodeType}) 找不到對應敵人資料，enemyIds=`, enemyIds);
    }

    const isBossFight = (nodeType === 'BATTLE_FINAL') || isForcedNode;
    return {
        name: stageName,
        enemies,
        rewardConfig: { baseGold: isBossFight ? 200 : 20 + difficulty * 10 }
    };
}