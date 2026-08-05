// 通用傷害計算 Safe Helper
function dealDamage(attacker, target, log) {
    const safeLog = typeof log === 'function' ? log : console.log;

    // 1. 檢查閃避
    if (target.dodgeCount && target.dodgeCount > 0) {
        target.dodgeCount -= 1;
        safeLog(`🌀 ${target.name} 展現敏捷，成功閃避了 ${attacker.name} 的攻擊！(剩餘閃避: ${target.dodgeCount})`);
        return;
    }

    // 2. 正常傷害與格擋結算
    let rawDmg = attacker.atk || 4;
    let actualDmg = Math.max(0, rawDmg - (target.block || 0));
    target.block = Math.max(0, (target.block || 0) - rawDmg);
    target.hp = Math.max(0, target.hp - actualDmg);
    
    safeLog(`⚔️ ${attacker.name} 對 ${target.name} 造成 ${actualDmg} 點傷害！`);
}

// 敵人基礎配置資料庫
// js/data/enemyData.js

// 🟢 1. 基礎敵人範本 (提供預設行動與 UI 狀態解析)
// js/data/enemyData.js
import { CombatSystem } from '../systems/CombatSystem.js';

// 🟢 1. 通用敵人基礎結構 (繼承範本)
const BASE_ENEMY = {
    id: '', name: '', hp: 10, maxHp: 10, atk: 3, block: 0,
    armorHits: 0, armorMax: 0, speedDice: 0, currentIntent: null,
    
    // 通用資源與狀態 (所有怪物共有)
    ct: 0, maxCt: 0,
    od: 0, maxOd: 0,
    isFlying: false, isOD: false, isBreak: false,

    // 通用 UI 狀態描述 (自動輸出 CT / OD / 狀態，不需特殊判定)
    getStatusLine() {
        const parts = [];
        if (this.maxCt > 0) parts.push(`CT: ${this.ct}/${this.maxCt}`);
        if (this.maxOd > 0) parts.push(`OD: ${this.od}/${this.maxOd}`);
        
        const tags = [];
        if (this.isFlying) tags.push('🦅[飛行]');
        if (this.isOD) tags.push('🔥[OD狂暴]');
        if (this.isBreak) tags.push('💫[Break癱瘓]');
        if (tags.length > 0) parts.push(`狀態: ${tags.join(' ')}`);

        return parts.length > 0 ? `\n  ${parts.join(' | ')}` : '';
    },

    // 預設行動呼叫：精準對接你寫好的 CombatSystem.applyDamageToTarget
    // 注意：BattleScene 是用 enemy.executeAction(enemy, intent, hero, CombatSystem, log, enemies) 呼叫的，
    // 參數順序必須跟這裡對齊，否則 intent/target/log 會全部對錯位置。
    executeAction(self, intent, target, combatSys, log, enemies) {
        const safeLog = typeof log === 'function' ? log : console.log;
        const cs = combatSys || CombatSystem;
        const rawDmg = intent?.value || this.atk || 3;

        if (cs && typeof cs.applyDamageToTarget === 'function') {
            cs.applyDamageToTarget(target, rawDmg, safeLog);
        } else {
            // 保底傷害扣減
            target.hp = Math.max(0, target.hp - rawDmg);
            safeLog(`⚔️ ${this.name} 對 ${target.name} 造成 ${rawDmg} 點傷害！`);
        }
    }
};

