// js/data/enemies/forest.js
import { BASE_ENEMY } from './baseEnemy.js';
import { summonMove, allyMsg } from './sharedMoves.js';


// 黑龍招式（Break 池與常規池共用，避免重複貼同一份宣告）
const BD = {
    claw: () => ({ id: 'CLAW', type: 'ATTACK', value: 3, hits: 2, canCrit: true, effects: ['attack'], desc: '🐾 爪擊 (造成 2 次 3 點傷害)' }),
    charge: () => ({
        id: 'CHARGE', type: 'BUFF', desc: '✨ 蓄力 (獲得 1CT，回復 7 點血量)',
        effects: ['ct', 'heal'], ct: 1, heal: 7,
        openMsg: (c) => `🐉 ${c.attacker.name} 展開【${c.intent.desc || '蓄力'}】，回復 7 點 HP 並累積 1CT！`
    }),
    fly: () => ({
        id: 'FLY', type: 'BUFF', desc: '🦅 飛翔 (進入飛行狀態)',
        effects: ['setFlag'], setFlag: { isFlying: true },
        setFlagMsg: (c) => `🐉 ${c.attacker.name} 振翅升空進入【飛翔】狀態！`
    }),
    // 同時改玩家與自己兩個對象，現有 handler 一次只能一種目標，直接用 run
    pressure: () => ({
        id: 'PRESSURE', type: 'DEBUFF', desc: '😱 威壓 (下次攻擊骰鎖定為1，本回合無法使用主動技)',
        run: (c) => {
            c.target.isPressured = true;
            c.attacker.pressureUsedThisOD = true;
            c.log(`😱 ${c.attacker.name} 發動【威壓】！${c.target.name} 下次攻擊骰鎖定為 1，且本回合無法使用主動技能！`);
        }
    }),
    dive: (ct) => ({ id: 'DIVE', type: 'ATTACK', value: 7 + ct, canCrit: true, effects: ['attack'], desc: `💥 墜擊 (造成 ${7 + ct} 點傷害，解除飛行)` }),
    judgment: (od) => ({ id: 'JUDGMENT', type: 'SPECIAL', value: 5 + od, trueDamage: true, consumeCt: 3, effects: ['attack'], desc: `⚡ 制裁 (造成 ${5 + od} 點真實傷害)` }),
    breath: () => ({ id: 'BREATH', type: 'ATTACK', value: 7, consumeCt: 1, statusEffect: { type: 'poison', turns: 3 }, effects: ['attack'], desc: '☠️ 吐息 (消耗1CT，造成 7 點傷害並附加劇毒3回合)' })
};


