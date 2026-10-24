import { BASE_ENEMY } from './baseEnemy.js';
import { EffectEngine } from '../../systems/EffectEngine.js';
import { allyMsg } from './sharedMoves.js';

// 境界衛士招式（module 層級，getIntent 內多處共用，避免重複貼同一份宣告）
const BG = {
    prayer: () => ({
        id: 'PRAYER_BLESSING', type: 'SPECIAL', desc: '🙏 祈求加護 (回復15%最大生命，過量轉格擋)',
        effects: ['heal'], heal: (c) => Math.floor(c.attacker.maxHp * 0.15), healOverflowToBlock: true,
        healMsg: (c) => `🙏 ${c.attacker.name} 發動【祈求加護】，回復 ${c.healed} 點HP！`
    }),
    thrust: () => ({ id: 'THRUST', type: 'ATTACK', value: 4, canCrit: true, statusEffect: { type: 'bleed', stacks: 2 }, effects: ['attack'], desc: '🗡️ 突刺 (造成4點傷害並給予流血2)' }),
    sweep: () => ({ id: 'SWEEP', type: 'ATTACK', value: 4, canCrit: true, effects: ['attack'], desc: '💫 橫掃 (造成4點傷害)' }),
    ascend: () => ({
        id: 'ASCEND', type: 'BUFF', desc: '🦅 展翼 (進入飛行狀態)',
        effects: ['setFlag'], setFlag: { isFlying: true },
        setFlagMsg: (c) => `🦅 ${c.attacker.name} 振翅升空進入【飛翔】狀態！`
    }),
    danceFlower: () => ({ id: 'DANCE_FLOWER', type: 'ATTACK', value: 2, hits: 4, canCrit: true, consumeCt: 2, bossHeal: true, effects: ['attack'], desc: '🌸 舞花 (造成4次2點傷害)' }),
    groundSlam: (maxCt) => ({
        id: 'GROUND_SLAM', type: 'SPECIAL', consumeCt: maxCt, bossHeal: true,
        desc: '💥 裂地擊 (消耗全部CT，全體暈眩+7點傷害，自己+7格擋)',
        effects: ['status', 'damage', 'block'],
        openMsg: (c) => `💥 ${c.attacker.name} 發動【裂地擊】！`,
        status: [{ type: 'stun', turns: 2, msg: '' }],
        damage: 7,
        block: 7, blockTo: 'self',
        blockMsg: (c) => `🛡️ ${c.attacker.name} 獲得 7 點格擋！`
    }),
    continuousThrust: () => ({
        id: 'CONTINUOUS_THRUST', type: 'SPECIAL', consumeCt: 2, bossHeal: true,
        desc: '🗡️ 連續刺擊 (護甲歸零+流血3，若已有流血則追加2次1點傷害)',
        effects: ['breakArmor', 'status', 'damage'],
        breakArmorMsg: '',
        status: [{ type: 'bleed', stacks: 3,
            msg: (c) => `🗡️ ${c.attacker.name} 發動【連續刺擊】！${c.target.name} 護甲歸零、進入【破防】，附加3層【流血】！` }],
        // 流血剛加了 3 層，所以「原本就有流血」⟺ 現在 > 3
        damage: 1, hits: 2, damageWhen: (c) => (c.target.bleedStacks || 0) > 3,
        damageMsg: (c) => `🩸 ${c.target.name} 已有流血在身，追加造成2次1點傷害！`
    }),
    groundThunder: (maxCt) => ({
        id: 'GROUND_THUNDER', type: 'SPECIAL', consumeCt: maxCt, bossHeal: true,
        desc: '⚡ 憾地洛雷 (消耗全部CT，解除飛行，全體暈眩+電擊，單體10點傷害)',
        effects: ['setFlag', 'status', 'damage'],
        openMsg: (c) => `⚡ ${c.attacker.name} 發動【憾地洛雷】！`,
        setFlag: { isFlying: false, lockedBeforeGroundThunder: false },
        status: [{ type: 'stun', turns: 2, msg: '' }, { type: 'bleed', stacks: 2, msg: '' }, { type: 'shock', stacks: 2 }],
        damage: 10
    }),
    lightningSpear: () => ({
        id: 'LIGHTNING_SPEAR', type: 'SPECIAL', consumeCt: 3, bossHeal: true,
        desc: '⚡ 引雷槍 (7點傷害+電擊，若目標有流血則追加暈眩)',
        effects: ['damage', 'status', 'selfBuff', 'setFlag'],
        openMsg: (c) => `⚡ ${c.attacker.name} 發動【引雷槍】！`,
        damage: 7,
        status: [
            { type: 'shock', stacks: 2 },
            { type: 'stun', turns: 2, when: (c) => (c.target.bleedStacks || 0) > 0,
              msg: (c) => `🩸 ${c.target.name} 已有流血，追加施加【暈眩】(2回合)！` }
        ],
        selfBuff: { nextDamageBonus: 2 },
        setFlag: { pendingLightningRecall: true }
    }),
    thunderThrust: () => ({
        id: 'THUNDER_THRUST', type: 'SPECIAL', consumeCt: 1, bossHeal: true,
        desc: '⚡ 天雷突刺 (傷害=4+流血層數+電擊層數)',
        effects: ['damage', 'status'],
        // 傷害依「加流血之前」的層數，所以 damage 排在 status 前面
        damage: (c) => {
            const s = EffectEngine.getEntry(c.target, 'debuff_shock');
            return 6 + (c.target.bleedStacks || 0) + (s ? s.stacks : 0);
        },
        damageMsg: (c) => `⚡ ${c.attacker.name} 發動【天雷突刺】，給予3層流血並造成 ${c.dmg} 點傷害！`,
        status: [{ type: 'bleed', stacks: 3, msg: '' }]
    })
};

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
                    desc: '🛡️ 全體保護 (消耗全部CT，己方全體+10格擋，自己獲得嘲諷、盾反，直到自己格擋歸零)',
                    effects: ['block', 'effect'],
                    block: 10, blockTo: 'allies',
                    effect: [
                        { id: 'taunt', mode: 'push', props: { clearOnBlockZero: true } },
                        { id: 'guardian_counter', mode: 'push', props: { clearOnBlockZero: true } }
                    ],
                    effectMsg: (c) => `🛡️ ${c.attacker.name} 發動【全體保護】！己方全體獲得 10 點格擋，自己獲得【嘲諷】與【盾反】(直到格擋歸零)！`
                };
            }

            const pool = [
                this.basicAttack(),
                { id: 'KEY_GUARD', type: 'ALLY_BUFF', desc: '🛡️ 關鍵守護 (自己與隨機1位友軍各獲得3點格擋)',
                  effects: ['block'], blockTo: 'selfAndRandomAlly', block: 3,
                  blockMsg: (c) => `🛡️ ${c.attacker.name} 發動【${c.intent.desc}】，自己獲得 3 點格擋`
                      + (c.targets[1] ? `，並讓 ${c.targets[1].name} 一同獲得 3 點格擋！` : `！（沒有其他友軍可分享效果）`) 
                }
            ];
            // CT-1盾擊：需要目前格擋 >= 5 才會被納入選招池，避免發動失敗
                pool.push({
                    id: 'SHIELD_BASH', type: 'SPECIAL', consumeCt: 1, value: 3,
                    desc: '🛡️ 盾擊 (消耗5點格擋，對敵方單體造成3點傷害並施加暈眩2回合)',
                    effects: ['selfCost', 'damage', 'status'],
                    selfCost: { block: 5 },
                    selfCostFailMsg: (c) => `🛡️ ${c.attacker.name} 格擋不足，【盾擊】發動失敗！`,
                    selfCostMsg: (c) => `🛡️ ${c.attacker.name} 消耗 5 點格擋，發動【盾擊】！`,
                    status: [{ type: 'stun', turns: 2 }]
                });
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
                return { id: 'TRIPLE_SLASH', type: 'ATTACK', value: this.atk, hits: 3, canCrit: true, consumeCt: this.maxCt, effects: ['attack'], desc: `🗡️ 連續劈砍 (消耗全部CT，造成3次${this.atk}點普攻傷害)` };
            }
            const pool = [
                this.basicAttack(),
                { id: 'SLASH', type: 'ATTACK', value: 4, canCrit: true, effects: ['attack'], desc: '🗡️ 劈砍 (造成單體4點傷害)' },
                { id: 'GAIN_COUNTER', type: 'SPECIAL', desc: '🛡️ 獲得1層反擊',
                  effects: ['effect'], effect: [{ id: 'counter_stack', n: 1 }],
                  effectMsg: (c) => `🛡️ ${c.attacker.name} 獲得 1 層【反擊】！` }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'FOCUS', type: 'SPECIAL', consumeCt: 1, desc: '🎯 專注 (攻擊力+1，爆擊率+5%)',
                    effects: ['selfBuff', 'setFlag'],
                    selfBuff: { atk: 1 },
                    setFlag: { critChance: (c) => (c.attacker.critChance || 0.15) + 0.05 },
                    setFlagMsg: (c) => `🎯 ${c.attacker.name} 發動【專注】，攻擊力+1、爆擊率+5%（永久生效）` 
                });
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
                return { id: 'DELAYED_HEAL_RESOLVE', type: 'SPECIAL', desc: '✨ 範圍治療發動 (血量百分比最低的我方回復5，其餘回復2)',
                    effects: ['heal', 'log'],
                    capture: { lowest: (c) => c.cs.getLowestHpPercentAlly((c.enemies || []).filter(e => e.hp > 0)) },
                    healTo: 'allies',
                    heal: (c) => c.cur === c.lowest ? 5 : 2,
                    logMsg: (c) => `✨ ${c.attacker.name} 的【範圍治療】發動！${c.lowest ? c.lowest.name + '回復5' : ''}，其餘我方回復2` 
                };
            }

            if (this.isBreak) {
                return this.basicAttack();
            }

            const pool = [
                this.basicAttack(),
                { id: 'HEAL_LOWEST', type: 'SPECIAL', desc: '💚 治療 (血量百分比最低的我方回復5)',
                  effects: ['heal'], healTo: 'lowestAlly', heal: 5,
                  healMsg: (c) => `💚 ${c.attacker.name} 治療 ${c.healTarget.name}，回復 5 點HP！` 
                }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'AREA_HEAL_CAST', type: 'SPECIAL', consumeCt: 1, desc: '✨ 範圍治療 (下回合輪到自己行動時發動)',
                    effects: ['setFlag'], setFlag: { pendingDelayedHeal: true },
                    setFlagMsg: (c) => `✨ ${c.attacker.name} 詠唱【範圍治療】，將在下次行動時發動！` 
                });
                pool.push({ id: 'SAGE_BLESS', type: 'SPECIAL', consumeCt: 1, desc: '🔮 賢者加護 (除自己外我方獲得賢者加護2回合)',
                    effects: ['effect'], effectTo: 'otherAllies', effect: [{ id: 'sage_blessing', n: 2 }],
                    effectMsg: (c) => `🔮 ${c.attacker.name} 發動【賢者加護】，其他友軍獲得加護2回合！` 
                });
            }
            if (this.ct >= 3) {
                pool.push({ id: 'BLAST_MAGIC', type: 'SPECIAL', consumeCt: 3, value: 10, desc: '💥 爆破魔法 (對玩家造成10點傷害)',
                    effects: ['damage'],
                    damageMsg: (c) => `💥 ${c.attacker.name} 發動【爆破魔法】，對 ${c.target.name} 造成 ${c.dmg} 點傷害！` 
                });
            }
            if (this.ct >= 2) {
                pool.push({ id: 'FREEZE', type: 'SPECIAL', consumeCt: 2, value: 2, desc: '❄️ 冰結 (敵方單體獲得冰結2回合並造成2點傷害)',
                    effects: ['status', 'damage'], status: [{ type: 'freeze', turns: 2 }] 
                });
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
                return { id: 'ARMOR_PIERCE', type: 'SPECIAL', value: 5, consumeCt: this.maxCt, desc: '🎯 破甲箭 (消耗全部CT，敵方單體護甲值歸零並造成5點傷害、流血2層)',
                    effects: ['breakArmor', 'damage', 'status'],
                    breakArmorMsg: (c) => `🎯 ${c.attacker.name} 發動【破甲箭】！${c.target.name} 護甲值歸零並進入【破防】狀態！`,
                    status: [{ type: 'bleed', stacks: 2, msg: (c) => `🩸 ${c.target.name} 附加2層【流血】！` }],
                    statusWhen: (c) => c.target.hp > 0 
                };
            }
            const pool = [
                this.basicAttack(),
                { id: 'DODGE', type: 'SPECIAL', desc: '🌀 閃避',
                  effects: ['dodge'], dodgeMsg: (c) => `🌀 ${c.attacker.name} 準備【閃避】！` 
                },
                { id: 'RAPID_FIRE', type: 'ATTACK', value: 1, hits: 3, canCrit: true, effects: ['attack'], desc: '🏹 連射 (造成3次1點傷害)' }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'RESUPPLY', type: 'SPECIAL', consumeCt: 1, desc: '🎯 補充箭矢 (下次造成傷害提升2點)',
                    effects: ['selfBuff'], selfBuff: { nextDamageBonus: 2 },
                    selfBuffMsg: (c) => `🎯 ${c.attacker.name} 【補充箭矢】，下次造成傷害提升2點！` 
                });
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
                return { id: 'LIGHTNING_RECALL', type: 'ATTACK', value: this.atk, canCrit: true, effects: ['attack'], desc: '⚡ 回收雷槍 (延遲傷害+2)' };
            }

            if (this.isBreak) {
                return this.basicAttack();
            }

            // 飛行狀態下，特動只會選擇憾地洛雷；CT 未滿只能一般行動
            if (this.isFlying) {
                if (this.ct >= this.maxCt) return BG.groundThunder(this.maxCt);
                return Phaser.Utils.Array.GetRandom([this.basicAttack(), BG.sweep()]);
            }

            const generalPool = [this.basicAttack(), BG.prayer(), BG.thrust(), BG.sweep()];

            if (this.phase === 2 && this.lockedBeforeGroundThunder) {
                if (this.ct >= this.maxCt) return BG.groundThunder(this.maxCt);
                return Phaser.Utils.Array.GetRandom(generalPool);
            }

            if (this.phase === 1) {
                if (this.ct >= this.maxCt) generalPool.push(BG.groundSlam(this.maxCt));
                if (this.ct >= 2) {
                    generalPool.push(BG.danceFlower());
                    generalPool.push(BG.continuousThrust());
                }
            } else {
                if (this.ct >= this.maxCt) generalPool.push(BG.groundThunder(this.maxCt));
                if (this.ct >= 3) generalPool.push(BG.lightningSpear());
                if (this.ct >= 1) generalPool.push(BG.thunderThrust());
                generalPool.push(BG.ascend());
            }

            return Phaser.Utils.Array.GetRandom(generalPool);
        }
    }),

}