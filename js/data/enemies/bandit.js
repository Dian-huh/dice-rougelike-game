import { BASE_ENEMY } from './baseEnemy.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { BOSS_CHARGE } from './sharedMoves.js';

const FLAME_GLASS_DATA = Object.assign(Object.create(BASE_ENEMY), {
    id: 'flame_glass',
    name: '💎 烈焰琉璃',
    maxHp: 200, hp: 200, atk: 8, critBonus: 4, critChance: 0.3,
    maxCt: 4, od: 0, maxOd: 7, speedDiceSides: 15,
    forceSpecialNext: false,
    hitBurnChance: 0.5, hitBurnTurns: 2,                 // 造成傷害時
    takeHitFrostbiteChance: 0.5, takeHitFrostbiteTurns: 2, // 受到傷害時
    ctChangeFreezeChance: 0.5,                           // CT 變動時

    getIntent(turnCount, speedDice, self) {
        const doubleAttack = {
            id: 'DOUBLE_ATTACK', type: 'ATTACK', value: (this.atk)/2, hits: 2, canCrit: true,
            desc: `⚔️ 普攻 (造成 2 次 ${this.atk/2} 點傷害)`
        };
        if (this.isBreak) return doubleAttack;

        const heatWave = {
            id: 'HEAT_WAVE', type: 'SPECIAL', bossSpecial: true, consumeCt: this.ct,
            desc: `🌡️ 膨冷熱波 (消耗全部CT，全體爆擊傷害並給予 ${1 + this.ct}T 灼燒與凍傷)`
        };

        // 蓄力後：必定發動膨冷熱波（CT 被戰意喪失壓到 0 時退回一般行動，旗標保留）
        if (this.forceSpecialNext && this.ct >= 1) return heatWave;

        const pool = [doubleAttack];
        if (this.ct < this.maxCt) {
            pool.push({ id: 'GLASS_CHARGE', type: 'SPECIAL', desc: '🔋 蓄力 (CT補至上限，攻擊力與爆擊增益+2，下回合必定發動膨冷熱波)' });
        }
        if (this.ct >= 1) pool.push(heatWave);
        return Phaser.Utils.Array.GetRandom(pool);
    }
});

Object.defineProperty(FLAME_GLASS_DATA, 'ct', {
    configurable: true,
    enumerable: true,
    get() { return Object.prototype.hasOwnProperty.call(this, '_ctValue') ? this._ctValue : 0; },
    set(v) {
        const old = this.ct;
        this._ctValue = v;
        if (v !== old) CombatSystem.onEnemyCtChanged(this);
    }
});

