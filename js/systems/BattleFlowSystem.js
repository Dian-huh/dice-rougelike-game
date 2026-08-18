/**
 * BattleFlowSystem.js
 * 
 * 职责：处理战斗的流程控制
 * - 回合初始化（速度骰、手牌、效果触发）
 * - 战斗结束判定
 * - 主动技能状态检查
 * 
 * 不处理：UI 显示、用户交互、具体数值计算
 */

import { TurnSystem } from './TurnSystem.js';
import { EffectEngine } from './EffectEngine.js';
import { CombatSystem } from './CombatSystem.js';

export class BattleFlowSystem {
    /**
     * 初始化新回合
     * 返回是否成功初始化（有可能所有敌人已死或英雄已死）
     * 
     * @param turnCount 当前回合数（由调用方维护）
     */
    static initializeTurn(hero, enemies, turnCount, deckSys, battleCtx, appendLogFn) {
        // 检查战斗是否已结束
        if (enemies.every(e => e.hp <= 0) || hero.hp <= 0) {
            return false;
        }

        // 调用 TurnSystem 进行回合初始化：重置魔力、冷却，生成敌人骰子
        const { playerSpeedDice } = TurnSystem.startTurn(
            hero, enemies, turnCount,
            (m, sender) => appendLogFn(m, sender)
        );
        battleCtx.playerSpeedDice = playerSpeedDice;

        // 补充手牌
        deckSys.fillHandToMax(hero.maxMana);

        // 第一回合触发 onBattleStart hook
        if (turnCount === 1) {
            EffectEngine.runHook('onBattleStart', hero, {
                log: (m, sender) => appendLogFn(m, sender),
                deckSys: deckSys
            });
        }

        appendLogFn(`--- 第 ${turnCount} 回合開始 ---`, 'system');

        return true;
    }

    /**
     * 检查战斗是否已结束
     * @returns { status: 'ongoing' | 'victory' | 'defeat', allDead?: boolean }
     */
    static checkBattleStatus(hero, enemies) {
        const allDead = enemies.every(e => e.hp <= 0);
        if (allDead) {
            return { status: 'victory', allDead: true };
        }

        if (hero.hp <= 0) {
            return { status: 'defeat', allDead: false };
        }

        return { status: 'ongoing', allDead: false };
    }

    /**
     * 检查英雄是否可以使用主动技能
     * @returns { canUse: boolean, reason?: string }
     */
    static canUseActiveSkill(hero) {
        if (hero.isPressured) {
            return { canUse: false, reason: `⚠️ 受到【威壓】封印，本回合無法使用主動技能` };
        }

        if (hero.cdActiveSkill > 0) {
            return { canUse: false, reason: `⚠️ 主動技能冷卻中！還需等待 ${hero.cdActiveSkill} 回合` };
        }

        return { canUse: true };
    }

    /**
     * 获取英雄的可用重骰次数（速度骰重骰）
     */
    static getSpeedRerollsRemaining(hero) {
        return EffectEngine.getCounterRemaining(hero, 'reroll_speed_dice');
    }

    /**
     * 消耗一次重骰计数（速度骰）
     */
    static consumeSpeedReroll(hero) {
        EffectEngine.consumeCounter(hero, 'reroll_speed_dice');
    }

    /**
     * 处理战斗结束后的清理
     * 返回结算数据，UI 负责显示
     */
    static resolveBattleEnd(hero, enemies) {
        const status = this.checkBattleStatus(hero, enemies);

        if (status.status === 'victory') {
            // 重置战斗作用域的临时统计
            CombatSystem.resetBattleScopedStats(hero);
            return { victory: true, isFinalBoss: false }; // isFinalBoss 由外部传入
        }

        if (status.status === 'defeat') {
            return { victory: false, heroDead: true };
        }

        return { victory: false };
    }
}
