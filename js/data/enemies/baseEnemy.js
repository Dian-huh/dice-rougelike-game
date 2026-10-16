// js/data/enemies/baseEnemy.js
import { ENEMY_TEMPLATE } from '../enemyTemplate.js';
import { CombatSystem } from '../../systems/CombatSystem.js';

// js/data/enemyData.js (基礎範本精簡)
export const BASE_ENEMY = Object.assign(Object.create(ENEMY_TEMPLATE), {
    id: '', name: '', hp: 10, maxHp: 10, atk: 3, block: 0,
    speedDice: 0, currentIntent: null,
    
    // 核心資源：CT (技能/復原) / OD (狂暴) / Break (破防)
    ct: 0, maxCt: 0,
    od: 0, maxOd: 0,
    isFlying: false, isOD: false, isBreak: false,

    // 🟢 共用：多數敵人暴擊判定規則相同(OD中必定暴擊，否則依critChance機率)，
    // 個別敵人如有不同規則可自行在自己的物件字面量覆寫
    /** @returns {boolean} */
    rollCrit() {
        if (this.isOD) return true;
        return Math.random() < CombatSystem.getEffectiveEnemyCritChance(this);
    },

    // 🟢 通用普攻意圖。desc 必須維持「造成 N 點傷害」格式，getIntentDisplayDesc 的正則才換算得到
    basicAttack() {
       return { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` };
    },

    executeAction(self, intent, target, combatSys, log, enemies) {
        const cs = combatSys || CombatSystem;
        // 🟢 補上 enemies 參數傳進去
        cs.executeEnemyIntent(self, intent, target, log, enemies);
    }
});


