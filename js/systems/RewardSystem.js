import { DeckSystem } from './DeckSystem.js';
import {
    REWARD_POOL_DATA,
    REWARD_CATEGORY_NAMES,
    COLLECTION_MILESTONES,
    REWARD_CARD_POOL
} from '../data/rewardPoolData.js';
import { EffectEngine } from './EffectEngine.js';
// ====================================================================
// 🟢 第 2 階段：抽獎邏輯 + UI 重構
//
// 規則對應（獎池一覽.txt）：
//   - 每次固定出現 3 組「不同類別」的獎勵（類別：STAT/BLESSING/CARD/DICE/SPEEDRUN）
//   - 各類別出現機率相同（用均等隨機抽類別，不看類別內容重不重要）
//   - STAT 類別被抽中時，該格獎勵是「隨機2個數值項目」組成一組，一起套用
//   - 玩家可免費刷新一次，之後每次刷新需支付 (20 + 5 * 已付費刷新次數) 金幣
//   - 刷新時盡量避免「跟上一批完全相同的 3 個類別組合」（依既有 learning：
//     只追蹤緊鄰的前一批，不追蹤完整歷史，因類別只有5種，過嚴格會無解）
//   - 收集類（COLLECTION_MILESTONES）不進獎勵池，選擇獎勵後累計次數達標自動觸發
// ====================================================================

const ALL_CATEGORIES = ['STAT', 'BLESSING', 'CARD', 'DICE', 'SPEEDRUN'];

export class RewardSystem {

    // ----------------------------------------------------------------
    // 入口：顯示獎勵畫面
    // ----------------------------------------------------------------
    static showRewardUI(scene, stageData) {
        const config = (stageData && stageData.rewardConfig) ? stageData.rewardConfig : { baseGold: 15 };
        const stageName = (stageData && stageData.name) ? stageData.name : '戰鬥';

        if (config.baseGold) {
            const goldBonusPct = scene.hero.goldGainBonus || 0;
            const finalGold = Math.round(config.baseGold * (1 + goldBonusPct / 100));
            scene.hero.gold = (scene.hero.gold || 0) + finalGold;
        }

        // 🟢 修正：extraChoices 現在代表「可多選幾次」，不再撐大候選格數
        const choiceCtx = { extraChoices: 0 };
        EffectEngine.runHook('onRewardScreenOpen', scene.hero, choiceCtx);
        scene._rewardChoicesRemaining = 1 + choiceCtx.extraChoices;
        scene._rewardConfig = config;
        scene._rewardStageName = stageName;

        scene._rewardRerollState = { freeUsed: false, paidCount: 0 };
        scene._rewardPrevCategories = null;

        const batch = this.generateRewardBatch(scene);
        this.renderRewardUI(scene, stageData, config, stageName, batch);
    }

    // ----------------------------------------------------------------
    // 抽獎核心：決定本次要出現的 N 組獎勵（N = 3 + extraChoices）
    // ----------------------------------------------------------------
    // 抽獎核心：固定產生 3 組候選（min 是防呆，避免類別數<3時出錯）
    // ----------------------------------------------------------------
    static generateRewardBatch(scene) {
        const slotCount = Math.min(ALL_CATEGORIES.length, 3);
        const categories = this.pickCategories(slotCount, scene._rewardPrevCategories);
        scene._rewardPrevCategories = categories;

        const items = categories.map(cat => this.createRewardSlot(cat, scene));
        return items;
    }

    // 隨機選出 N 個不重複類別；盡量避開跟「上一批」完全相同的組合
    static pickCategories(count, previousCategories) {
        const maxAttempts = 5;
        let picked = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const pool = [...ALL_CATEGORIES];
            const result = [];
            for (let i = 0; i < count && pool.length > 0; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                result.push(pool[idx]);
                pool.splice(idx, 1);
            }
            picked = result;

            if (!previousCategories) break; // 沒有前一批可比較，直接採用

            const isSameSet = previousCategories.length === result.length &&
                [...previousCategories].sort().join(',') === [...result].sort().join(',');
            if (!isSameSet) break;
            // 若相同，繼續重試；重試達上限就直接採用（機率極低，避免無窮迴圈）
        }

