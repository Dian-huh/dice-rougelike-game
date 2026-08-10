import {
    REWARD_POOL_DATA,
    REWARD_CATEGORY_NAMES,
    COLLECTION_MILESTONES,
    REWARD_CARD_POOL
} from '../data/RewardPooldata.js';

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

        // 🟢 基本金幣獎勵，套用「金幣獲得量UP」百分比加成
        if (config.baseGold) {
            const goldBonusPct = scene.hero.goldGainBonus || 0;
            const finalGold = Math.round(config.baseGold * (1 + goldBonusPct / 100));
            scene.hero.gold = (scene.hero.gold || 0) + finalGold;
        }

        // 🟢 消耗「下次勝利獎勵可選數量+1」的一次性加成（只在進入畫面時判定一次，
        //    reroll 時沿用同一個 extraChoices，不會重複疊加）
        const extraChoices = scene.hero.nextRewardChoiceBonus || 0;
        scene.hero.nextRewardChoiceBonus = 0;
        scene._rewardExtraChoices = extraChoices;

        // 每次開啟獎勵畫面重置 reroll 狀態
        scene._rewardRerollState = { freeUsed: false, paidCount: 0 };
        scene._rewardPrevCategories = null;

        const batch = this.generateRewardBatch(scene, extraChoices);
        this.renderRewardUI(scene, stageData, config, stageName, batch);
    }

    // ----------------------------------------------------------------
    // 抽獎核心：決定本次要出現的 N 組獎勵（N = 3 + extraChoices）
    // ----------------------------------------------------------------
    static generateRewardBatch(scene, extraChoices = 0) {
        const slotCount = Math.min(ALL_CATEGORIES.length, 3 + (extraChoices || 0));
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
            // 🟢 目前先只從「已實作」的卡片中抽，未實作的（大撒幣/神聖的導引/甘霖/天罰/
            //    贗品/獵龍斬擊/哥布林殺手/盾反）等第5階段引擎擴充完成後再放開篩選。
            const implementedCards = REWARD_CARD_POOL_SAFE_FILTER();
            const [cardDef] = this.weightedSampleWithoutReplacement(implementedCards, 1);
            return {
                category,
                title: `${catLabel} [卡牌] ${cardDef.name}`,
                desc: `(${cardDef.cost}費) ${cardDef.desc}`,
                apply: (s) => {
                    // TODO 第3階段：這裡要先檢查 s.deckSys.originalDeck.length 是否已達
                    //    s.hero.deckCapacity 上限，達到上限的話要跳出「選一張現有卡刪除」的
                    //    互動流程，而不是直接 push 新卡。
                    const newCard = {
                        id: `reward_${cardDef.id}_${Date.now()}`,
                        name: cardDef.name,
                        cost: cardDef.cost,
                        desc: cardDef.desc,
                        scope: cardDef.scope,
                        onPlay: cardDef.onPlay
                    };
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

        const slotCount = batch.length;
        const totalWidth = slotCount * 200 + (slotCount - 1) * 20;
        const startX = 425 - totalWidth / 2 + 100;

        batch.forEach((slot, index) => {
            const x = startX + index * 220;

            const cardBg = scene.add.rectangle(x, 235, 200, 190, 0x222233)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.onRewardChosen(scene, stageData, slot));

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

        // 跳過獎勵按鈕
        const skipBtn = scene.add.text(280, 425, '[ 🚫 跳過獎勵：換取 +20 金幣 & 恢復 5 HP ]', {
            fontSize: '14px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 10, y: 5 }
        }).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              scene.hero.gold = (scene.hero.gold || 0) + 20;
              scene.hero.hp = Math.min(scene.hero.maxHp, scene.hero.hp + 5);
              scene.appendLog(`🚫 跳過獎勵：獲得 +20 金幣，並恢復 5 HP`, 'system');
              rewardContainer.destroy();
              scene._rewardContainer = null;
              if (scene && typeof scene.nextStage === 'function') scene.nextStage();
          });
        rewardContainer.add(skipBtn);

        rewardContainer.setDepth(2000);
    }

    static onRewardChosen(scene, stageData, slot) {
        slot.apply(scene);
        this.handleCollectionProgress(scene, slot.category);

        if (scene._rewardContainer) {
            scene._rewardContainer.destroy();
            scene._rewardContainer = null;
        }

        if (scene && typeof scene.nextStage === 'function') {
            scene.nextStage();
        }
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

        const batch = this.generateRewardBatch(scene, scene._rewardExtraChoices || 0);
        this.renderRewardUI(scene, stageData, config, stageName, batch);
    }
}

// ----------------------------------------------------------------
// 內部工具：過濾出「已實作」的卡片獎勵（implemented !== false）
// ----------------------------------------------------------------
function REWARD_CARD_POOL_SAFE_FILTER() {
    return REWARD_CARD_POOL.filter(c => c.implemented !== false);
}