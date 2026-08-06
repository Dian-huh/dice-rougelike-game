// js/data/enemyData.js
import { CombatSystem } from '../systems/CombatSystem.js';
import { ENEMY_TEMPLATE } from './enemyTemplate.js';

// js/data/enemyData.js (基礎範本精簡)
const BASE_ENEMY = Object.assign(Object.create(ENEMY_TEMPLATE), {
    id: '', name: '', hp: 10, maxHp: 10, atk: 3, block: 0,
    speedDice: 0, currentIntent: null,
    
    // 核心資源：CT (技能/復原) / OD (狂暴) / Break (破防)
    ct: 0, maxCt: 0,
    od: 0, maxOd: 0,
    isFlying: false, isOD: false, isBreak: false,

    executeAction(self, intent, target, combatSys, log, enemies) {
        const cs = combatSys || CombatSystem;
        // 🟢 補上 enemies 參數傳進去
        cs.executeEnemyIntent(self, intent, target, log, enemies);
    }
});

// 🟢 2. 黑龍 Boss 資料結構 (標籤化資料驅動)
export const BLACK_DRAGON_DATA = Object.assign(Object.create(BASE_ENEMY), {
    id: 'black_dragon',
    name: '🐉 滅世黑龍',
    maxHp: 100,
    hp: 100,
    atk: 5,
    ct: 0,
    maxCt: 3,
    od: 0,
    maxOd: 10,
    critBonus: 5,
    critChance: 0.15,
    pressureUsedThisOD: false,
    speedDiceSides: 10,

    rollCrit() {
        if (this.isOD) return true; // OD 狂暴下必定暴擊
        return Math.random() < (this.critChance || 0.15);
    },

    // 🎯 意圖決策 AI：改用標籤描述招式特性
    getIntent(turnCount, speedDice, self) {
        // Break 狀態：僅能執行一般行動
        if (this.isBreak) {
            const generalPool = [
                { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
                { id: 'CLAW', type: 'ATTACK', value: 3, hits: 2, canCrit: true, desc: '🐾 爪擊 (造成 2 次 3 點傷害)' },
                { id: 'CHARGE', type: 'BUFF', healValue: 7, addCt: 1, desc: '✨ 蓄力 (獲得 1CT，回復 7 點血量)' }
            ];
            return Phaser.Utils.Array.GetRandom(generalPool);
        }

        // OD 狂暴：首次進入發動威壓
        if (this.isOD && !this.pressureUsedThisOD) {
            return { id: 'PRESSURE', type: 'DEBUFF', desc: '😱 威壓 (下次攻擊骰鎖定為1，本回合無法使用主動技)' };
        }

        // 飛行中：下回合必定發動墜擊
        if (this.isFlying) {
            return { id: 'DIVE', type: 'ATTACK', value: 7 + this.ct, canCrit: true, desc: `💥 墜擊 (造成 ${7 + this.ct} 點傷害，解除飛行)` };
        }

        // CT 滿：發動制裁大招 (無視閃避與格擋的真實傷害)
        if (this.ct >= this.maxCt) {
            return { id: 'JUDGMENT', type: 'SPECIAL', value: 5 + this.od, trueDamage: true, consumeCt: 3, desc: `⚡ 制裁 (造成 ${5 + this.od} 點真實傷害)` };
        }

        // 機率發動吐息 (附加劇毒，消耗 1CT)[cite: 1]
        if (this.ct >= 1 && Math.random() < 0.25) {
            return { id: 'BREATH', type: 'ATTACK', value: 7, consumeCt: 1, statusEffect: { type: 'poison', turns: 3 }, desc: '☠️ 吐息 (消耗1CT，造成 7 點傷害並附加劇毒3回合)' };
        }

        // 機率起飛[cite: 1]
        if (Math.random() < 0.3) {
            return { id: 'FLY', type: 'BUFF', desc: '🦅 飛翔 (進入飛行狀態)' };
        }

        // 常規招式池[cite: 1]
        const pool = [
            { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
            { id: 'CLAW', type: 'ATTACK', value: 3, hits: 2, canCrit: true, desc: '🐾 爪擊 (造成 2 次 3 點傷害)' },
            { id: 'CHARGE', type: 'BUFF', healValue: 7, addCt: 1, desc: '✨ 蓄力 (獲得 1CT，回復 7 點血量)' }
        ];
        return Phaser.Utils.Array.GetRandom(pool);
    },

    // 🟢 對齊契約受擊機制[cite: 1]
    onTakeHit(log) {
        if (this.isBreak) return;
        if (this.isOD) {
            this.od = Math.max(0, this.od - 1);
            if (this.od <= 0) {
                this.isOD = false;
                this.isBreak = true;
                this.pressureUsedThisOD = false;
            }
        } else {
            this.od = Math.min(this.maxOd, this.od + 1);
            if (this.od >= this.maxOd) {
                this.isOD = true;
                this.pressureUsedThisOD = false;
            }
        }
    },

    onTurnEnd() {
        this.ct = Math.min(this.maxCt, this.ct + 1);
        if (this.isBreak && this.ct >= this.maxCt) {
            this.ct -= 3;
            this.isBreak = false;
        }
    }
});

// 🟢 3. 一般怪物資料庫 (套用資料驅動)
export const ENEMY_DATABASE = {
    // 🟢 哥布林
    'goblin': Object.assign(Object.create(BASE_ENEMY), {
        id: 'goblin',
        name: '👺 哥布林',
        maxHp: 20,
        hp: 20,
        atk: 2,
        critBonus: 2,
        critChance: 0.15,
        ct: 0,
        maxCt: 2,
        od: 0,
        maxOd: 3,
        speedDiceSides: 8,

        rollCrit() {
            if (this.isOD) return true; // OD 狂暴：必定暴擊
            return Math.random() < (this.critChance || 0.15);
        },

        getIntent(turnCount, speedDice, self) {
            // 1. Break 狀態：僅能執行一般行動
            if (this.isBreak) {
                const normalPool = [
                    { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
                    { id: 'ROCK_THROW', type: 'ATTACK', value: 1, hits: 3, canCrit: true, desc: '🪨 投石 (造成 3 次 1 點傷害)' }
                ];
                return Phaser.Utils.Array.GetRandom(normalPool);
            }

            // 2. 特殊行動：2CT 時有 50% 概率發動【呼朋引伴】
            if (this.ct >= 2 && Math.random() < 0.5) {
                return { 
                    id: 'SUMMON', 
                    type: 'SPECIAL', 
                    consumeCt: 2, 
                    desc: '📢 呼朋引伴 (消耗 2CT，召喚一隻哥布林加入戰鬥)' 
                };
            }

            // 3. 一般行動池
            const generalPool = [
                { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
                { id: 'ROCK_THROW', type: 'ATTACK', value: 1, hits: 3, canCrit: true, desc: '🪨 投石 (造成 3 次 1 點傷害)' }
            ];
            return Phaser.Utils.Array.GetRandom(generalPool);
        }
    }),

    // 🟢 新增：哥布林薩滿
    'goblin_shaman': Object.assign(Object.create(BASE_ENEMY), {
        id: 'goblin_shaman',
        name: '🔮 哥布林薩滿',
        maxHp: 15,
        hp: 15,
        atk: 1,
        critBonus: 1,
        critChance: 0.15,
        ct: 0,
        maxCt: 3,
        od: 0,
        maxOd: 2,
        speedDiceSides: 4,
        chargeTurns: 0,
        heroicTurns: 0,

        rollCrit() {
            if (this.isOD) return true;
            return Math.random() < (this.critChance || 0.15);
        },

        getIntent(turnCount, speedDice, self) {
            // Break 狀態：僅能一般攻擊
            if (this.isBreak) {
                return { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` };
            }

            // 部落英雄：CT 達 2 時，50% 機率優先發動
            if (this.ct >= 2 && Math.random() < 0.5) {
                return {
                    id: 'TRIBAL_HERO', type: 'ALLY_BUFF', effect: 'HEROIC_BUFF', turns: 2, consumeCt: 2,
                    desc: '部落英雄 (自己與1名友軍獲得英勇效果2回合)'
                };
            }

            // 一般行動池：普攻 + 3 種薩滿加護，隨機抽取
            const pool = [
                { id: 'ATTACK', type: 'ATTACK', value: this.atk, canCrit: true, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
                { id: 'SHAMAN_GUARD', type: 'ALLY_BUFF', effect: 'BLOCK', value: 4, desc: '薩滿加護-守護 (其他友軍獲得4點格擋)' },
                { id: 'SHAMAN_CHARGE', type: 'ALLY_BUFF', effect: 'CHARGE_BUFF', turns: 2, desc: '薩滿加護-衝鋒 (其他友軍獲得衝鋒效果2回合)' },
                { id: 'SHAMAN_HOLY', type: 'ALLY_BUFF', effect: 'HEAL_ALL', value: 3, desc: '薩滿加護-聖光 (友軍全體回復3點HP)' }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    })

};

// 🟢 4. 乾淨工廠函式 (保留防呆契約檢查)
export function createEnemyInstance(enemyId) {
    const config = enemyId === 'black_dragon' ? BLACK_DRAGON_DATA : ENEMY_DATABASE[enemyId];
    if (!config) {
        console.error(`⚠️ 找不到敵人配置 ID: ${enemyId}`);
        return null;
    }

    const instance = Object.assign(Object.create(config), {
        hp: config.maxHp,
        block: 0,
        armorHits: 0
    });

    if (instance.getIntent.length !== 3) {
        console.error(`⚠️ [${enemyId}] getIntent 參數數量不對，應為3個 (turnCount, speedDice, self)`);
    }
    if (instance.executeAction.length !== 6) {
        console.error(`⚠️ [${enemyId}] executeAction 參數數量不對，應為6個`);
    }

    return instance;
}

// js/data/enemyData.js 內部的 ENEMY_DATABASE 擴充

