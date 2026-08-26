import { EffectEngine } from '../systems/EffectEngine.js';
import { HERO_CARD_DEFS } from '../characters/hero/heroCards.js';
import { SWORDSMAN_CARD_DEFS } from '../characters/swordsman/swordsmanCards.js';
// js/data/rewardPoolData.js
//
// 🟢 獎勵池資料層（第 1 階段：只定義資料結構與盡量單純的 apply()，
//    複雜機制（需要引擎擴充的部分）先留 TODO，於後續階段實作）
//
// 對應規格來源：獎池一覽.txt
//
// 抽獎規則（將在 RewardSystem 重構時使用，這裡先不實作）：
//   - 每次獎勵畫面固定出現 3 組「不同類別」的獎勵
//   - 數值類（STAT）出現時，是「隨機 2 個」組成一組
//   - 各類別出現機率相同
//   - 玩家可免費刷新一次，之後每次刷新需支付 (20 + 5 * 已刷新次數) 金幣
//   - 收集類（COLLECTION）不會出現在獎勵池中，達成條件時自動觸發

// ------------------------------------------------------------------
// 工具函式：隨機整數（含頭尾）
// ------------------------------------------------------------------
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ====================================================================
// 1. 數值類獎勵 (STAT) —— 皆可疊加
//    抽取時規則：一組會隨機抽出 2 個「不同的」數值項目一起出現
//    weight：類別內的相對出現機率（預設 1，攻擊次數為其他的一半 = 0.5）
// ====================================================================
export const STAT_POOL = [
    {
        id: 'stat_atk_up',
        name: '攻擊力UP',
        weight: 1,
        roll: () => randInt(1, 3),
        desc: (amount) => `基礎攻擊力 +${amount} (可永久疊加)`,
        apply: (scene, amount) => {
            scene.hero.atk += amount;
            scene.appendLog(`✨ 基礎攻擊力 +${amount}！現攻擊力: ${scene.hero.atk}`, 'system');
        }
    },
    {
        id: 'stat_hp_up',
        name: '血量UP',
        weight: 1,
        roll: () => randInt(5, 10),
        desc: (amount) => `最大 HP +${amount}，並回復 ${amount} 點HP (可永久疊加)`,
        apply: (scene, amount) => {
            scene.hero.maxHp += amount;
            scene.hero.hp = Math.min(scene.hero.maxHp, scene.hero.hp + amount);
            scene.appendLog(`✨ 最大 HP +${amount}！現上限: ${scene.hero.maxHp}`, 'system');
        }
    },
    {
        id: 'stat_crit_up',
        name: '爆擊增益UP',
        weight: 1,
        roll: () => randInt(1, 3),
        desc: (amount) => `爆擊增益 +${amount} (可永久疊加)`,
        apply: (scene, amount) => {
            scene.hero.critBonus += amount;
            scene.appendLog(`✨ 爆擊增益 +${amount}！現增益: +${scene.hero.critBonus}`, 'system');
        }
    },
    {
        id: 'stat_mana_up',
        name: '魔力上限UP',
        weight: 1,
        roll: () => randInt(1, 2),
        desc: (amount) => `魔力上限 +${amount} (可永久疊加)`,
        apply: (scene, amount) => {
            scene.hero.maxMana += amount;
            scene.appendLog(`✨ 魔力上限 +${amount}！現上限: ${scene.hero.maxMana}`, 'system');
        }
    },
    {
        id: 'stat_deck_limit_up',
        // 🟢 確認語意：這是「玩家整副牌組（originalDeck）能持有的卡片數量上限」。
        //    起始上限值本身尚未在 heroData.js 定義，需在第 3 階段補上
        //    hero.deckCapacity 初始值，並在牌組已達上限時，CARD 類獎勵改成
        //    「選一張現有卡片刪除來替換」的流程（RewardSystem 需要新增此互動）。
        //    這裡的獎勵只負責把上限往上加，讓玩家有更多容納空間。
        name: '牌組上限UP',
        weight: 1,
        roll: () => randInt(1, 3),
        desc: (amount) => `牌組上限 +${amount} (可永久疊加)`,
        apply: (scene, amount) => {
            scene.hero.deckCapacity = (scene.hero.deckCapacity || 0) + amount;
            scene.appendLog(`✨ 牌組上限 +${amount}！現上限: ${scene.hero.deckCapacity}`, 'system');
        }
    },
    {
        id: 'stat_heal_ratio_up',
        name: '回復量UP',
        weight: 1,
        roll: () => 1,
        desc: () => `回復量 +1 (可永久疊加)`,
        apply: (scene) => {
            scene.hero.healRatio += 1;
            scene.appendLog(`✨ 回復量 +1！現回復量: x${scene.hero.healRatio}`, 'system');
        }
    },
    {
        id: 'stat_gold_gain_up',
        name: '金幣獲得量UP',
        weight: 1,
        roll: () => randInt(10, 30), // 百分比
        desc: (amount) => `金幣獲得量 +${amount}% (可永久疊加)`,
        apply: (scene, amount) => {
            scene.hero.goldGainBonus = (scene.hero.goldGainBonus || 0) + amount;
            scene.appendLog(`✨ 金幣獲得量 +${amount}%！(現總加成: +${scene.hero.goldGainBonus}%)`, 'system');
        }
    },
    {
        id: 'stat_armor_up',
        name: '護甲值UP',
        weight: 1,
        roll: () => 1,
        desc: () => `護甲值 +1 (可永久疊加)`,
        apply: (scene) => {
            scene.hero.armorMax += 1;
            scene.appendLog(`✨ 護甲值 +1！現護甲上限: ${scene.hero.armorMax}`, 'system');
        }
    },
    {
        id: 'stat_speed_up',
        name: '速度加值UP',
        weight: 1,
        roll: () => 1,
        desc: () => `速度加值 +1 (可永久疊加)`,
        apply: (scene) => {
            scene.hero.speedBonus += 1;
            scene.appendLog(`✨ 速度加值 +1！現速度加值: +${scene.hero.speedBonus}`, 'system');
        }
    },
    {
        id: 'stat_atk_count_up',
        name: '攻擊次數UP',
        weight: 0.5, // 🟢 出現機率為其他數值類獎勵的一半
        roll: () => 1,
        desc: () => `攻擊次數 +1 (可永久疊加)`,
        apply: (scene) => {
            scene.hero.atkCount += 1;
            scene.appendLog(`✨ 攻擊次數 +1！現每次攻擊骰行動次數: ${scene.hero.atkCount}`, 'system');
        }
    }
];

