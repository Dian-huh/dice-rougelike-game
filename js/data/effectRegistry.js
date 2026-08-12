// js/data/effectRegistry.js
//
// 🟢 階段A1定案版：純資料骨架 + hook清單，尚未搬邏輯（TODO標記處對應A2/A3要搬的原始位置）
// hero.activeEffects 直接取代現有散落欄位，範例：
//   [{ id: 'blessing_guardian', stacks: 2 }, { id: 'reroll_attack_dice', max: 1, used: 0 }]
// 引擎讀取方式：遍歷 hero.activeEffects，依 id 查本表對應項目，執行該時機點註冊的函式

export const EFFECT_REGISTRY = {

    // ================= BLESSING =================
    blessing_stigma_sovereign: {
        category: 'BLESSING',
        onTurnStart: (hero, entry, ctx) => {
            if (entry.stacks > 0) {
                hero.stigma += entry.stacks;
                ctx.log(`🔱 [加護:聖痕君臨] 對敵方施加 ${entry.stacks} 層聖痕 (現為 ${hero.stigma} 層)`, 'system');
            }
        }
    },
    blessing_guardian: {
        category: 'BLESSING',
        onBattleStart: (hero, entry, ctx) => {
            const bonusBlock = Math.floor(hero.hp / 5) * entry.stacks;
            if (bonusBlock > 0) {
                hero.block += bonusBlock;
                ctx.log(`🛡️ [加護:守護] 血量 ${hero.hp} 點，獲得 ${bonusBlock} 點格擋！`, 'system');
            }
        }
    },
    blessing_desperation: {
        category: 'BLESSING',
        liveStatModifier: (hero, entry, statName) => {
            if (!['atk', 'speed', 'crit'].includes(statName)) return 0;
            const missing = Math.max(0, (hero.maxHp || 0) - (hero.hp || 0));
            return Math.floor(missing / 3) * 2 * entry.stacks;
        }
    },
    blessing_tyrant: {
        category: 'BLESSING',
        onTurnStart: (hero, entry, ctx) => {
            const dmg = 3 * entry.stacks;
            const manaGain = entry.stacks;
            if (hero.hp - dmg > 0) {
                hero.hp -= dmg;
                hero.mana += manaGain;
                ctx.log(`👑 [加護:暴君] 血量-${dmg}，魔力+${manaGain} (現魔力 ${hero.mana})`, 'system');
            } else {
                ctx.log(`👑 [加護:暴君] 血量不足以承受代價，本回合效果未發動`, 'system');
            }
        }
    },
    blessing_fortify: {
        category: 'BLESSING',
        liveStatModifier: (hero, entry, statName) => {
            if (statName !== 'armor') return 0;
            const missing = Math.max(0, (hero.maxHp || 0) - (hero.hp || 0));
            return Math.floor(missing / 3) * 2 * entry.stacks;
        }
    },
    blessing_all_out: {
        category: 'BLESSING',
        onBattleStart: (hero, entry, ctx) => {
            const bonusStat = Math.floor(hero.hp / 10) * entry.stacks;
            if (bonusStat > 0) {
                hero.battleAtkBonus = (hero.battleAtkBonus || 0) + bonusStat;
                hero.battleCritBonus += bonusStat;
                ctx.log(`💪 [加護:渾身] 血量 ${hero.hp} 點，攻擊力與爆擊增益各 +${bonusStat}！`, 'system');
            }
        }
    },
    blessing_healing: {
        category: 'BLESSING',
        onHealModify: (hero, entry) => entry.stacks * 2
    },

    // ================= CARD_EFFECT (卡片附加效果，非加護/速通類，供 Stage5+ 卡片使用) =================
    // 🟢 Stage 5-6 新增：盾反 —— stacks 代表剩餘回合數，每次 onTurnStart 遞減；
    // 期間格擋吸收的傷害會等量對隨機存活敵人反擊
    shield_counter: {
        category: 'CARD_EFFECT',
        onTurnStart: (hero, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                hero.activeEffects = hero.activeEffects.filter(e => e !== entry);
                ctx.log(`🛡️ [盾反] 效果已結束`, 'system');
            }
        },
        onBlockedDamage: (hero, entry, ctx) => {
            if (!(entry.stacks > 0) || !(ctx.blockedAmount > 0)) return;
            const aliveEnemies = (ctx.enemies || []).filter(e => e.hp > 0);
            if (aliveEnemies.length === 0) return;

            const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            ctx.log(`🔁 [盾反] 格擋下 ${ctx.blockedAmount} 點傷害，對 ${target.name} 反擊！`, 'system');
            ctx.combatSys.applyDamageToTarget(target, ctx.blockedAmount, ctx.log, ctx.enemies);
        }
    },

