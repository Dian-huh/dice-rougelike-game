import { BASE_ENEMY } from './baseEnemy.js';

export const BOUNDARY_ENEMIES = {
    'shield_guardian': Object.assign(Object.create(BASE_ENEMY), {
        id: 'shield_guardian',
        name: '🛡️ 盾之守衛',
        maxHp: 40,
        hp: 40,
        atk: 1,
        critBonus: 1,
        critChance: 0.15,
        ct: 0,
        maxCt: 3,
        od: 0,
        maxOd: 5,
        speedDiceSides: 4,

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }

            // 滿CT：全體保護
            if (this.ct >= this.maxCt) {
                return {
                    id: 'FULL_GUARD', type: 'SPECIAL', consumeCt: this.maxCt,
                    desc: '🛡️ 全體保護 (消耗全部CT，己方全體+10格擋，自己獲得嘲諷、盾反，直到自己格擋歸零)'
                };
            }

            const pool = [
                this.basicAttack(),
                { id: 'KEY_GUARD', type: 'ALLY_BUFF', effect: 'RANDOM_SELF_BLOCK', value: 3, desc: '🛡️ 關鍵守護 (自己與隨機1位友軍各獲得3點格擋)' }
            ];
            // CT-1盾擊：需要目前格擋 >= 5 才會被納入選招池，避免發動失敗
            if (this.ct >= 1 && (this.block || 0) >= 5) {
                pool.push({
                    id: 'SHIELD_BASH', type: 'SPECIAL', consumeCt: 1, value: 3,
                    selfBlockCost: 5,
                    statusEffect: { type: 'stun', turns: 2 },
                    desc: '🛡️ 盾擊 (消耗5點格擋，對敵方單體造成3點傷害並施加暈眩2回合)'
                });
            }
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'sword_guardian': Object.assign(Object.create(BASE_ENEMY), {
        id: 'sword_guardian',
        name: '⚔️ 劍之守衛',
        maxHp: 30, hp: 30, atk: 2, critBonus: 2, critChance: 0.15,
        ct: 0, maxCt: 2, od: 0, maxOd: 3, speedDiceSides: 6,

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }
            if (this.ct >= this.maxCt) {
                return { id: 'TRIPLE_SLASH', type: 'ATTACK', value: this.atk, hits: 3, canCrit: true, consumeCt: this.maxCt, desc: `🗡️ 連續劈砍 (消耗全部CT，造成3次${this.atk}點普攻傷害)` };
            }
            const pool = [
                this.basicAttack(),
                { id: 'SLASH', type: 'ATTACK', value: 4, canCrit: true, desc: '🗡️ 劈砍 (造成單體4點傷害)' },
                { id: 'GAIN_COUNTER', type: 'SPECIAL', desc: '🛡️ 獲得1層反擊' }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'FOCUS', type: 'SPECIAL', consumeCt: 1, desc: '🎯 專注 (攻擊力+1，爆擊率+5%)' });
            }
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'staff_guardian': Object.assign(Object.create(BASE_ENEMY), {
        id: 'staff_guardian',
        name: '🔮 杖之守衛',
        maxHp: 20, hp: 20, atk: 1, critBonus: 1, critChance: 0.15,
        ct: 0, maxCt: 5, od: 0, maxOd: 3, speedDiceSides: 4,
        pendingDelayedHeal: false,

        getIntent(turnCount, speedDice, self) {
            // 🟢 最優先：上次「範圍治療」預約的延遲治療，輪到自己行動時觸發
            if (this.pendingDelayedHeal) {
                this.pendingDelayedHeal = false;
                return { id: 'DELAYED_HEAL_RESOLVE', type: 'SPECIAL', desc: '✨ 範圍治療發動 (血量百分比最低的我方回復5，其餘回復2)' };
            }

            if (this.isBreak) {
                return this.basicAttack();
            }

            const pool = [
                this.basicAttack(),
                { id: 'HEAL_LOWEST', type: 'SPECIAL', desc: '💚 治療 (血量百分比最低的我方回復5)' }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'AREA_HEAL_CAST', type: 'SPECIAL', consumeCt: 1, desc: '✨ 範圍治療 (下回合輪到自己行動時發動)' });
                pool.push({ id: 'SAGE_BLESS', type: 'SPECIAL', consumeCt: 1, desc: '🔮 賢者加護 (除自己外我方獲得賢者加護2回合)' });
            }
            if (this.ct >= 3) {
                pool.push({ id: 'BLAST_MAGIC', type: 'SPECIAL', consumeCt: 3, value: 10, desc: '💥 爆破魔法 (對玩家造成10點傷害)' });
            }
            if (this.ct >= 2) {
                pool.push({ id: 'FREEZE', type: 'SPECIAL', consumeCt: 2, value: 2, desc: '❄️ 冰結 (敵方單體獲得冰結2回合並造成2點傷害)' });
            }
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'crossbow_guardian': Object.assign(Object.create(BASE_ENEMY), {
        id: 'crossbow_guardian',
        name: '🏹 弩之守衛',
        maxHp: 10, hp: 10, atk: 5, critBonus: 3, critChance: 0.15,
        ct: 0, maxCt: 2, od: 0, maxOd: 2, speedDiceSides: 8,
        nextDamageBonus: 0,

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }
            if (this.ct >= this.maxCt) {
                return { id: 'ARMOR_PIERCE', type: 'SPECIAL', value: 5, consumeCt: this.maxCt, desc: '🎯 破甲箭 (消耗全部CT，敵方單體護甲值歸零並造成5點傷害、流血2層)' };
            }
            const pool = [
                this.basicAttack(),
                { id: 'DODGE', type: 'SPECIAL', desc: '🌀 閃避' },
                { id: 'RAPID_FIRE', type: 'ATTACK', value: 1, hits: 3, canCrit: true, desc: '🏹 連射 (造成3次1點傷害)' }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'RESUPPLY', type: 'SPECIAL', consumeCt: 1, desc: '🎯 補充箭矢 (下次造成傷害提升2點)' });
            }
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    //boss--------------------------------------------------------------
    
    'boundary_guardian': Object.assign(Object.create(BASE_ENEMY), {
        id: 'boundary_guardian',
        name: '⚔️ 境界衛士',
        maxHp: 150, hp: 150, atk: 4, critBonus: 3, critChance: 0.15,
        ct: 0, maxCt: 3, od: 0, maxOd: 10, speedDiceSides: 8,

        phase: 1,
        phaseThresholds: [0.6],
        selfDamagePerTurn: 0,
        healOnSpecialUse: true,
        lockedBeforeGroundThunder: false,
        pendingLightningRecall: false,

        onPhaseTransition(newPhase, log) {
            const safeLog = typeof log === 'function' ? log : console.log;
            if (newPhase === 2) {
                this.isOD = true;
                this.od = this.maxOd;
                this.ct = Math.min(this.maxCt, this.ct + 1);
                this.lockedBeforeGroundThunder = true;
                this.selfDamagePerTurn = 3;
                this.maxOd = 10;
                this.maxCt = 4;
                this.bonusCtRegen = 1;
                this.atk += 2;
                this.critChance += 0.3; 
                safeLog(`🌀 ${this.name} 進入【二階段】！強制進入OD狀態，CT+1，直到發動【憾地洛雷】前不會使用其他特殊技！`);
            }
        },

        getIntent(turnCount, speedDice, self) {
            if (this.pendingLightningRecall) {
                this.pendingLightningRecall = false;
                return { id: 'LIGHTNING_RECALL', type: 'ATTACK', value: this.atk, canCrit: true, desc: '⚡ 回收雷槍 (延遲傷害+2)' };
            }

            if (this.isBreak) {
                return this.basicAttack();
            }

            // 🟢 新增：飛行狀態下，特動只會選擇憾地洛雷（不論CT是否滿，一律等待CT滿才發動；未滿CT只能一般行動）
            if (this.isFlying) {
                if (this.ct >= this.maxCt) {
                    return { id: 'GROUND_THUNDER', type: 'SPECIAL', consumeCt: this.maxCt, desc: '⚡ 憾地洛雷 (消耗全部CT，解除飛行，全體暈眩+電擊，單體10點傷害)' };
                }
                const flyingGeneralPool = [
                    this.basicAttack(),
                    { id: 'SWEEP', type: 'ATTACK', value: 4, canCrit: true, desc: '💫 橫掃 (造成4點傷害)' }
                ];
                return Phaser.Utils.Array.GetRandom(flyingGeneralPool);
            }

            if (this.phase === 2 && this.lockedBeforeGroundThunder) {
                if (this.ct >= this.maxCt) {
                    return { id: 'GROUND_THUNDER', type: 'SPECIAL', consumeCt: this.maxCt, desc: '⚡ 憾地洛雷 (消耗全部CT，解除飛行，全體暈眩+電擊，單體10點傷害)' };
                }
                const generalPool = [
                    this.basicAttack(),
                    { id: 'PRAYER_BLESSING', type: 'SPECIAL', desc: '🙏 祈求加護 (回復15%最大生命，過量轉格擋)' },
                    { id: 'THRUST', type: 'ATTACK', value: 4, canCrit: true, statusEffect: { type: 'bleed', stacks: 2 }, desc: '🗡️ 突刺 (造成4點傷害並給予流血2)' },
                    { id: 'SWEEP', type: 'ATTACK', value: 4, canCrit: true, desc: '💫 橫掃 (造成4點傷害)' }
                ];
                return Phaser.Utils.Array.GetRandom(generalPool);
            }

            const generalPool = [
                this.basicAttack(),
                { id: 'PRAYER_BLESSING', type: 'SPECIAL', desc: '🙏 祈求加護 (回復15%最大生命，過量轉格擋)' },
                { id: 'THRUST', type: 'ATTACK', value: 4, canCrit: true, statusEffect: { type: 'bleed', stacks: 2 }, desc: '🗡️ 突刺 (造成4點傷害並給予流血2)' },
                { id: 'SWEEP', type: 'ATTACK', value: 4, canCrit: true, desc: '💫 橫掃 (造成4點傷害)' }
            ];

            if (this.phase === 1) {
                if (this.ct >= this.maxCt) {
                    generalPool.push({ id: 'GROUND_SLAM', type: 'SPECIAL', consumeCt: this.maxCt, desc: '💥 裂地擊 (消耗全部CT，全體暈眩+7點傷害，自己+7格擋)' });
                }
                if (this.ct >= 2) {
                    generalPool.push({ id: 'DANCE_FLOWER', type: 'ATTACK', value: 2, hits: 4, canCrit: true, consumeCt: 2, desc: '🌸 舞花 (造成4次2點傷害)' });
                    generalPool.push({ id: 'CONTINUOUS_THRUST', type: 'SPECIAL', consumeCt: 2, desc: '🗡️ 連續刺擊 (護甲歸零+流血3，若已有流血則追加2次1點傷害)' });
                }
            } else {
                if (this.ct >= this.maxCt) {
                    generalPool.push({ id: 'GROUND_THUNDER', type: 'SPECIAL', consumeCt: this.maxCt, desc: '⚡ 憾地洛雷 (消耗全部CT，解除飛行，全體暈眩+電擊，單體10點傷害)' });
                }
                if (this.ct >= 3) {
                    generalPool.push({ id: 'LIGHTNING_SPEAR', type: 'SPECIAL', consumeCt: 3, desc: '⚡ 引雷槍 (7點傷害+電擊，若目標有流血則追加暈眩)' });
                }
                if (this.ct >= 1) {
                    generalPool.push({ id: 'THUNDER_THRUST', type: 'SPECIAL', consumeCt: 1, desc: '⚡ 天雷突刺 (傷害=4+流血層數+電擊層數)' });
                }
                generalPool.push({ id: 'ASCEND', type: 'BUFF', desc: '🦅 展翼 (進入飛行狀態)' });   // 🟢 新增：二階特動池新增飛行
            }

            return Phaser.Utils.Array.GetRandom(generalPool);
        }
    }),

}