// ====================================================================
// 2. 加護類獎勵 (BLESSING) —— 皆可疊加
//    ⚠️ 這裡的 apply() 只負責「設定/累加旗標」到 hero 身上。
//    真正在戰鬥開始 / 每回合開始時觸發判定的邏輯，留待第 3 階段
//    串接進 TurnSystem.js（startTurn）與 BattleScene（戰鬥開局）。
// ====================================================================
export const BLESSING_POOL = [
    {
        id: 'blessing_stigma_sovereign',
        name: '聖痕君臨',
        weight: 1,
        roll: () => 1,
        desc: () => `每回合開始時給予敵人 1 層聖痕 (可無限疊加)`,
        // 🟢 沿用現有的 hero.stigmaPerTurn 欄位（TurnSystem.js 已經有讀取邏輯）
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_stigma_sovereign', 1);
            scene.appendLog(`✨ 獲得加護：每回合自動施加 ${entry.stacks} 層聖痕！`, 'system');
        }
    },
    {
        id: 'blessing_guardian',
        name: '守護',
        weight: 1,
        roll: () => 1,
        desc: () => `戰鬥開始時，血量每有 5 點就獲得 1 點格擋 (可疊加層數)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_guardian', 1);
            scene.appendLog(`✨ 獲得加護【守護】！(層數: ${entry.stacks})`, 'system');
        }
    },
    {
        id: 'blessing_desperation',
        name: '背水',
        weight: 1,
        roll: () => 1,
        desc: () => `每回合開始時，血量每比初始血量少 3 點，攻擊力/速度加值/爆擊增益 皆+2 (可疊加層數)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_desperation', 1);
            scene.appendLog(`✨ 獲得加護【背水】！(層數: ${entry.stacks})`, 'system');
        }
    },
    {
        id: 'blessing_tyrant',
        name: '暴君',
        weight: 1,
        roll: () => 1,
        desc: () => `每回合開始時，血量-3點，魔力+1 (可疊加層數)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_tyrant', 1);
            scene.appendLog(`✨ 獲得加護【暴君】！(層數: ${entry.stacks})`, 'system');
        }
    },
    {
        id: 'blessing_fortify',
        name: '堅守',
        weight: 1,
        roll: () => 1,
        desc: () => `每回合開始時，血量每比初始血量少 3 點，護甲值+2 (可疊加層數)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_fortify', 1);
            scene.appendLog(`✨ 獲得加護【堅守】！(層數: ${entry.stacks})`, 'system');
        }
    },
    {
        id: 'blessing_all_out',
        name: '渾身',
        weight: 1,
        roll: () => 1,
        desc: () => `戰鬥開始時，每有 10 點血量，攻擊力與爆擊增益 +1 (可疊加層數)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_all_out', 1);
            scene.appendLog(`✨ 獲得加護【渾身】！(層數: ${entry.stacks})`, 'system');
        }
    },
    {
        id: 'blessing_healing',
        name: '治癒',
        weight: 1,
        roll: () => 1,
        desc: () => `每次回血都多回復 2 點 (不受回復量加成影響，可疊加層數)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'blessing_healing', 1);
            scene.appendLog(`✨ 獲得加護【治癒】！(額外固定回復: +${entry.stacks * 2})`, 'system');
        }
    }
];

