export class DeckSystem {
    constructor(initialDeck) {
        this.originalDeck = [...initialDeck];
        this.drawPile = [];
        this.hand = [];
        this.discardPile = [];
        this.init();
    }

    init() {
        // 深拷貝並進行【隨機洗牌】
        this.drawPile = [...this.originalDeck];
        this.shuffle(this.drawPile);
        this.hand = [];
        this.discardPile = [];
    }

    // 🟢 新增：每場戰鬥開始時呼叫，把手牌、抽牌堆、棄牌堆全部收回，
    // 依「當前擁有的完整收藏」(originalDeck，含永久獲得的新卡) 重新洗牌
    // 與建構子的 init() 邏輯相同，但語意上代表「戰鬥重置」而非「存檔初始化」
    resetForNewBattle() {
        this.init();
    }

    // 費雪-耶茲 (Fisher-Yates) 隨機洗牌演算法
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    drawCard() {
        if (this.drawPile.length === 0) {
            if (this.discardPile.length === 0) return null; // 沒牌可抽
            // 棄牌堆洗回抽牌堆
            this.drawPile = [...this.discardPile];
            this.discardPile = [];
            this.shuffle(this.drawPile);
        }
        const card = this.drawPile.pop();
        this.hand.push(card);
        return card;
    }

    // 🟢 Stage 5-4 新增：依詞條(tag)篩選抽牌，優先找抽牌堆，找不到再找棄牌堆
    // 找不到就回傳 null（不消耗任何動作、不洗牌），由呼叫端決定要不要顯示「抽取失敗」提示
    drawCardByTag(tag) {
        let idx = this.drawPile.findIndex(c => (c.tags || []).includes(tag));
        if (idx !== -1) {
            const card = this.drawPile.splice(idx, 1)[0];
            this.hand.push(card);
            return card;
        }

        idx = this.discardPile.findIndex(c => (c.tags || []).includes(tag));
        if (idx !== -1) {
            const card = this.discardPile.splice(idx, 1)[0];
            this.hand.push(card);
            return card;
        }

        return null; // 抽牌堆與棄牌堆都沒有帶該詞條的卡
    }

    fillHandToMax(maxMana) {
        while (this.hand.length < maxMana && (this.drawPile.length > 0 || this.discardPile.length > 0)) {
            this.drawCard();
        }
    }

    // 🟢 階段4新增：統一的「從卡片定義建立卡片實例」工廠方法。
    // 取代 RewardSystem.createRewardSlot / DebugSystem.giveCard 原本各自重複的實例建構邏輯，
    // 未來卡片實例欄位若要調整，只需要改這裡一處。
    static instantiateCardDef(cardDef) {
        return {
            id: `reward_${cardDef.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: cardDef.name,
            cost: cardDef.cost,
            getCost: cardDef.getCost,
            tags: cardDef.tags || [],
            desc: cardDef.desc,
            scope: cardDef.scope,
            onPlay: cardDef.onPlay,
            burnout: cardDef.burnout || false,   // 🟢 燃盡標記需要跟著複製
            __source: 'reward',
            __defId: cardDef.id
        };
    }

    // 🟢 階段4新增：讓卡片效果（拔刀術連鎖）可以直接把卡片實例塞進手牌
    addCardToHand(cardInstance) {
        this.hand.push(cardInstance);
    }

    playCard(index) {
        const card = this.hand[index];
        this.hand.splice(index, 1);
        // 🟢 階段4新增：帶 burnout 標記的卡片使用後直接銷毀，不進棄牌堆循環
        if (!card.burnout) {
            this.discardPile.push(card);
        }
        return card;
    }

    // 查看用：把 originalDeck 依卡片名稱分組計數，供「查看牌組」面板使用
    getCollectionSummary() {
        const groups = [];
        const indexByName = new Map();
        this.originalDeck.forEach(card => {
            if (indexByName.has(card.name)) {
                groups[indexByName.get(card.name)].count += 1;
            } else {
                indexByName.set(card.name, groups.length);
                groups.push({ card, count: 1 });
            }
        });
        return groups;
    }

}