export const BANDIT_ENEMIES = {
    'bandit': Object.assign(Object.create(BASE_ENEMY), {
        id: 'bandit',
        name: '🗡️ 山賊',
        maxHp: 20, hp: 20, atk: 3, critBonus: 2, critChance: 0.15,
        ct: 0, maxCt: 2, od: 0, maxOd: 2, speedDiceSides: 6,
        stealOnAttackChance: 0.2,   // 視財如命：每次攻擊行動判定一次
        stealOnAttackAmount: 10,
        stolenGold: 0,

        getIntent(turnCount, speedDice, self) {
            if (!this.isBreak && this.ct >= this.maxCt) {
                return {
                    id: 'KIDNAP', type: 'ATTACK', value: this.atk, canCrit: true, consumeCt: this.maxCt,
                    effects: ['attack'],
                    statusEffect: { type: 'stun', turns: 2 },
                    desc: `🪢 綁架 (消耗全部CT，造成 ${this.atk} 點傷害並施加暈眩)`
                };
            }
            const pool = [
                this.basicAttack(),
                { id: 'ROB', type: 'SPECIAL', value: 30, effects: ['steal'], desc: '💰 搶劫 (盜取 30 金幣)' }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'wanted_criminal': Object.assign(Object.create(BASE_ENEMY), {
        id: 'wanted_criminal',
        name: '🚨 通緝犯',
        maxHp: 40, hp: 40, atk: 5, critBonus: 2, critChance: 0.15,
        ct: 0, maxCt: 5, od: 0, maxOd: 3, speedDiceSides: 8,
        bountyStacks: 2,            // 賞金：50 x 2 = 100 金幣
        forceSacrificeNext: false,

        getIntent(turnCount, speedDice, self) {
            // 逃亡失敗後最優先；旗標在「執行」時才清除，避免 Break 重新解析意圖時遺失
            const sacrifice = {
            id: 'SACRIFICE_STRIKE', type: 'SPECIAL', selfHpCost: 10, damageFromTargetMaxHpRatio: 0.5,
            desc: '💢 捨身一擊 (自身HP-10，造成目標最大生命值1/2的傷害)'
        };
            if (this.forceSacrificeNext) return sacrifice;

            if (!this.isBreak && this.ct >= this.maxCt) {
                return {
                    id: 'ESCAPE', type: 'SPECIAL', consumeCt: this.maxCt, escapeChance: 0.3,
                    desc: '🏃 逃亡 (消耗全部CT，30%機率脫離戰鬥，失敗則下次必定發動捨身一擊)'
                };
            }
            const pool = [
                this.basicAttack(),
                sacrifice
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'bandit_chief': Object.assign(Object.create(BASE_ENEMY), {
        id: 'bandit_chief',
        name: '👑 山賊首領',
        maxHp: 50, hp: 50, atk: 4, critBonus: 3, critChance: 0.15,
        ct: 0, maxCt: 3, od: 0, maxOd: 5, speedBonus: 2, speedDiceSides: 6,
        untargetableWhileAlliesAlive: ['bandit', 'wanted_criminal'],   // 寨主

        getIntent(turnCount, speedDice, self) {
            if (!this.isBreak && this.ct >= this.maxCt) {
                return {
                    id: 'SUMMON', type: 'SPECIAL', summonIds: ['wanted_criminal', 'bandit'], consumeCt: this.maxCt,
                    desc: '🐕 放狗咬人 (消耗全部CT，召喚通緝犯與山賊)'
                };
            }
            const pool = [
                this.basicAttack(),
                { id: 'SUMMON', type: 'SPECIAL', summonIds: ['bandit'], desc: '📢 召喚小弟 (召喚一個山賊)' }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'fire_brother': Object.assign(Object.create(BASE_ENEMY), {
        id: 'fire_brother',
        name: '🔥 冰火兄弟-火',
        maxHp: 100, hp: 100, atk: 5, critBonus: 3, critChance: 0.15,
        ct: 0, maxCt: 3, od: 0, maxOd: 3, speedDiceSides: 10,
        linkedBreakIds: ['ice_brother'],      // 兄弟同心
        avengeOnDeathOf: ['ice_brother'],     // 復仇
        forceSpecialNext: false,
        fusionPartnerId: 'ice_brother',
        fusionResultId: 'flame_glass',

        getIntent(turnCount, speedDice, self) {
            const normalAttack = this.basicAttack();

            // Break 狀態：僅能一般行動（forceSpecialNext 旗標保留，解除後才用掉）
            if (this.isBreak) return normalAttack;

            // 蓄力後的下一回合：必定發動蓄力外的隨機特殊行動
            if (this.forceSpecialNext) {
                return Phaser.Utils.Array.GetRandom([
                    { id: 'ANNIHILATE_FIST', type: 'SPECIAL', bossSpecial: true, desc: '🔥 湮滅焰拳 (全體爆擊傷害，目標灼燒中則變2倍，並延長灼燒2T)' },
                    { id: 'JET_FLAME', type: 'SPECIAL', bossSpecial: true, desc: '🔥 噴流熾炎 (造成攻擊力傷害並延長灼燒2T，再造成灼燒剩餘回合數的傷害)' }
                ]);
            }

            // CT>=2 時 50% 機率蓄力
            if (this.ct >= 2 && Math.random() < 0.5) {
                return { ...BOSS_CHARGE };
            }

            return Phaser.Utils.Array.GetRandom([
                normalAttack,
                { id: 'FLAME_FIST', type: 'ATTACK', value: this.atk, canCrit: true, statusEffect: { type: 'burn', turns: 5 }, desc: `🔥 炎拳 (造成 ${this.atk} 點傷害並給予5T灼燒)` }
            ]);
        }
    }),

    'ice_brother': Object.assign(Object.create(BASE_ENEMY), {
        id: 'ice_brother',
        name: '🧊 冰火兄弟-冰',
        maxHp: 100, hp: 100, atk: 3, critBonus: 1, critChance: 0.15,
        ct: 0, maxCt: 3, od: 0, maxOd: 4, speedDiceSides: 10,
        linkedBreakIds: ['fire_brother'],
        avengeOnDeathOf: ['fire_brother'],
        forceSpecialNext: false,
        fusionPartnerId: 'fire_brother',
        fusionResultId: 'flame_glass',

        getIntent(turnCount, speedDice, self) {
            const normalAttack = this.basicAttack();

            if (this.isBreak) return normalAttack;

            if (this.forceSpecialNext) {
                return { id: 'ABSOLUTE_FREEZE', type: 'SPECIAL', bossSpecial: true, desc: '🧊 絕對冰結 (單體爆擊傷害，並給予2層冰結)' };
            }

            if (this.ct >= 2 && Math.random() < 0.5) {
                return { ...BOSS_CHARGE };
            }

            return Phaser.Utils.Array.GetRandom([
                normalAttack,
                { id: 'ICE_WALL', type: 'SPECIAL', desc: '🧱 冰壁 (我方全體下次受傷傷害變為0)',
                  effects: ['dodge'], dodgeTo: 'allies',
                  dodgeMsg: (c) => `🧱 ${c.attacker.name} 展開【冰壁】！我方全體下次受到的傷害變為 0！` },
                { id: 'FROSTBITE_CAST', type: 'SPECIAL', desc: '🧊 冰天雪地 (給予敵方5T凍傷)',
                  effects: ['effect'], effectTo: 'hero', effect: [{ id: 'debuff_frostbite', n: 5, mode: 'refresh' }],
                  effectMsg: (c) => `🧊 ${c.attacker.name} 發動【冰天雪地】！${c.target.name} 陷入【凍傷】(5 回合)！` 
                }
            ]);
        }
    }),

    //boss--------------------------------------------------------------

    'flame_glass': FLAME_GLASS_DATA

}