// ====================================================================
// 3. 卡片類獎勵 (CARD) —— 與起始牌組 (HERO_DECK) 分開的獨立卡池
//    ⚠️ apply() 只有簡單卡片先寫實作，複雜卡片（需要引擎擴充）先標記 TODO，
//    於第 5 階段補上，並在 executeAttackPhaseAction / CombatSystem 等處掛勾。
// ====================================================================
const BASE_REWARD_CARDS = [
    {
        id: 'card_gold_bomb',theme: '富豪',
        name: '大撒幣',
        cost: 3,
        scope: 'SELF',   // 🟢 Stage 5-3：改為 SELF，不需要玩家選目標，引擎內部隨機挑
        tags: [],
        desc: '消耗金幣，每 50 塊對隨機單體造成一次 5 點傷害 (最多消耗 500 金幣)',
        implemented: true,   // 🟢 Stage 5-3
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            const availableGold = Math.min(hero.gold || 0, 500);
            const spend = Math.floor(availableGold / 50) * 50;

            if (spend <= 0) {
                log(`💸 效果發動：金幣不足 50，大撒幣沒有任何效果...`);
                return;
            }

            hero.gold -= spend;
            const hitCount = spend / 50;
            log(`💰 效果發動：花費 ${spend} 金幣，對隨機目標發動 ${hitCount} 次 5 點傷害！`);

            for (let i = 0; i < hitCount; i++) {
                const aliveEnemies = scene.enemies.filter(e => e.hp > 0);
                if (aliveEnemies.length === 0) break;
                const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
                combatSys.applyDamageToTarget(target, 5, log);
            }
        }
    },
    {
        id: 'card_treasure',theme: '富豪',
        name: '祕寶',
        cost: 0,
        scope: 'SELF',
        tags: [],
        desc: '獲得 50 金幣，抽 1 張牌',
        implemented: true,
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.gold = (hero.gold || 0) + 50;
            deckSys.drawCard();
            log(`💰 效果發動：獲得 50 金幣，抽 1 張牌`);
        }
    },
    {
        id: 'card_prayer',theme: '主教',
        name: '祈禱',
        cost: 1,
        scope: 'SELF',
        tags: [],
        desc: '回復量 +1，回復 2 點HP',
        implemented: true,
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.battleHealBonus += 1;
            combatSys.applyHealToHero(hero, 2, log);
            log(`🙏 效果發動：回復量 +1 (戰鬥內)`);
        }
    },
    {
        id: 'card_double_dice',theme: '特殊',
        name: '雙骰',
        cost: 3,
        scope: 'SELF',
        tags: [],
        desc: '下次的攻擊骰將骰 2 次',
        implemented: true,
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.doubleNextAction = true;
            log(`🎲 效果發動：下次攻擊骰行動將【執行 2 次】`);
        }
    },
    {
        id: 'card_holy_guidance',theme: '聖騎士',
        name: '神聖的導引',
        cost: 0,
        scope: 'SELF',
        tags: [],
        desc: '抽 1 張具「聖痕」詞條的卡片，給予敵方一層聖痕',
        implemented: true,   // 🟢 Stage 5-4
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            const drawn = deckSys.drawCardByTag('聖痕');
            if (drawn) {
                log(`📖 效果發動：抽到具「聖痕」詞條的卡片 [${drawn.name}]！`);
            } else {
                log(`📖 效果發動：牌堆與棄牌堆中已無「聖痕」詞條卡片，抽取落空`);
            }

            hero.stigma += 1;
            log(`🔱 敵方附加 1 層聖痕 (現為 ${hero.stigma} 層)`);
        }
    },
    {
        id: 'card_sweet_rain',theme: '聖騎士',
        name: '甘霖',
        cost: 2,
        scope: 'SELF',
        tags: ['聖痕'],
        desc: '回復 (1+聖痕層數)，超出血量上限的回血轉變成格擋 (每超出2就轉變成1點格擋)',
        implemented: true,   // 🟢 Stage 5-2
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            const baseHeal = 1 + (hero.stigma || 0);
            const actualHeal = baseHeal * (hero.healRatio + hero.battleHealBonus) + EffectEngine.getHealBonus(hero);
            const hpBefore = hero.hp;
            const overflow = Math.max(0, (hpBefore + actualHeal) - hero.maxHp);

            hero.hp = Math.min(hero.maxHp, hpBefore + actualHeal);
            log(`💧 效果發動：回復 ${actualHeal} 點 HP (基礎回復 ${baseHeal}，聖痕層數 ${hero.stigma || 0})`);

            if (overflow > 0) {
                const bonusBlock = Math.floor(overflow / 2);
                if (bonusBlock > 0) {
                    hero.block += bonusBlock;
                    log(`🛡️ 溢出的 ${overflow} 點回血轉換為 ${bonusBlock} 點格擋！`);
                }
            }
        }
    },
    {
        id: 'card_divine_punishment',theme: '聖騎士',
        name: '天罰',
        cost: 5,
        scope: 'ALL_ENEMIES',
        tags: ['聖痕'],
        desc: '對敵方全體造成 (5+聖痕層數) 傷害 (每 5 層聖痕，此卡費用 -1)',
        implemented: true,   // 🟢 Stage 5-2
        getCost: (hero) => Math.max(0, 5 - Math.floor((hero.stigma || 0) / 5)),
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            const dmg = 5 + (hero.stigma || 0);
            const aliveEnemies = scene.enemies.filter(e => e.hp > 0);
            log(`⚡ 效果發動：對敵方全體造成 ${dmg} 點傷害！`);
            aliveEnemies.forEach(en => combatSys.applyDamageToTarget(en, dmg, log));
        }
    },
    {
        id: 'card_counterfeit',theme: '特殊',
        name: '贗品',
        cost: 2,
        scope: 'SELF',
        tags: [],
        desc: '此卡效果變成與上一張打出卡片相同',
        implemented: true,
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            const source = hero.lastPlayedCard;

            if (!source) {
                log(`🎭 效果發動：本場尚未打出過其他卡片，贗品沒有可複製的對象`);
                return;
            }

            if (source.name === '贗品') {   // 🔧 修正：改用名稱比對，避免 id 型別不一致（數字 vs 字串）導致報錯
                log(`🎭 效果發動：上一張打出的也是【贗品】，效果無法重複複製`);
                return;
            }

            if (!source.onPlay) {
                log(`🎭 效果發動：嘗試複製 [${source.name}]，但該卡沒有可觸發的效果`);
                return;
            }

            log(`🎭 效果發動：複製上一張卡片 [${source.name}] 的效果！`);

            let effectiveTarget = enemy;
            if (!effectiveTarget && source.scope === 'SINGLE_ENEMY') {
                effectiveTarget = scene.enemies.find(e => e.hp > 0) || null;
            }

            source.onPlay(hero, effectiveTarget, combatSys, deckSys, log, scene);
        }
    },
    {
        id: 'card_berserk',theme: '惡魔交易',
        name: '暴走',
        cost: 1,
        scope: 'SELF',
        tags: [],
        desc: '給予自己 10 點傷害，攻擊力與爆擊增益 +4 (戰鬥內臨時加成)',
        implemented: true,
        // 🟢 確認：比照 battleCritBonus 的模式，做成「戰鬥內臨時加成」，
        //    戰鬥結束後由 CombatSystem.resetBattleScopedStats() 一併清除。
        //    ⚠️ 需要在第3階段於 heroData.js 新增 hero.battleAtkBonus 欄位（預設0），
        //    並讓所有讀取 hero.atk 的地方（diceSkills 1/3/4/6 等）改成 hero.atk + hero.battleAtkBonus，
        //    同時把 battleAtkBonus 加進 CombatSystem.resetBattleScopedStats() 的清空清單。
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.hp = Math.max(1, hero.hp - 10);
            hero.battleCritBonus += 4;
            hero.battleAtkBonus = (hero.battleAtkBonus || 0) + 4;
            log(`💢 效果發動：自傷 10 點，攻擊力與爆擊增益 +4 (本場戰鬥內)`);
        }
    },
    {
        id: 'card_dragon_slash',theme: '特殊',
        name: '獵龍斬擊',
        cost: 2,
        scope: 'SINGLE_ENEMY',
        tags: [],
        desc: '對名稱帶有「龍」的敵人單體，造成傷害=CT值，重複次數=(OD值-CT值)，至少1次',
        implemented: true,   // 🟢 Stage 5-5
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            if (!enemy || !enemy.name || !enemy.name.includes('龍')) {
                log(`🐲 效果發動：目標並非「龍」屬性敵人，效果落空`);
                return;
            }

            const ct = enemy.ct || 0;
            const od = enemy.od || 0;
            const hits = Math.max(1, od - ct);   // 🟢 至少1次
            const dmgPerHit = ct;

            if (dmgPerHit <= 0) {
                log(`🐲 效果發動：${enemy.name} 當前 CT 為 0，無法造成傷害`);
                return;
            }

            log(`🐲 效果發動：對 ${enemy.name} 造成 ${dmgPerHit} 點傷害，共 ${hits} 次！`);
            for (let i = 0; i < hits; i++) {
                if (enemy.hp <= 0) break;
                combatSys.applyDamageToTarget(enemy, dmgPerHit, log);
            }
        }
    },
    {
        id: 'card_goblin_slayer',theme: '特殊',
        name: '哥布林殺手',
        cost: 5,
        scope: 'SELF',   // 🟢 Stage 5-5：改為 SELF，效果是全場掃描而非對單一目標結算
        tags: [],
        desc: '使所有名稱帶有「哥布林」的敵人死亡',
        implemented: true,   // 🟢 Stage 5-5
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            const targets = scene.enemies.filter(e => e.hp > 0 && e.name && e.name.includes('哥布林'));

            if (targets.length === 0) {
                log(`💀 效果發動：場上沒有「哥布林」屬性的敵人，效果落空`);
                return;
            }

            targets.forEach(e => {
                e.hp = 0;
            });
            log(`💀 效果發動：${targets.map(e => e.name).join('、')} 應聲倒地！`);
        }
    },
    {
        id: 'card_shield_counter',theme: '技巧',
        name: '盾反',
        cost: 1,
        scope: 'SELF',
        tags: [],
        desc: '獲得格擋 5、盾反效果 2 回合 (期間格擋下來的傷害會等量隨機對單體反擊)',
        implemented: true,   // 🟢 Stage 5-6
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.block += 5;
            const entry = EffectEngine.addStacks(hero, 'shield_counter', 2);
            log(`🛡️ 效果發動：獲得 5 點格擋，並取得【盾反】效果 (剩餘 ${entry.stacks} 回合)！`);
        }
    },
];