// ================= SPEEDRUN =================
    speedrun_halve_next_enemy_hp: {
        category: 'SPEEDRUN',
        // ctx = { enemies, nodeType }，在 BattleSetup 敵人生成"後"呼叫
        onEnemiesGenerated: (hero, entry, ctx) => {
            if (ctx.nodeType !== 'BATTLE' || entry.stacks <= 0) return;
            ctx.enemies.forEach(e => {
                e.maxHp = Math.max(1, Math.floor(e.maxHp / 2));
                e.hp = e.maxHp;
            });
            entry.stacks -= 1; // 消耗1次充能
        }
    },
    speedrun_first_strike_bonus: {
        category: 'SPEEDRUN',
        // ctx = { log, bonusTotal }，由呼叫端（BattleScene）在確認符合觸發條件時才呼叫本hook
        onFirstAttack: (hero, entry, ctx) => {
            const bonus = entry.stacks * 10;
            if (bonus > 0) {
                ctx.bonusTotal += bonus;
                ctx.log(`🏹 [被動:先發制人] 本場首次攻擊傷害 +${bonus}！`, 'system');
            }
        }
    },
    speedrun_battle_start_boost: {
        category: 'SPEEDRUN',
        // ctx = { log, deckSys }
        onBattleStart: (hero, entry, ctx) => {
            if (entry.stacks <= 0) return;
            hero.mana += 3;
            ctx.deckSys.drawCard();
            ctx.deckSys.drawCard();
            entry.stacks -= 1; // 消耗1次充能
            ctx.log(`⚡ [被動:戰鬥爆發] 開局額外獲得 3 點魔力，並多抽 2 張牌！`, 'system');
        }
    },
    speedrun_limited_enemies: {
        category: 'SPEEDRUN',
        // ctx = { nodeType }，在 BattleSetup 敵人生成"前"呼叫，用來決定要不要限縮陣容
        // 透過 ctx.limitedToOne 把結果帶回呼叫端
        onStageQuery: (hero, entry, ctx) => {
            if (ctx.nodeType !== 'BATTLE' || entry.stacks <= 0) return;
            ctx.limitedToOne = true;
            entry.stacks -= 1; // 每場一般戰鬥消耗1點剩餘場次
        }
    },
    speedrun_extra_reward_choice: {
        category: 'SPEEDRUN',
        // ctx = { extraChoices }，一次性把所有充能吐出並歸零
        onRewardScreenOpen: (hero, entry, ctx) => {
            ctx.extraChoices += entry.stacks;
            entry.stacks = 0;
        }
    },

    // ================= DICE（純計數器，不掛hook，引擎用通用函式處理） =================
    reroll_attack_dice: { category: 'DICE', type: 'COUNTER' },
    reroll_speed_dice:  { category: 'DICE', type: 'COUNTER' }
};

// TODO A2起：引擎通用函式（掛在 TurnSystem/CombatSystem 或獨立 EffectEngine.js，位置下次確認）
// - runHook(hookName, hero, ctx)：遍歷 hero.activeEffects，依序執行有該hook的項目
// - getLiveStatBonus(hero, statName)：加總所有 liveStatModifier 結果
// - getCounterRemaining(hero, id) / consumeCounter(hero, id)：通用計數器存取