        return picked;
    }

    // 依「權重」從池子中不重複抽出 n 個項目
    static weightedSampleWithoutReplacement(pool, n) {
        const items = [...pool];
        const result = [];
        for (let i = 0; i < n && items.length > 0; i++) {
            const totalWeight = items.reduce((sum, it) => sum + (it.weight || 1), 0);
            let r = Math.random() * totalWeight;
            let idx = 0;
            for (; idx < items.length; idx++) {
                r -= (items[idx].weight || 1);
                if (r <= 0) break;
            }
            idx = Math.min(idx, items.length - 1);
            result.push(items[idx]);
            items.splice(idx, 1);
        }
        return result;
    }

    // ----------------------------------------------------------------
    // 依類別產生單一獎勵格子的顯示資料 { category, title, desc, apply(scene) }
    // ----------------------------------------------------------------
    static createRewardSlot(category, scene) {
        const catLabel = REWARD_CATEGORY_NAMES[category] || category;

        if (category === 'STAT') {
            const picks = this.weightedSampleWithoutReplacement(REWARD_POOL_DATA.STAT, 2);
            const rolled = picks.map(item => ({ item, amount: item.roll ? item.roll() : undefined }));
            const title = `${catLabel} 成長：${rolled.map(r => r.item.name).join(' + ')}`;
            const desc = rolled.map(r => `• ${r.item.desc(r.amount)}`).join('\n');
            return {
                category,
                title,
                desc,
                apply: (s) => {
                    rolled.forEach(r => r.item.apply(s, r.amount));
                }
            };
        }

        if (category === 'BLESSING') {
            const [item] = this.weightedSampleWithoutReplacement(REWARD_POOL_DATA.BLESSING, 1);
            return {
                category,
                title: `${catLabel} ${item.name}`,
                desc: item.desc(),
                apply: (s) => item.apply(s)
            };
        }

        if (category === 'DICE') {
            const [item] = this.weightedSampleWithoutReplacement(REWARD_POOL_DATA.DICE, 1);
            return {
                category,
                title: `${catLabel} ${item.name}`,
                desc: item.desc(),
                apply: (s) => item.apply(s)
            };
        }

        if (category === 'SPEEDRUN') {
            const [item] = this.weightedSampleWithoutReplacement(REWARD_POOL_DATA.SPEEDRUN, 1);
            return {
                category,
                title: `${catLabel} ${item.name}`,
                desc: item.desc(),
                apply: (s) => item.apply(s)
            };
        }

        if (category === 'CARD') {
            const implementedCards = REWARD_CARD_POOL_SAFE_FILTER();
            const [cardDef] = this.weightedSampleWithoutReplacement(implementedCards, 1);
            const displayCost = (typeof cardDef.getCost === 'function') ? cardDef.getCost(scene.hero) : cardDef.cost;
            const costLabel = (typeof cardDef.getCost === 'function')
                ? `(${displayCost}費，依聖痕層數浮動)`
                : `(${displayCost}費)`;

            // 修改後
            const newCard = DeckSystem.instantiateCardDef(cardDef);   // 🟢 提前建立，供牌組已滿時的替換流程共用

            return {
                category,
                title: `${catLabel} [卡牌] ${cardDef.name}`,
                desc: `${costLabel} ${cardDef.desc}`,
                pendingCardDef: newCard,   // 🟢 給 onRewardChosen 判斷是否要走替換流程
                apply: (s) => {
                    s.deckSys.originalDeck.push(newCard);
                    s.appendLog(`🎁 獲得新卡片：[${newCard.name}]！`, 'system');
                }
            };
        }

        // 理論上不會發生，防呆用
        return {
            category,
            title: '未知獎勵',
            desc: '',
            apply: () => {}
        };
    }

    // ----------------------------------------------------------------
    // 選擇獎勵後：處理收集類（COLLECTION）里程碑判定
    // ----------------------------------------------------------------
    static handleCollectionProgress(scene, category) {
        const trackedCategories = ['STAT', 'BLESSING', 'CARD'];
        if (!trackedCategories.includes(category)) return;

        scene.hero.rewardCounts = scene.hero.rewardCounts || { STAT: 0, BLESSING: 0, CARD: 0 };
        scene.hero.rewardCounts[category] = (scene.hero.rewardCounts[category] || 0) + 1;
        const currentCount = scene.hero.rewardCounts[category];

        const milestone = COLLECTION_MILESTONES.find(m => m.category === category && m.threshold === currentCount);
        if (milestone) {
            milestone.apply(scene);
        }
    }

    // ----------------------------------------------------------------
    // UI 渲染
    // ----------------------------------------------------------------
    static renderRewardUI(scene, stageData, config, stageName, batch) {
        if (scene._rewardContainer) {
            scene._rewardContainer.destroy();
            scene._rewardContainer = null;
        }

        const rewardContainer = scene.add.container(0, 0);
        scene._rewardContainer = rewardContainer;

        const overlay = scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.9);
        const title = scene.add.text(260, 40, `🏆 ${stageName} 戰鬥獲勝！`, { fontSize: '20px', fill: '#ffcc00' });
        const subTitle = scene.add.text(280, 68, `💰 現有金幣: ${scene.hero.gold || 0}`, { fontSize: '13px', fill: '#00ffaa' });

        rewardContainer.add([overlay, title, subTitle]);

        // 🟢 新增：多選提示（只有還能選超過1項時才顯示，避免平常畫面多雜訊）
        if ((scene._rewardChoicesRemaining || 1) > 1) {
            const choiceHint = scene.add.text(280, 88, `🎯 本次還可選擇 ${scene._rewardChoicesRemaining} 項獎勵！`, { fontSize: '12px', fill: '#ffaaff' });
            rewardContainer.add(choiceHint);
        }

        const slotCount = batch.length;
        const totalWidth = slotCount * 200 + (slotCount - 1) * 20;
        const startX = 425 - totalWidth / 2 + 100;

        batch.forEach((slot, index) => {
            const x = startX + index * 220;

            const cardBg = scene.add.rectangle(x, 235, 200, 190, 0x222233)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.onRewardChosen(scene, stageData, slot, batch));

            const nameText = scene.add.text(x - 90, 150, slot.title, { fontSize: '13px', fill: '#ffffff', wordWrap: { width: 180 } });
            const descText = scene.add.text(x - 90, 195, slot.desc, { fontSize: '11px', fill: '#aaaaaa', wordWrap: { width: 180 }, lineSpacing: 3 });
            const selectBtn = scene.add.text(x - 40, 300, '[ 選擇此項 ]', { fontSize: '13px', fill: '#00ffaa' });

            rewardContainer.add([cardBg, nameText, descText, selectBtn]);
        });

        // 🟢 Reroll 按鈕
        const rerollState = scene._rewardRerollState;
        const rerollCost = rerollState.freeUsed ? (20 + 5 * rerollState.paidCount) : 0;
        const rerollLabel = rerollState.freeUsed ? `🔄 刷新獎勵 (💰${rerollCost})` : `🔄 免費刷新獎勵`;

        const rerollBtn = scene.add.text(300, 385, `[ ${rerollLabel} ]`, {
            fontSize: '14px', fill: '#66ccff', backgroundColor: '#222', padding: { x: 10, y: 5 }
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.onRerollClicked(scene, stageData, config, stageName));
        rewardContainer.add(rerollBtn);

        const skipBtn = scene.add.text(280, 425, '[ 🚫 跳過獎勵：換取 +50 金幣 & 恢復 5 HP ]', {
            fontSize: '14px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 10, y: 5 }
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              const goldBonusPct = scene.hero.goldGainBonus || 0;                    // 🔧 Stage 5後續修正
              const bonusGold = Math.round(50 * (1 + goldBonusPct / 100));           // 🔧 套用跟戰鬥勝利金幣一致的加成公式
              scene.hero.gold = (scene.hero.gold || 0) + bonusGold;
              scene.hero.hp = Math.min(scene.hero.maxHp, scene.hero.hp + 5);
              scene.appendLog(`🚫 跳過獎勵：獲得 +${bonusGold} 金幣，並恢復 5 HP`, 'system');
              rewardContainer.destroy();
              scene._rewardContainer = null;
              if (scene && typeof scene.nextStage === 'function') scene.nextStage();
          });
        rewardContainer.add(skipBtn);

        rewardContainer.setDepth(2000);
    }

    static onRewardChosen(scene, stageData, slot, batch) {
        const finalizeChoice = () => {
            this.handleCollectionProgress(scene, slot.category);
            scene._rewardChoicesRemaining -= 1;
            const remainingSlots = batch.filter(s => s !== slot);

            if (scene._rewardChoicesRemaining > 0 && remainingSlots.length > 0) {
                scene.appendLog(`🎁 獎勵已套用！還可以再選擇 ${scene._rewardChoicesRemaining} 項！`, 'system');
                this.renderRewardUI(scene, stageData, scene._rewardConfig, scene._rewardStageName, remainingSlots);
                return;
            }

            if (scene._rewardContainer) {
                scene._rewardContainer.destroy();
                scene._rewardContainer = null;
            }
            if (scene && typeof scene.nextStage === 'function') {
                scene.nextStage();
            }
        };

        // 🟢 新增：CARD 類且牌組已達上限時，先跳出替換選擇 UI，選完/放棄後才繼續原本流程
        const atCapacity = slot.category === 'CARD' &&
            scene.deckSys.originalDeck.length >= (scene.hero.deckCapacity || Infinity);

        if (atCapacity) {
            if (scene._rewardContainer) {
                scene._rewardContainer.destroy();
                scene._rewardContainer = null;
            }
            this.showCardReplacePicker(scene, slot.pendingCardDef, finalizeChoice);
            return;
        }

        slot.apply(scene);
        finalizeChoice();
    }

    // ----------------------------------------------------------------
    // 🟢 新增：牌組已達上限時，讓玩家選一張現有卡片替換成新卡（或放棄新卡）
    // ----------------------------------------------------------------
    static showCardReplacePicker(scene, newCardDef, onDone) {
        const container = scene.add.container(0, 0).setDepth(2000);
        scene._rewardContainer = container;

        const overlay = scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.92);
        const title = scene.add.text(60, 25,
            `🎴 牌組已達上限 (${scene.deckSys.originalDeck.length}/${scene.hero.deckCapacity})，請選一張現有卡片替換為 [${newCardDef.name}]：`,
            { fontSize: '13px', fill: '#ffcc00', wordWrap: { width: 730 } });
        container.add([overlay, title]);

        const deck = scene.deckSys.originalDeck;
        const perRow = 5;
        deck.forEach((card, idx) => {
            const col = idx % perRow;
            const row = Math.floor(idx / perRow);
            const x = 90 + col * 140;
            const y = 90 + row * 85;

            const cardBg = scene.add.rectangle(x, y, 120, 65, 0x222233)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true });
            const nameText = scene.add.text(x - 55, y - 25, card.name, { fontSize: '12px', fill: '#fff', wordWrap: { width: 110 } });

            cardBg.on('pointerdown', () => {
                deck.splice(idx, 1);
                deck.push(newCardDef);
                scene.appendLog(`🔄 以 [${newCardDef.name}] 替換掉 [${card.name}]！`, 'system');
                container.destroy();
                scene._rewardContainer = null;
                onDone();
            });

            container.add([cardBg, nameText]);
        });

        const cancelBtn = scene.add.text(320, 500, '[ 🚫 放棄這張新卡片 ]', {
            fontSize: '13px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 10, y: 5 }
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              scene.appendLog(`🚫 放棄了新卡片 [${newCardDef.name}]`, 'system');
              container.destroy();
              scene._rewardContainer = null;
              onDone();
          });
        container.add(cancelBtn);
    }

    static onRerollClicked(scene, stageData, config, stageName) {
        const rerollState = scene._rewardRerollState;

        if (!rerollState.freeUsed) {
            rerollState.freeUsed = true;
        } else {
            const cost = 20 + 5 * rerollState.paidCount;
            if ((scene.hero.gold || 0) < cost) {
                scene.appendLog(`⚠️ 金幣不足，無法刷新獎勵 (需要 ${cost} 金幣)`, 'system');
                return;
            }
            scene.hero.gold -= cost;
            rerollState.paidCount += 1;
        }

        const batch = this.generateRewardBatch(scene);   // 🟢 拿掉 extraChoices 參數
        this.renderRewardUI(scene, stageData, config, stageName, batch);
    }
}

// ----------------------------------------------------------------
// 內部工具：過濾出「已實作」的卡片獎勵（implemented !== false）
// ----------------------------------------------------------------
function REWARD_CARD_POOL_SAFE_FILTER() {
    return REWARD_CARD_POOL.filter(c => c.implemented !== false && !c.hidden);
}