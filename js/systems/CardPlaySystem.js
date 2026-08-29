/**
 * CardPlaySystem.js
 * 
 * 职责：处理卡牌使用的所有业务逻辑
 * - 验证卡牌是否可以使用（魔力、剑意、冷却等）
 * - 处理卡牌范围判断，决定是否需要目标选择
 * - 最终结算卡牌效果、消耗资源、更新数据
 * 
 * 不处理：UI 显示、用户交互（交给 UIInteractionSystem）
 */
import { EffectEngine } from './EffectEngine.js';
import { CombatSystem } from './CombatSystem.js';

export class CardPlaySystem {
    /**
     * 验证卡牌是否可以使用
     * @returns { valid: boolean, reason?: string }
     */
    static canPlayCard(card, hero, battleCtx) {
        if (!card) return { valid: false, reason: '卡牌不存在' };

        if (EffectEngine.getEntry(hero, 'debuff_stun')) {   // 🟢 新增
            return { valid: false, reason: `⚠️ 處於【暈眩】狀態，無法使用卡牌` };
        }

        const { cost: effCost } = CombatSystem.getDisplayCost(card, hero, battleCtx);

        if (hero.mana < effCost) {
            return { valid: false, reason: `⚠️ 魔力不足，無法使用 [${card.name}]` };
        }

        if (card.minSwordIntent && (hero.swordIntent || 0) < card.minSwordIntent) {
            return { valid: false, reason: `⚠️ 劍意不足 ${card.minSwordIntent}，無法使用 [${card.name}]` };
        }

        return { valid: true };
    }

    /**
     * 判断卡牌是否需要目标选择
     * @returns { needsTarget: boolean, aliveEnemies: array }
     */
    static analyzeCardScope(card, enemies) {
        const scope = card.scope || 'SELF';
        const aliveEnemies = enemies.filter(e => e.hp > 0);

        if (scope === 'SINGLE_ENEMY' && aliveEnemies.length > 1) {
            return { needsTarget: true, aliveEnemies };
        }

        return { needsTarget: false, aliveEnemies };
    }

    /**
     * 最终结算卡牌使用
     * 调用流程：
     * 1. 先通过 canPlayCard() 验证
     * 2. 通过 analyzeCardScope() 判断是否需要目标
     * 3. 最后调用此方法做最终结算
     * 
     * @param scene - 可选的 Phaser Scene，某些卡牌需要通过它调用 UI 方法
     */
    static finalizeCardPlay(deckSys, hero, card, index, target, battleCtx, appendLogFn, scene = null) {
        const { cost: effCost, isFreeFirstCard } = CombatSystem.getDisplayCost(card, hero, battleCtx);

        // 标记已使用第一张卡（用于收集被动检查）
        battleCtx.firstCardPlayedThisBattle = true;

        // 消耗资源
        hero.mana -= effCost;
        deckSys.playCard(index);

        // 🟢 利滾利效果生效中：每使用一張金幣詞條卡額外獲得20金幣
        if (hero.freeGoldCardsThisTurn && card.tags && card.tags.includes('金幣')) {
            hero.gold = (hero.gold || 0) + 20;
            appendLogFn(`💰 [利滾利] 使用金幣卡，額外獲得 20 金幣！`, 'player');
        }

        // 🟢 借用神力：折扣是一次性的，用在一張聖痕卡後即消耗
        if (card.tags && card.tags.includes('聖痕') && hero.nextStigmaCardDiscount > 0) {
           hero.nextStigmaCardDiscount = 0;
        }

        // 处理中毒效果
        CombatSystem.tickActionDOT(hero, (m) => appendLogFn(m, 'player'));

        // 记录日志
        if (isFreeFirstCard) {
            appendLogFn(
                `🎴 使用卡牌 [${card.name}] (🏅收集被動：本場首張卡片0費！)`,
                'player'
            );
        } else {
            appendLogFn(
                `🃏 使用卡牌 [${card.name}] (-${effCost}費)`,
                'player'
            );
        }

        // 执行卡牌的 onPlay hook，传递 scene 参数以便卡片调用 UI 方法
        if (card.onPlay) {
            card.onPlay(hero, target, CombatSystem, deckSys, (m) => appendLogFn(m, 'player'), scene);
        }

        // 记录最后使用的卡牌（某些效果可能需要）
        hero.lastPlayedCard = card;
    }
}
