// js/data/effectRegistry.js
//
// 🟢 階段A1定案版：純資料骨架 + hook清單，尚未搬邏輯（TODO標記處對應A2/A3要搬的原始位置）
// hero.activeEffects 直接取代現有散落欄位，範例：
//   [{ id: 'blessing_guardian', stacks: 2 }, { id: 'reroll_attack_dice', max: 1, used: 0 }]
// 引擎讀取方式：遍歷 hero.activeEffects，依 id 查本表對應項目，執行該時機點註冊的函式

export const EFFECT_REGISTRY = {

    // ================= BLESSING =================
    sage_blessing: {
        category: 'DEBUFF_LIKE',
        displayName: '賢者加護',
        getStatusText: (entry) => `賢者加護 (剩餘 ${entry.stacks} 回合，全屬性+1，CT額外+1)`,
        liveStatModifier: (entity, entry, statName) => ['atk','speed','crit','armor'].includes(statName) ? 1 : 0,
        onCtRegenQuery: (entity, entry, ctx) => { ctx.bonus += 1; },
        onTurnStart: (entity, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`✨ [賢者加護] 效果已結束`);
            }
        }
    },

    blessing_stigma_sovereign: {
        category: 'BLESSING',
        displayName: '聖痕君臨',
        getStatusText: (entry) => `聖痕君臨 x${entry.stacks} (每回合給敵方 ${entry.stacks} 層聖痕)`,
        onTurnStart: (hero, entry, ctx) => {
            if (entry.stacks > 0) {
                hero.stigma += entry.stacks;
                ctx.log(`🔱 [加護:聖痕君臨] 對敵方施加 ${entry.stacks} 層聖痕 (現為 ${hero.stigma} 層)`, 'system');
            }
        }
    },
    blessing_guardian: {
        category: 'BLESSING',
        displayName: '守護',
        getStatusText: (entry) => `守護 x${entry.stacks} (戰鬥開始每5點HP+1格擋)`,
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
        displayName: '背水',
        getStatusText: (entry) => `背水 x${entry.stacks} (缺血時攻速爆增益提升)`,
        liveStatModifier: (hero, entry, statName) => {
            if (!['atk', 'speed', 'crit'].includes(statName)) return 0;
            const missing = Math.max(0, (hero.maxHp || 0) - (hero.hp || 0));
            return Math.floor(missing / 3) * 2 * entry.stacks;
        }
    },
    blessing_tyrant: {
        category: 'BLESSING',
        displayName: '暴君',
        getStatusText: (entry) => `暴君 x${entry.stacks} (每回合-${3 * entry.stacks}HP,+${entry.stacks}魔力)`,
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
        displayName: '堅守',
        getStatusText: (entry) => `堅守 x${entry.stacks} (缺血時護甲值提升)`,
        liveStatModifier: (hero, entry, statName) => {
            if (statName !== 'armor') return 0;
            const missing = Math.max(0, (hero.maxHp || 0) - (hero.hp || 0));
            return Math.floor(missing / 3) * 2 * entry.stacks;
        }
    },
    blessing_all_out: {
        category: 'BLESSING',
        displayName: '渾身',
        getStatusText: (entry) => `渾身 x${entry.stacks} (戰鬥開始每10點HP攻擊/爆擊+1)`,
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
        displayName: '治癒',
        getStatusText: (entry) => `治癒 x${entry.stacks} (每次回血額外+${entry.stacks * 2})`,
        onHealModify: (hero, entry) => entry.stacks * 2
    },

    // ================= CARD_EFFECT (卡片附加效果，非加護/速通類，供 Stage5+ 卡片使用) =================
    // 🟢 Stage 5-6 新增：盾反 —— stacks 代表剩餘回合數，每次 onTurnStart 遞減；
    // 期間格擋吸收的傷害會等量對隨機存活敵人反擊
    shield_counter: {
        category: 'CARD_EFFECT',
        displayName: '盾反',
        getStatusText: (entry) => `盾反 (剩餘 ${entry.stacks} 回合)`,
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

    swordsman_petal_shadow: {
        category: 'CARD_EFFECT',
        liveStatModifier: (hero, entry, statName) => (statName === 'speed' ? 1 : 0),
        onTurnStart: (hero, entry, ctx) => {
            if (entry.stacks <= 0) return;
            hero.insightStacks = Math.min(1, (hero.insightStacks || 0) + 1);
            ctx.log(`🌸 [槿花泡影] 回合開始，獲得【慧眼】(剩餘 ${entry.stacks} 回合)`, 'system');
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                hero.activeEffects = hero.activeEffects.filter(e => e !== entry);
                ctx.log(`🌸 [槿花泡影] 效果已結束`, 'system');
            }
        }
    },

    swordsman_lonely_inaction: {
        category: 'CARD_EFFECT',
        displayName: '寂寞無為',
        getStatusText: (entry) => `寂寞無為 (剩餘 ${entry.stacks} 回合，閃避成功額外反擊5點)`,
        onTurnStart: (hero, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                hero.activeEffects = hero.activeEffects.filter(e => e !== entry);
                ctx.log(`🌀 [寂寞無為] 效果已結束`, 'system');
            }
        },
        onDodgeSuccess: (hero, entry, ctx) => {
            if (!(entry.stacks > 0)) return;
            const aliveEnemies = (ctx.enemies || []).filter(e => e.hp > 0);
            if (aliveEnemies.length === 0) return;
            const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            ctx.log(`🌀 [寂寞無為] 閃避觸發反擊，對 ${target.name} 造成 5 點傷害！`, 'system');
            ctx.combatSys.applyDamageToTarget(target, 5, ctx.log, ctx.enemies);
            hero.swordIntent = Math.max(0, Math.min(10, (hero.swordIntent || 0) + 1));
            hero.insightStacks = Math.min(1, (hero.insightStacks || 0) + 1);
            ctx.log(`🗡️ [寂寞無為] 劍意+1，獲得【慧眼】`, 'system');
        }
    },

    counter_stack: {
        category: 'DEBUFF_LIKE',   // 通用敵方機制類別，不分角色/敵人皆可掛
        displayName: '反擊',
        getStatusText: (entry) => `反擊 x${entry.stacks} (受到攻擊時反擊等量傷害)`,
        onGetHit: (self, entry, ctx) => {
            if (!ctx.attacker || ctx.attacker.hp <= 0) return;
            const dmg = ctx.combatSys.getEffectiveEnemyAtk(self) * entry.stacks;
            ctx.log(`🔁 [反擊] ${self.name} 對 ${ctx.attacker.name} 造成 ${dmg} 點反擊傷害！`);
            ctx.combatSys.applyDamageToTarget(ctx.attacker, dmg, ctx.log, ctx.enemies, self);
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                self.activeEffects = self.activeEffects.filter(e => e !== entry);
            }
        }
    },

    taunt: {
        category: 'DEBUFF_LIKE',
        displayName: '嘲諷',
        getStatusText: () => `嘲諷 (敵方攻擊被強制鎖定至此)`
        // 無 hook：純粹供 AttackFlowSystem 查詢是否存在
    },

        // 🟢 門衛四天王：盾之守衛「全體保護」專用盾反，跟玩家的 shield_counter 分開
    // （解除時機不同：這個是格擋歸零時解除，不是回合倒數）
    guardian_counter: {
        category: 'DEBUFF_LIKE',
        displayName: '盾反(守衛)',
        getStatusText: () => `盾反 (格擋下的傷害會等量反擊攻擊者，格擋歸零時解除)`,
        onBlockedDamage: (self, entry, ctx) => {
            if (!(ctx.blockedAmount > 0) || !ctx.attacker || ctx.attacker.hp <= 0) return;
            ctx.log(`🔁 [盾反] ${self.name} 對 ${ctx.attacker.name} 反擊 ${ctx.blockedAmount} 點傷害！`);
            ctx.combatSys.applyDamageToTarget(ctx.attacker, ctx.blockedAmount, ctx.log, ctx.enemies);
        }
    },

    debuff_freeze: {
        category: 'DEBUFF_LIKE',
        displayName: '冰結',
        getStatusText: (entry) => `冰結 (剩餘 ${entry.stacks} 回合，速度-2、攻擊力-2)`,
        liveStatModifier: (entity, entry, statName) => ['atk', 'speed'].includes(statName) ? -2 : 0,
        onTurnStart: (entity, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`❄️ [冰結] 效果已結束`);
            }
        }
    },

    debuff_stun: {
        category: 'DEBUFF_LIKE',
        displayName: '暈眩',
        getStatusText: (entry) => `暈眩 (剩餘 ${entry.stacks} 回合，無法出卡)`,
        onTurnStart: (hero, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                hero.activeEffects = hero.activeEffects.filter(e => e !== entry);
                ctx.log(`💫 [暈眩] 效果已結束`, 'system');
            }
        }
    },

    // ================= COLLECTION（純顯示標記，實際效果已在達成當下直接套用到hero欄位） =================
    collection_stat_4: {
        category: 'COLLECTION',
        displayName: '數值收集 x4',
        getStatusText: () => `數值收集 x4 (已永久獲得：攻擊/爆擊/格擋/魔力/護甲/速度/回復量 各+1)`
    },
    collection_stat_6: {
        category: 'COLLECTION',
        displayName: '數值收集 x6',
        getStatusText: () => `數值收集 x6 (已永久獲得：以上數值再各+1)`
    },
    collection_blessing_4: {
        category: 'COLLECTION',
        displayName: '加護收集 x4',
        getStatusText: () => `加護收集 x4 (已永久獲得：全加護層數+1)`
    },
    collection_card_2: {
        category: 'COLLECTION',
        displayName: '卡片收集 x2',
        getStatusText: () => `卡片收集 x2 (戰鬥開始時第一張卡片變0費)`
    },

// ================= SPEEDRUN =================
    speedrun_halve_next_enemy_hp: {
        category: 'SPEEDRUN',
        displayName: '敵陣削弱',
        getStatusText: (entry) => `敵陣削弱 (剩餘 ${entry.stacks} 次,下場一般戰鬥敵人血量減半)`,
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
        displayName: '先發制人',
        getStatusText: (entry) => `先發制人 x${entry.stacks} (每場首次攻擊傷害+${entry.stacks * 10})`,
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
        displayName: '戰鬥爆發',
        getStatusText: (entry) => `戰鬥爆發 (剩餘 ${entry.stacks} 次,下場開局+3魔力/抽2張)`,
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
        displayName: '各個擊破',
        getStatusText: (entry) => `各個擊破 (剩餘 ${entry.stacks} 場一般戰鬥只出現1隻敵人)`,
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
        displayName: '機會之門',
        getStatusText: (entry) => `機會之門 (剩餘 ${entry.stacks} 次,下次獎勵可選數量+1)`,
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