export const REWARD_CARD_POOL = [
    ...BASE_REWARD_CARDS,
    ...HERO_CARD_DEFS.filter(c => c.theme),
    ...SWORDSMAN_CARD_DEFS.filter(c => c.theme)
];

// 供未來選池 UI 使用的主題顯示名稱對照表
export const CARD_THEMES = {
    '聖騎士': '⚜️ 聖騎士',
    '富豪': '💰 富豪',
    '戰技': '⚔️ 戰技',
    '惡魔交易': '😈 惡魔交易',
    '主教': '🙏 主教',
    '特殊': '✨ 特殊'
};

// ====================================================================
// 4. 骰子類獎勵 (DICE) —— 皆可疊加
//    ⚠️ apply() 只設定「本場戰鬥可用次數」的累加旗標，
//    實際在 BattleScene 提供重骰按鈕/邏輯，留待第 4 階段實作。
// ====================================================================
export const DICE_POOL = [
    {
        id: 'dice_reroll_attack',
        name: '重骰攻擊骰',
        weight: 1,
        roll: () => 1,
        desc: () => `每次戰鬥有 1 次機會重骰攻擊骰 (可疊加次數)`,
        apply: (scene) => {
            const entry = EffectEngine.addCounterMax(scene.hero, 'reroll_attack_dice', 1);
            scene.appendLog(`✨ 獲得【重骰攻擊骰】機會！(每場可用次數: ${entry.max})`, 'system');
        }
    },
    {
        id: 'dice_reroll_speed',
        name: '重骰速度骰',
        weight: 1,
        roll: () => 1,
        desc: () => `每次戰鬥有 1 次機會重骰速度骰 (可疊加次數)`,
        apply: (scene) => {
            const entry = EffectEngine.addCounterMax(scene.hero, 'reroll_speed_dice', 1);
            scene.appendLog(`✨ 獲得【重骰速度骰】機會！(每場可用次數: ${entry.max})`, 'system');
        }
    }
];