const BLACK_DRAGON_DATA = Object.assign(Object.create(BASE_ENEMY), {
    id: 'black_dragon',
    name: '🐉 滅世黑龍',
    maxHp: 100,
    hp: 120,
    atk: 5,
    ct: 0,
    maxCt: 3,
    od: 0,
    maxOd: 10,
    critBonus: 5,
    critChance: 0.15,
    pressureUsedThisOD: false,
    dragonPride: true,               // 常駐被動：龍王的傲氣
    speedDiceSides: 10,

    // 🎯 意圖決策 AI：改用標籤描述招式特性
    getIntent(turnCount, speedDice, self) {
        // Break 狀態：僅能執行一般行動
        if (this.isBreak) {
            return Phaser.Utils.Array.GetRandom([this.basicAttack(), BD.claw(), BD.charge()]);
        }

        // OD 狂暴：首次進入發動威壓
        if (this.isOD && !this.pressureUsedThisOD) return BD.pressure();

        // 飛行中：下回合必定發動墜擊
        if (this.isFlying) return BD.dive(this.ct);

        // CT 滿：發動制裁大招 (無視閃避與格擋的真實傷害)
        if (this.ct >= this.maxCt) return BD.judgment(this.od);

        // 機率發動吐息 (附加劇毒，消耗 1CT)
        if (this.ct >= 1 && Math.random() < 0.25) return BD.breath();

        // 機率起飛
        if (Math.random() < 0.3) return BD.fly();

        // 常規招式池
        return Phaser.Utils.Array.GetRandom([this.basicAttack(), BD.claw(), BD.charge()]);
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

export const FOREST_ENEMIES = {
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

        getIntent(turnCount, speedDice, self) {
            // 1. Break 狀態：僅能執行一般行動
            if (this.isBreak) {
                const normalPool = [
                    this.basicAttack(),
                    { id: 'ROCK_THROW', type: 'ATTACK', value: 1, hits: 2, canCrit: true, effects: ['attack'], desc: '🪨 投石 (造成 2 次 1 點傷害)' }
                ];
                return Phaser.Utils.Array.GetRandom(normalPool);
            }

            // 2. 特殊行動：2CT 時有 50% 概率發動【呼朋引伴】
            if (this.ct >= 2 && Math.random() < 0.5) {
                return summonMove(['goblin'], 2, '📢 呼朋引伴 (消耗 2CT，召喚一隻哥布林加入戰鬥)');
            }

            // 3. 一般行動池
            const generalPool = [
                this.basicAttack(),
                { id: 'ROCK_THROW', type: 'ATTACK', value: 1, hits: 2, canCrit: true, effects: ['attack'], desc: '🪨 投石 (造成 2 次 1 點傷害)' }
            ];
            return Phaser.Utils.Array.GetRandom(generalPool);
        }
    }),

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

        getIntent(turnCount, speedDice, self) {
            // Break 狀態：僅能一般攻擊
            if (this.isBreak) {
                return this.basicAttack();
            }

            // 部落英雄：CT 達 2 時，50% 機率優先發動
            if (this.ct >= 2 && Math.random() < 0.5) {
                return {
                    id: 'TRIBAL_HERO', type: 'ALLY_BUFF', consumeCt: 2,
                    desc: '部落英雄 (自己與1名友軍獲得英勇效果2回合)',
                    effects: ['buff'], buffTo: 'selfAndRandomAlly', buff: { type: 'heroic', turns: 2 },
                    buffMsg: (c) => `🔥 ${c.attacker.name} 發動【${c.intent.desc}】，自己獲得【英勇】效果 2 回合`
                        + (c.targets[1] ? `，並讓 ${c.targets[1].name} 一同獲得【英勇】效果！` : `！（沒有其他友軍可分享效果）`)
                };
            }

            // 一般行動池：普攻 + 3 種薩滿加護，隨機抽取
            const pool = [
                this.basicAttack(),
                { id: 'SHAMAN_GUARD', type: 'ALLY_BUFF', desc: '薩滿加護-守護 (其他友軍獲得4點格擋)',
                  effects: ['block'], blockTo: 'otherAllies', block: 4,
                  blockMsg: allyMsg((c) => `🛡️ ${c.attacker.name} 發動【${c.intent.desc}】，其他友軍全部獲得 4 點格擋！`) },
                { id: 'SHAMAN_CHARGE', type: 'ALLY_BUFF', desc: '薩滿加護-衝鋒 (其他友軍獲得衝鋒效果2回合)',
                  effects: ['buff'], buffTo: 'otherAllies', buff: { type: 'charge', turns: 2 },
                  buffMsg: allyMsg((c) => `⚡ ${c.attacker.name} 發動【${c.intent.desc}】，其他友軍獲得【衝鋒】效果 2 回合！`) },
                { id: 'SHAMAN_HOLY', type: 'ALLY_BUFF', desc: '薩滿加護-聖光 (友軍全體回復3點HP)',
                  effects: ['heal', 'log'], healTo: 'allies', heal: 3,
                  logMsg: (c) => `✨ ${c.attacker.name} 發動【${c.intent.desc}】，友軍全體回復 3 點HP！` }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),
    
    //boss--------------------------------------------------------------

    'black_dragon': BLACK_DRAGON_DATA,

};