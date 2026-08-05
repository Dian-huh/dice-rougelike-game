export class DeckSystem {
    constructor(initialDeck) {
        this.originalDeck = initialDeck;
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

    fillHandToMax(maxMana) {
        while (this.hand.length < maxMana && (this.drawPile.length > 0 || this.discardPile.length > 0)) {
            this.drawCard();
        }
    }

    playCard(index) {
        const card = this.hand[index];
        this.hand.splice(index, 1);
        this.discardPile.push(card);
        return card;
    }
}