// ====================================================================
// 5. 速通類獎勵 (SPEEDRUN)
//    一次性效果 vs 持續性被動，依規格逐項標記 oneTime
// ====================================================================
export const SPEEDRUN_POOL = [
    {
        id: 'speedrun_halve_next_enemy_hp',
        name: '敵陣削弱',
        weight: 1,
        oneTime: true,
        desc: () => `下一次的一般戰鬥，敵人血量減半 (只生效一次)`,
        apply: (scene) => {
            EffectEngine.addStacks(scene.hero, 'speedrun_halve_next_enemy_hp', 1);
            scene.appendLog(`✨ 下一次一般戰鬥的敵人血量將會減半！`, 'system');
        }
    },
    {
        id: 'speedrun_first_strike_bonus',
        name: '先發制人',
        weight: 1,
        oneTime: false,
        desc: () => `每次一般戰鬥的第一次攻擊傷害 +10 (永久被動)`,
        apply: (scene) => {
            const entry = EffectEngine.addStacks(scene.hero, 'speedrun_first_strike_bonus', 1);
            scene.appendLog(`✨ 獲得被動：每場一般戰鬥的第一次攻擊傷害 +${entry.stacks * 10}！`, 'system');
        }
    },
    {
        id: 'speedrun_battle_start_boost',
        name: '戰鬥爆發',
        weight: 1,
        oneTime: true,
        desc: () => `下次戰鬥開始時，魔力額外+3，抽 2 張牌 (只生效一次)`,
        apply: (scene) => {
            EffectEngine.addStacks(scene.hero, 'speedrun_battle_start_boost', 1);
            scene.appendLog(`✨ 下次戰鬥開始時，將額外獲得 3 點魔力並多抽 2 張牌！`, 'system');
        }
    },
    {
        id: 'speedrun_limited_enemies',
        name: '各個擊破',
        weight: 1,
        oneTime: true,
        desc: () => `接下來 2 場一般戰鬥，敵人只會出現一個`,
        apply: (scene) => {
            EffectEngine.addStacks(scene.hero, 'speedrun_limited_enemies', 2);
            scene.appendLog(`✨ 接下來 2 場一般戰鬥，敵人只會出現一個！`, 'system');
        }
    },
    {
        id: 'speedrun_extra_reward_choice',
        name: '機會之門',
        weight: 1,
        oneTime: true,
        desc: () => `下次勝利獎勵可選數量 +1 (只生效一次)`,
        apply: (scene) => {
            EffectEngine.addStacks(scene.hero, 'speedrun_extra_reward_choice', 1);
            scene.appendLog(`✨ 下次獎勵可選數量將 +1！`, 'system');
        }
    }
];