// 🟢 2. 黑龍 Boss 資料結構 (依 Boss：黑龍 設計文件實作)
export const BLACK_DRAGON_DATA = {
    ...BASE_ENEMY,
    id: 'black_dragon',
    name: '🐉 滅世黑龍',
    maxHp: 100,
    hp: 100,
    atk: 5,
    armorMax: 5,
    ct: 0,
    maxCt: 3,
    od: 0,
    maxOd: 10,
    critBonus: 5,     // 爆擊增益＝爆擊時的傷害加成
    critChance: 0.15, // 基礎爆擊機率15%（設計文件預設值）
    pressureUsedThisOD: false, // 威壓只在每次進入OD時發動一次，不是OD期間每回合都發動
    speedDiceSides: 10, // 設計文件：速度骰為10面骰（其他敵人預設6面）
    // 爆擊：一般攻擊型招式（普攻/爪擊/墜擊）才會判定爆擊；制裁/吐息傷害是文件寫死的公式，不額外套用爆擊。
    rollCrit() {
        if (this.isOD) return true; // OD狀態：自身所有攻擊必定爆擊
        return Math.random() < (this.critChance || 0.15);
    },

    // 黑龍專屬意圖決策 AI
    getIntent(turnCount, speedDice, self) {
        // Break：僅能執行一般行動 (普攻/爪擊/蓄力)
        if (this.isBreak) {
            const generalPool = [
                { id: 'ATTACK', type: 'ATTACK', value: this.atk, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
                { id: 'CLAW', type: 'ATTACK', desc: '🐾 爪擊 (造成 2 次 3 點傷害)' },
                { id: 'CHARGE', type: 'BUFF', desc: '✨ 蓄力 (獲得 1CT，回復 7 點血量)' }
            ];
            return Phaser.Utils.Array.GetRandom(generalPool);
        }

        // OD：進入OD後只發動一次威壓，之後改走一般行動判定（但仍保持isOD直到被打到耗盡）
        if (this.isOD && !this.pressureUsedThisOD) {
            return { id: 'PRESSURE', type: 'DEBUFF', desc: '😱 威壓 (下次攻擊骰鎖定為1，本回合無法使用主動技)' };
        }

        // 飛行中：下回合必發墜擊，解除飛行
        if (this.isFlying) {
            return { id: 'DIVE', type: 'ATTACK', desc: `💥 墜擊 (造成 ${7 + this.ct} 點傷害，解除飛行)` };
        }

        // CT滿：必發制裁
        if (this.ct >= this.maxCt) {
            return { id: 'JUDGMENT', type: 'SPECIAL', desc: `⚡ 制裁 (造成 ${5 + this.od} 點無法閃避格擋的真實傷害)` };
        }

        // 有CT可消耗時，機率發動吐息 (數值：25%機率，設計文件未標明機率，暫定，可調整)
        if (this.ct >= 1 && Math.random() < 0.25) {
            return { id: 'BREATH', type: 'SPECIAL', desc: '☠️ 吐息 (消耗1CT，造成 7 點傷害並附加劇毒3回合)' };
        }

        // 機率起飛 (30%，沿用原本數值)
        if (Math.random() < 0.3) {
            return { id: 'FLY', type: 'BUFF', desc: '🦅 飛翔 (進入飛行狀態)' };
        }

        const pool = [
            { id: 'ATTACK', type: 'ATTACK', value: this.atk, desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)` },
            { id: 'CLAW', type: 'ATTACK', desc: '🐾 爪擊 (造成 2 次 3 點傷害)' },
            { id: 'CHARGE', type: 'BUFF', desc: '✨ 蓄力 (獲得 1CT，回復 7 點血量)' }
        ];
        return Phaser.Utils.Array.GetRandom(pool);
    },

    // 黑龍專屬行動結算
    executeAction(self, intent, target, combatSys, log, enemies) {
        const safeLog = typeof log === 'function' ? log : console.log;
        const cs = combatSys || CombatSystem;

        switch (intent.id) {
            case 'CHARGE': {
                this.ct = Math.min(this.maxCt, this.ct + 1);
                this.hp = Math.min(this.maxHp, this.hp + 7);
                safeLog(`🐉 ${this.name} 展開【蓄力】，回復 7 點 HP 並累積 1CT！`);
                return;
            }
            case 'FLY': {
                this.isFlying = true;
                safeLog(`🐉 ${this.name} 振翅升空進入【飛翔】狀態！`);
                return;
            }
            case 'DIVE': {
                let diveDmg = 7 + this.ct;
                if (this.rollCrit()) {
                    diveDmg += this.critBonus;
                    safeLog(`💥 【墜擊】爆擊！`);
                }
                cs.applyDamageToTarget(target, diveDmg, safeLog);
                this.isFlying = false;
                safeLog(`🐉 ${this.name} 結束【墜擊】，解除飛行狀態！`);
                return;
            }
            case 'BREATH': {
                this.ct = Math.max(0, this.ct - 1);
                cs.applyDamageToTarget(target, 7, safeLog);
                target.poisonTurns = 3;
                safeLog(`☠️ ${this.name} 噴出毒息，${target.name} 中【劇毒】(持續 3 回合)！`);
                return;
            }
            case 'JUDGMENT': {
                const trueDmg = 5 + this.od;
                target.hp = Math.max(0, target.hp - trueDmg); // 無法閃避與格擋，跳過 CombatSystem
                this.ct = Math.max(0, this.ct - 3); // 消耗3CT
                safeLog(`⚡ ${this.name} 發動【制裁】，造成 ${trueDmg} 點無法閃避格擋的真實傷害！`);
                return;
            }
            case 'PRESSURE': {
                target.isPressured = true;
                this.pressureUsedThisOD = true;
                safeLog(`😱 ${this.name} 發動【威壓】！${target.name} 下次攻擊骰鎖定為 1，且本回合無法使用主動技能！`);
                return;
            }
            case 'CLAW': {
                safeLog(`🐾 ${this.name} 發動【爪擊】，連續攻擊 2 次！`);
                for (let i = 0; i < 2; i++) {
                    if (target.hp <= 0) break;
                    let clawDmg = 3;
                    if (this.rollCrit()) {
                        clawDmg += this.critBonus;
                        safeLog(`💥 爪擊第 ${i + 1} 擊爆擊！`);
                    }
                    cs.applyDamageToTarget(target, clawDmg, safeLog);
                }
                return;
            }
            default: {
                // 普攻與其他未特別處理的招式
                let rawDmg = intent.value || this.atk;
                if (this.rollCrit()) {
                    rawDmg += this.critBonus;
                    safeLog(`💥 ${this.name} 攻擊爆擊！`);
                }
                cs.applyDamageToTarget(target, rawDmg, safeLog);
            }
        }
    },

    // OD/Break 機制：每次受到攻擊觸發 (由 CombatSystem.applyDamageToTarget 呼叫)
    onTakeDamage() {
        if (this.isBreak) return; // Break狀態下不累積OD
        if (this.isOD) {
            this.od = Math.max(0, this.od - 1);
            if (this.od <= 0) {
                this.isOD = false;
                this.isBreak = true;
                this.pressureUsedThisOD = false; // 離開OD，重置旗標
            }
        } else {
            this.od = Math.min(this.maxOd, this.od + 1);
            if (this.od >= this.maxOd) {
                this.isOD = true;
                this.pressureUsedThisOD = false; // 剛進入新的OD階段，威壓可以再發動一次
            }
        }
    },

    // CT 機制：每回合結束自動+1；Break狀態下CT滿了要消耗3CT解除Break
    onTurnEnd() {
        this.ct = Math.min(this.maxCt, this.ct + 1);
        if (this.isBreak && this.ct >= this.maxCt) {
            this.ct -= 3;
            this.isBreak = false;
        }
    }
};

// 🟢 3. 一般怪物資料庫
export const ENEMY_DATABASE = {
    'slime': {
        ...BASE_ENEMY,
        id: 'slime',
        name: '綠色軟泥怪',
        maxHp: 20, hp: 20, atk: 4, armorMax: 3,
        getIntent: () => ({ id: 'ATTACK', value: 4, desc: '⚔️ 撞擊 (造成 4 點傷害)' })
    }
};

// 🟢 4. 乾淨工廠函式
export function createEnemyInstance(enemyId) {
    const config = enemyId === 'black_dragon' ? BLACK_DRAGON_DATA : ENEMY_DATABASE[enemyId];
    const instance = Object.assign(Object.create(BASE_ENEMY), config, { hp: config.maxHp, block: 0, armorHits: 0 });

    // 開發期契約檢查：抓出簽名對不上的問題，而不是等到戰鬥中默默壞掉
    if (instance.getIntent.length !== 3) {
        console.error(`⚠️ [${enemyId}] getIntent 參數數量不對，應為3個 (turnCount, speedDice, self)`);
    }
    if (instance.executeAction.length !== 6) {
        console.error(`⚠️ [${enemyId}] executeAction 參數數量不對，應為6個`);
    }
    return instance;

    if (!config) {
        console.error(`⚠️ 找不到敵人配置 ID: ${enemyId}`);
        return null;
    }

    // 將 BASE_ENEMY 作為原型，完整複製數值與方法
    return Object.assign(Object.create(BASE_ENEMY), config, {
        hp: config.maxHp,
        block: 0,
        armorHits: 0
    });
}