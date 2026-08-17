// js/systems/AttackFlowSystem.js
import { CombatSystem } from './CombatSystem.js';
import { EffectEngine } from './EffectEngine.js';

const ATTACK_DICE_IDS = [1, 3, 4, 6];

export const AttackFlowSystem = {
    // 入口：開始一次攻擊骰結算流程
    begin(ctx) {
        const totalTimes = ctx.hero.atkCount;   // 🟢 先讀出來，不動 hero 本尊
        ctx._flow = { timesRemaining: totalTimes, pendingReattacks: 0, totalTimes };
        ctx._enemyActedSet = new Set();
        ctx._pendingOrderedActions = new Set();
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
            this._flushPendingOrderedActions(ctx);   // 🟢 所有攻擊骰(含再攻擊)都結束後，PLAYER_FIRST的敵人才補上行動
            ctx._flow = null;
            return { type: 'DONE' };
        }

        flow.timesRemaining -= 1;
        return this._rollAndProceed(ctx);
    },

    // === resume() 加一個分支 ===
    resume(ctx, payload = {}) {
        const flow = ctx._flow;
        if (!flow) return { type: 'DONE' };

        if (flow.stage === 'WAIT_REROLL') return this._afterRerollDecision(ctx, payload);
        if (flow.stage === 'WAIT_TARGET') return this._afterTargetChosen(ctx, payload);
        if (flow.stage === 'WAIT_SOLO_TARGET') return this._afterSoloTargetInFlow(ctx, payload);  // 🟢新增
        if (flow.stage === 'WAIT_UPDATE') return this._startAction(ctx);
        return { type: 'DONE' };
    },

    _afterSoloTargetInFlow(ctx, payload) {
        const soloResult = this.resumeSolo(ctx, payload);
        if (soloResult.type === 'NEED_TARGET') {
            ctx._flow.stage = 'WAIT_SOLO_TARGET';
            return soloResult;
        }
        return this._finishActionSegment(ctx);
    },

    // === _finishActionSegment 改成呼叫 beginSolo ===
    _finishActionSegment(ctx) {
        const flow = ctx._flow;
        if (flow.pendingReattacks > 0) {
            flow.pendingReattacks -= 1;
            const soloStep = this.beginSolo(ctx);   // 🟢 取代原本呼叫 _startReattack
            if (soloStep.type === 'NEED_TARGET') {
                flow.stage = 'WAIT_SOLO_TARGET';
                return soloStep;
            }
            return this._finishActionSegment(ctx);  // solo同步結束了，繼續檢查還有沒有排隊中的再攻擊
        }
        flow.stage = 'WAIT_UPDATE';
        return { type: 'ACTION_UPDATE' };
    },

    // ============================================================
    // 🟢 新增：「偷打」流程本體 —— 獨立於主流程(ctx._flow)，用 ctx._solo 記狀態
    // ============================================================
    beginSolo(ctx) {
        ctx._solo = { pendingReattacks: 0 };
        return this._soloRoll(ctx);
    },

    resumeSolo(ctx, payload = {}) {
        const solo = ctx._solo;
        if (!solo) return { type: 'DONE' };
        if (solo.stage === 'WAIT_TARGET') return this._soloAfterTarget(ctx, payload);
        return { type: 'DONE' };
    },

    _soloRoll(ctx) {
        const { hero, enemies } = ctx;
        if (enemies.every(e => e.hp <= 0) || hero.hp <= 0) {
            ctx._solo = null;
            return { type: 'DONE' };
        }
        const actionDice = Phaser.Math.Between(1, 6);
        ctx.lastActionDice = actionDice;
        return this._soloContinue(ctx, actionDice);
    },

    _soloContinue(ctx, actionDice) {
        const { hero, enemies } = ctx;
        const skill = hero.diceSkills[actionDice];
        const scope = (skill && skill.scope) || 'SINGLE_ENEMY';
        const aliveEnemies = enemies.filter(e => e.hp > 0);

        if (scope === 'SINGLE_ENEMY' && aliveEnemies.length > 1) {
            ctx._solo.stage = 'WAIT_TARGET';
            ctx._solo.pendingScope = scope;
            ctx._solo.pendingDice = actionDice;
            return { type: 'NEED_TARGET', candidates: aliveEnemies };
        }
        const target = aliveEnemies.length > 0 ? aliveEnemies[0] : null;
        return this._soloExecute(ctx, actionDice, scope, target);
    },

    _soloAfterTarget(ctx, payload) {
        const solo = ctx._solo;
        return this._soloExecute(ctx, solo.pendingDice, solo.pendingScope, payload && payload.target);
    },

    _soloExecute(ctx, actionDice, scope, chosenTarget) {
        const { hero, enemies } = ctx;
        const repeatCount = CombatSystem.getRepeatCount(hero);   // 仍吃「連打算計」

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
                this._executePlayerDiceActionSolo(ctx, actionDice, null);
            }
        } else if (scope === 'ALL_ENEMIES') {
            enemies.forEach(enemy => {
                if (enemy.hp <= 0 || hero.hp <= 0) return;
                for (let r = 0; r < repeatCount; r++) {
                    if (hero.hp > 0 && enemy.hp > 0) this._executePlayerDiceActionSolo(ctx, actionDice, enemy);
                }
            });
        } else if (chosenTarget && chosenTarget.hp > 0) {
            for (let r = 0; r < repeatCount; r++) {
                if (hero.hp > 0 && chosenTarget.hp > 0) this._executePlayerDiceActionSolo(ctx, actionDice, chosenTarget);
            }
        }

        if (firstStrikeBonus > 0) hero.battleAtkBonus -= firstStrikeBonus;

        if (ctx._solo.pendingReattacks > 0) {
            ctx._solo.pendingReattacks -= 1;
            return this._soloRoll(ctx);   // 連鎖再攻擊
        }
        ctx._solo = null;
        return { type: 'DONE' };
    },

    // solo專用版：flowCtx傳ctx._solo（不是ctx._flow），讓技能3的再攻擊判斷落在solo自己的佇列裡
    _executePlayerDiceActionSolo(ctx, dice, targetEnemy) {
        const { hero } = ctx;
        const skill = hero.diceSkills[dice];
        if (!skill) return;

        if (targetEnemy && targetEnemy.isFlying && ATTACK_DICE_IDS.includes(dice)) {
            ctx.log(`💨 ${targetEnemy.name} 處於【飛翔】狀態，攻擊骰完全打不中！`, 'player');
            CombatSystem.tickPoison(hero, (m) => ctx.log(m, 'player'));
            return;
        }
        skill.execute(hero, targetEnemy, CombatSystem, (m) => ctx.log(m, 'player'), ctx._solo, ctx.enemies);
        CombatSystem.tickPoison(hero, (m) => ctx.log(m, 'player'));
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
                if (enemy.hp > 0 && hero.hp > 0) this._executeEnemyActionOnce(ctx, enemy);   // 🟢 改用 Once 版本
            });
        } else if (scope === 'ALL_ENEMIES') {
            enemies.forEach(enemy => this._resolvePlayerVsEnemy(ctx, enemy, actionDice, repeatCount));
        } else {
            enemies.forEach(enemy => {
                if (enemy.hp <= 0 || hero.hp <= 0) return;
                if (chosenTarget && enemy === chosenTarget) {
                    this._resolvePlayerVsEnemy(ctx, enemy, actionDice, repeatCount);
                } else {
                    this._executeEnemyActionOnce(ctx, enemy);   // 🟢 改用 Once 版本
                }
            });
        }

        if (firstStrikeBonus > 0) {
            hero.battleAtkBonus -= firstStrikeBonus;
        }

        return this._finishActionSegment(ctx);
    },

    _finishActionSegment(ctx) {
        const flow = ctx._flow;
        if (flow.pendingReattacks > 0) {
            flow.pendingReattacks -= 1;
            const soloStep = this.beginSolo(ctx);
            if (soloStep.type === 'NEED_TARGET') {
                flow.stage = 'WAIT_SOLO_TARGET';
                return soloStep;
            }
            return this._finishActionSegment(ctx);
        }
        flow.stage = 'WAIT_UPDATE';
        return { type: 'ACTION_UPDATE' };
    },

    // === 對應原 resolvePlayerVsEnemy ===
    _resolvePlayerVsEnemy(ctx, enemy, actionDice, repeatCount) {
        const { hero } = ctx;
        if (enemy.hp <= 0 || hero.hp <= 0) return;

        ctx._enemyActedSet = ctx._enemyActedSet || new Set();
        const alreadyActed = ctx._enemyActedSet.has(enemy);   // 🟢 本回合這隻敵人是否已經行動過

        const order = CombatSystem.resolveTurnOrder(ctx.playerSpeedDice, enemy.speedDice);

        if (order === 'PLAYER_FIRST') {
            for (let r = 0; r < repeatCount; r++) {
                if (hero.hp > 0 && enemy.hp > 0) this._executePlayerDiceAction(ctx, actionDice, enemy);
            }
            if (!alreadyActed && enemy.hp > 0) {
                ctx._pendingOrderedActions.add(enemy);   // 🟢 不立刻行動，先排隊
            }
        } else if (order === 'ENEMY_FIRST') {
            if (!alreadyActed) {
                ctx._enemyActedSet.add(enemy);
                this._executeEnemyAction(ctx, enemy);
            }
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

            if (!alreadyActed) {
                ctx._enemyActedSet.add(enemy);
                const enemyIntent = CombatSystem.resolveEnemyIntent(enemy);
                enemy.executeAction(enemy, enemyIntent, hero, CombatSystem, (m) => eActionLog.push(m), ctx.enemies);
            }
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
    },

    // 🟢 新增：包裝 _executeEnemyAction，確保同一隻敵人在本回合(含atkCount/再攻擊)只會真正行動一次
    _executeEnemyActionOnce(ctx, enemy) {
        ctx._enemyActedSet = ctx._enemyActedSet || new Set();
        if (ctx._enemyActedSet.has(enemy)) return;
        ctx._enemyActedSet.add(enemy);
        this._executeEnemyAction(ctx, enemy);
    },

    _flushPendingOrderedActions(ctx) {
        if (!ctx._pendingOrderedActions || ctx._pendingOrderedActions.size === 0) return;
        ctx._pendingOrderedActions.forEach(enemy => {
            if (!ctx._enemyActedSet.has(enemy) && enemy.hp > 0 && ctx.hero.hp > 0) {
                ctx._enemyActedSet.add(enemy);
                this._executeEnemyAction(ctx, enemy);
            }
        });
        ctx._pendingOrderedActions.clear();
    },

};