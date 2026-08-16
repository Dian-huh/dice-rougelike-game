// js/systems/AttackFlowSystem.js
import { CombatSystem } from './CombatSystem.js';
import { EffectEngine } from './EffectEngine.js';

const ATTACK_DICE_IDS = [1, 3, 4, 6];

export const AttackFlowSystem = {
    // 入口：開始一次攻擊骰結算流程
    begin(ctx) {
        ctx._flow = { timesRemaining: ctx.hero.atkCount, pendingReattacks: 0 };  // 🟢 新增 pendingReattacks
        ctx.hero.atkCount = 1;
        return this._startAction(ctx);
    },

    // 恢復點：玩家對 NEED_REROLL_CONFIRM / NEED_TARGET / ACTION_UPDATE 做出回應後呼叫
    resume(ctx, payload = {}) {
        const flow = ctx._flow;
        if (!flow) return { type: 'DONE' };

        if (flow.stage === 'WAIT_REROLL') return this._afterRerollDecision(ctx, payload);
        if (flow.stage === 'WAIT_TARGET') return this._afterTargetChosen(ctx, payload);
        if (flow.stage === 'WAIT_UPDATE') return this._startAction(ctx);
        return { type: 'DONE' };
    },

    // === 對應原 runAttackPhaseStep 前半：擲骰、判斷是否可重骰 ===
    _startAction(ctx) {
    const { hero, enemies } = ctx;
    const flow = ctx._flow;

    if (enemies.every(e => e.hp <= 0) || hero.hp <= 0 || flow.timesRemaining <= 0) {
        ctx._flow = null;
        return { type: 'DONE' };
    }

    flow.timesRemaining -= 1;
    return this._rollAndProceed(ctx);
},

    // 🟢 新增：再攻擊專用啟動點，不消耗 timesRemaining（那是「攻擊次數UP」的額度，跟角色技能觸發的額外攻擊是兩回事）
    _startReattack(ctx) {
        const { hero, enemies } = ctx;
        if (enemies.every(e => e.hp <= 0) || hero.hp <= 0) {
            ctx._flow.pendingReattacks = 0;
            ctx._flow.stage = 'WAIT_UPDATE';
            return { type: 'ACTION_UPDATE' };
        }
        return this._rollAndProceed(ctx);
    },

    // 🟢 從原 _startAction 拆出來，一般攻擊與再攻擊共用同一套擲骰＋重骰判斷
    _rollAndProceed(ctx) {
        const { hero } = ctx;
        const flow = ctx._flow;

        let actionDice;
        let allowReroll = true;
        if (hero.isPressured) {
            actionDice = 1;
            hero.overrideDice = null;
            hero.isPressured = false;
            ctx.log(`😱 【威壓】效果發動，攻擊骰被強制鎖定為 1 點！`, 'system');
            allowReroll = false;
        } else if (hero.overrideDice !== null) {
            actionDice = hero.overrideDice;
            hero.overrideDice = null;
            allowReroll = false;
        } else {
            actionDice = Phaser.Math.Between(1, 6);
        }
        ctx.lastActionDice = actionDice;
        flow.actionDice = actionDice;

        const rerollsLeft = EffectEngine.getCounterRemaining(hero, 'reroll_attack_dice');
        if (allowReroll && rerollsLeft > 0) {
            flow.stage = 'WAIT_REROLL';
            return { type: 'NEED_REROLL_CONFIRM', actionDice, rerollsLeft };
        }

        return this._continueWithDice(ctx, actionDice);
    },

    _afterRerollDecision(ctx, payload) {
        const flow = ctx._flow;
        if (!flow) return { type: 'DONE' };

        if (payload && payload.reroll) {
            EffectEngine.consumeCounter(ctx.hero, 'reroll_attack_dice');
            const newDice = Phaser.Math.Between(1, 6);
            ctx.lastActionDice = newDice;
            flow.actionDice = newDice;
            ctx.log(`🔄 重骰攻擊骰：新結果 [ ${newDice} ] 點`, 'system');

            const stillLeft = EffectEngine.getCounterRemaining(ctx.hero, 'reroll_attack_dice');
            if (stillLeft > 0) {
                flow.stage = 'WAIT_REROLL';
                return { type: 'NEED_REROLL_CONFIRM', actionDice: newDice, rerollsLeft: stillLeft };
            }
            return this._continueWithDice(ctx, newDice);
        }

        // 玩家選擇「確定使用」
        return this._continueWithDice(ctx, flow.actionDice);
    },

    // === 對應原 continueAttackPhaseStep：判斷是否需要跳目標選擇 ===
    _continueWithDice(ctx, actionDice) {
        const { hero, enemies } = ctx;
        const skill = hero.diceSkills[actionDice];
        const scope = (skill && skill.scope) || 'SINGLE_ENEMY';
        const aliveEnemies = enemies.filter(e => e.hp > 0);

        if (scope === 'SINGLE_ENEMY' && aliveEnemies.length > 1) {
            ctx._flow.stage = 'WAIT_TARGET';
            ctx._flow.pendingScope = scope;
            ctx._flow.pendingDice = actionDice;
            return { type: 'NEED_TARGET', candidates: aliveEnemies };
        }

        const target = aliveEnemies.length > 0 ? aliveEnemies[0] : null;
        return this._executeAction(ctx, actionDice, scope, target);
    },

    _afterTargetChosen(ctx, payload) {
        const flow = ctx._flow;
        const target = payload && payload.target;
        return this._executeAction(ctx, flow.pendingDice, flow.pendingScope, target);
    },

    // === 對應原 executeAttackPhaseAction ===
    _executeAction(ctx, actionDice, scope, chosenTarget) {
        const { hero, enemies } = ctx;
        const wasDouble = hero.doubleNextAction;
        const repeatCount = CombatSystem.getRepeatCount(hero);
        if (wasDouble) {
            ctx.log(`⚡ 連打算計生效：[${actionDice}點] 連發 2 次！`, 'player');
        }

        let firstStrikeBonus = 0;
        if (scope !== 'SELF' && !ctx.firstAttackTriggeredThisBattle && ATTACK_DICE_IDS.includes(actionDice)) {
            const bonusCtx = { log: ctx.log, bonusTotal: 0 };
            EffectEngine.runHook('onFirstAttack', hero, bonusCtx);
            if (bonusCtx.bonusTotal > 0) {
                firstStrikeBonus = bonusCtx.bonusTotal;
                hero.battleAtkBonus = (hero.battleAtkBonus || 0) + firstStrikeBonus;
                ctx.firstAttackTriggeredThisBattle = true;
            }
        }

        if (scope === 'SELF') {
            for (let r = 0; r < repeatCount; r++) {
                if (hero.hp <= 0) break;
                this._executePlayerDiceAction(ctx, actionDice, null);
            }
            enemies.forEach(enemy => {
                if (enemy.hp > 0 && hero.hp > 0) this._executeEnemyAction(ctx, enemy);
            });
        } else if (scope === 'ALL_ENEMIES') {
            enemies.forEach(enemy => this._resolvePlayerVsEnemy(ctx, enemy, actionDice, repeatCount));
        } else {
            enemies.forEach(enemy => {
                if (enemy.hp <= 0 || hero.hp <= 0) return;
                if (chosenTarget && enemy === chosenTarget) {
                    this._resolvePlayerVsEnemy(ctx, enemy, actionDice, repeatCount);
                } else {
                    this._executeEnemyAction(ctx, enemy);
                }
            });
        }

        if (firstStrikeBonus > 0) {
            hero.battleAtkBonus -= firstStrikeBonus;
        }

        return this._finishActionSegment(ctx);
    },

    // 🟢 新增：一段攻擊骰行動結束後的收尾——有排隊中的「再攻擊」就接著跑新一輪擲骰，沒有才交還畫面
    _finishActionSegment(ctx) {
        const flow = ctx._flow;
        if (flow.pendingReattacks > 0) {
            flow.pendingReattacks -= 1;
            return this._startReattack(ctx);
        }
        flow.stage = 'WAIT_UPDATE';
        return { type: 'ACTION_UPDATE' };
    },

    // === 對應原 resolvePlayerVsEnemy ===
    _resolvePlayerVsEnemy(ctx, enemy, actionDice, repeatCount) {
        const { hero } = ctx;
        if (enemy.hp <= 0 || hero.hp <= 0) return;

        const order = CombatSystem.resolveTurnOrder(ctx.playerSpeedDice, enemy.speedDice);

        if (order === 'PLAYER_FIRST') {
            for (let r = 0; r < repeatCount; r++) {
                if (hero.hp > 0 && enemy.hp > 0) this._executePlayerDiceAction(ctx, actionDice, enemy);
            }
            if (enemy.hp > 0) this._executeEnemyAction(ctx, enemy);
        } else if (order === 'ENEMY_FIRST') {
            this._executeEnemyAction(ctx, enemy);
            if (hero.hp > 0 && enemy.hp > 0) {
                for (let r = 0; r < repeatCount; r++) {
                    if (hero.hp > 0 && enemy.hp > 0) this._executePlayerDiceAction(ctx, actionDice, enemy);
                }
            }
        } else {
            let pActionLog = [];
            let eActionLog = [];

            for (let r = 0; r < repeatCount; r++) {
                if (hero.hp <= 0 || enemy.hp <= 0) break;
                if (enemy.isFlying && ATTACK_DICE_IDS.includes(actionDice)) {
                    pActionLog.push(`💨 ${enemy.name} 處於【飛翔】狀態，攻擊骰完全打不中！`);
                } else {
                    const pSkill = hero.diceSkills[actionDice];
                    if (pSkill) pSkill.execute(hero, enemy, CombatSystem, (m) => pActionLog.push(m), ctx._flow, ctx.enemies);
                }
            }
            
            const enemyIntent = CombatSystem.resolveEnemyIntent(enemy);
            enemy.executeAction(enemy, enemyIntent, hero, CombatSystem, (m) => eActionLog.push(m), ctx.enemies);
            CombatSystem.tickPoison(hero, (m) => pActionLog.push(m));

            ctx.log(pActionLog.join(' '), 'simultaneous', eActionLog.join(' '));
        }
    },

    // === 對應原 executePlayerDiceAction ===
    _executePlayerDiceAction(ctx, dice, targetEnemy) {
        const { hero } = ctx;
        const skill = hero.diceSkills[dice];
        if (!skill) return;

        if (targetEnemy && targetEnemy.isFlying && ATTACK_DICE_IDS.includes(dice)) {
            ctx.log(`💨 ${targetEnemy.name} 處於【飛翔】狀態，攻擊骰完全打不中！`, 'player');
            CombatSystem.tickPoison(hero, (m) => ctx.log(m, 'player'));
            return;
        }

        skill.execute(hero, targetEnemy, CombatSystem, (m) => ctx.log(m, 'player'), ctx._flow, ctx.enemies);
        CombatSystem.tickPoison(hero, (m) => ctx.log(m, 'player'));
    },

    // === 對應原 executeEnemyAction ===
    _executeEnemyAction(ctx, enemy) {
        if (enemy && enemy.hp > 0) {
            const intent = CombatSystem.resolveEnemyIntent(enemy);
            enemy.executeAction(enemy, intent, ctx.hero, CombatSystem, (m) => ctx.log(m, 'enemy'), ctx.enemies);
        }
    }
};