// ====================================================================
// 6. 收集類 (COLLECTION) —— 不會出現在獎勵池中，達成條件時自動觸發
//    以 hero.rewardCounts = { STAT: 0, BLESSING: 0, CARD: 0 } 追蹤累積數量
//    （rewardCounts 的實際累加時機，將在 RewardSystem 重構時，
//      於每次玩家「選擇」了對應類別獎勵後 +1）
// ====================================================================
export const COLLECTION_MILESTONES = [
    {
        id: 'collection_stat_4',
        category: 'STAT',
        threshold: 4,
        name: '數值類收集 x4',
        desc: '(攻擊、爆擊、格擋、魔力、護甲、速度、回復量) 各 +1',
        apply: (scene) => {
            const hero = scene.hero;
            hero.atk += 1;
            hero.critBonus += 1;
            hero.startBlock = (hero.startBlock || 0) + 1; // 🟢 確認：這裡的「格擋」= 回合開始時獲得的格擋值，永久疊加到 startBlock
            hero.maxMana += 1;
            hero.armorMax += 1;
            hero.speedBonus += 1;
            hero.healRatio += 1;
            EffectEngine.addStacks(hero, 'collection_stat_4', 1);
            scene.appendLog(`🏅 [收集達成] 數值類獎勵達 4 個！全數值 +1！`, 'system');
        }
    },
    {
        id: 'collection_stat_6',
        category: 'STAT',
        threshold: 6,
        name: '數值類收集 x6',
        desc: '(攻擊、爆擊、格擋、魔力、護甲、速度、回復量) 各 +1',
        apply: (scene) => {
            const hero = scene.hero;
            hero.atk += 1;
            hero.critBonus += 1;
            hero.startBlock = (hero.startBlock || 0) + 1;
            hero.maxMana += 1;
            hero.armorMax += 1;
            hero.speedBonus += 1;
            hero.healRatio += 1;
            EffectEngine.addStacks(hero, 'collection_stat_6', 1);
            scene.appendLog(`🏅 [收集達成] 數值類獎勵達 6 個！全數值再 +1！`, 'system');
        }
    },
    {
        id: 'collection_blessing_4',
        category: 'BLESSING',
        threshold: 4,
        name: '加護類收集 x4',
        desc: '全加護層數 +1',
        apply: (scene) => {
            ['blessing_guardian', 'blessing_desperation', 'blessing_tyrant', 'blessing_fortify', 'blessing_all_out']
                .forEach(id => EffectEngine.addStacks(scene.hero, id, 1));
            EffectEngine.addStacks(scene.hero, 'collection_blessing_4', 1);
            scene.appendLog(`🏅 [收集達成] 加護類獎勵達 4 個！全加護層數 +1！`, 'system');
        }
    },
    {
        id: 'collection_card_2',
        category: 'CARD',
        threshold: 2,
        name: '卡片類收集 x2',
        desc: '戰鬥開始時，第一張打出的卡片變 0 費',
        apply: (scene) => {
            scene.hero.firstCardFreeEachBattle = true; // TODO：第5階段串接到 BattleScene 的出牌邏輯
            EffectEngine.addStacks(scene.hero, 'collection_card_2', 1);
            scene.appendLog(`🏅 [收集達成] 卡片類獎勵達 2 個！戰鬥開始時第一張卡片變 0 費！`, 'system');
        }
    }
];

// ====================================================================
// 統一匯出：供 RewardSystem 使用（第 2 階段開始串接）
// ====================================================================
export const REWARD_POOL_DATA = {
    STAT: STAT_POOL,
    BLESSING: BLESSING_POOL,
    CARD: REWARD_CARD_POOL,
    DICE: DICE_POOL,
    SPEEDRUN: SPEEDRUN_POOL
};

export const REWARD_CATEGORY_NAMES = {
    STAT: '📊 數值',
    BLESSING: '🔱 加護',
    CARD: '🎴 卡片',
    DICE: '🎲 骰子',
    SPEEDRUN: '⚡ 速通'
};