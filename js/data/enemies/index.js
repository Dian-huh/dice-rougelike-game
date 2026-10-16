// js/data/enemies/index.js
import { BASE_ENEMY } from './baseEnemy.js';   // 若 createEnemyInstance 沒用到可不 import
import { FOREST_ENEMIES } from './forest.js';
import { BOUNDARY_ENEMIES } from './boundary.js';
import { BANDIT_ENEMIES } from './bandit.js';
import { DEADCITY_ENEMIES } from './deadcity.js';

// 合併時檢查 id 是否重複，避免新增區域時不小心蓋掉別區的敵人
function mergeEnemyTables(...tables) {
    const result = {};
    tables.forEach(t => Object.keys(t).forEach(id => {
        if (result[id]) console.error(`⚠️ 敵人 id 重複登記: ${id}`);
        result[id] = t[id];
    }));
    return result;
}

export const ENEMY_DATABASE = mergeEnemyTables(
    FOREST_ENEMIES, BOUNDARY_ENEMIES, BANDIT_ENEMIES, DEADCITY_ENEMIES
);

export const ENEMY_SCALING_BY_TIER = [
    { hpMul: 1.0, dmgMul: 1.0 },
    { hpMul: 3.0, dmgMul: 2.0 },
    { hpMul: 5.0, dmgMul: 3.0 }
];

export function createEnemyInstance(enemyId, scaleTier = 0) {
    const config = ENEMY_DATABASE[enemyId];
    if (!config) {
        console.error(`⚠️ 找不到敵人配置 ID: ${enemyId}`);
        return null;
    }

    const tier = Math.max(0, Math.min(scaleTier, ENEMY_SCALING_BY_TIER.length - 1));
    const scaling = ENEMY_SCALING_BY_TIER[tier];
    const scaledMaxHp = Math.max(1, Math.round(config.maxHp * scaling.hpMul));

    const instance = Object.assign(Object.create(config), {
        maxHp: scaledMaxHp,
        hp: scaledMaxHp,
        dmgMul: scaling.dmgMul,
        scaleTier: tier,   // 供召喚等「中途生成敵人」的邏輯繼承同一等級
        block: 0,
        armorHits: 0,
        activeEffects: []
    });

    if (instance.getIntent.length !== 3) {
        console.error(`⚠️ [${enemyId}] getIntent 參數數量不對，應為3個 (turnCount, speedDice, self)`);
    }
    if (instance.executeAction.length !== 6) {
        console.error(`⚠️ [${enemyId}] executeAction 參數數量不對，應為6個`);
    }

    return instance;
}