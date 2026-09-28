import { REWARD_CARD_POOL, BLESSING_POOL, STAT_POOL } from '../data/rewardPoolData.js';
import { DeckSystem } from './DeckSystem.js';
import { EffectEngine } from './EffectEngine.js';
import { UIInteractionSystem } from './UIInteractionSystem.js';
import { SaveSystem } from './SaveSystem.js';

const SHOP_PRICES = {
    card: 30,
    remove: 25,
    blessing: 40,
    stats: 35
};

function pickDistinct(pool, count) {
    const available = pool.filter(item => item.implemented !== false && !item.hidden);
    const result = [];
    while (available.length > 0 && result.length < count) {
        const index = Math.floor(Math.random() * available.length);
        result.push(available.splice(index, 1)[0]);
    }
    return result;
}

export class ShopSystem {
    static enterRest(scene, node, gameState) {
        const before = gameState.hero.hp;
        gameState.hero.hp = Math.min(gameState.hero.maxHp, before + 15);
        SaveSystem.save(gameState);
        scene._restNode = node;
        scene._restLargeHealUsed = false;
        scene._restChoiceMade = false;
        scene._restContainer = null;
        this.showRestMenu(scene, gameState, before, gameState.hero.hp);
    }

    static showRestMenu(scene, gameState, before, after) {
        this.destroyUI(scene);
        const container = scene.add.container(0, 0).setDepth(2000);
        scene._restContainer = container;
        const overlay = scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.94).setInteractive();
        const title = scene.add.text(425, 55, '🔥 休息區', { fontSize: '22px', fill: '#ffcc00' }).setOrigin(0.5);
        const status = scene.add.text(425, 115, `基礎休息：HP ${before} → ${after}\n💰 金幣：${gameState.hero.gold || 0}`, {
            fontSize: '15px', fill: '#ffffff', align: 'center', lineSpacing: 8
        }).setOrigin(0.5);
        container.add([overlay, title, status]);

        this.addButton(scene, container, 220, '🛒 進入商店', '#00ffaa', () => {
            scene._restChoiceMade = true;
            this.showShop(scene, gameState);
        });
        this.addButton(scene, container, 285, '💚 大量回血（回復 50% 最大 HP）', '#66ccff', () => {
            const heal = Math.ceil(gameState.hero.maxHp * 0.5);
            const oldHp = gameState.hero.hp;
            gameState.hero.hp = Math.min(gameState.hero.maxHp, oldHp + heal);
            scene._restLargeHealUsed = true;
            scene._restChoiceMade = true;
            SaveSystem.save(gameState);
            this.finishRest(scene);
        });
        this.addButton(scene, container, 350, '🚶 離開休息區', '#ffcc66', () => this.finishRest(scene));
    }

    static showShop(scene, gameState) {
        this.destroyUI(scene);
        const container = scene.add.container(0, 0).setDepth(2000);
        scene._restContainer = container;
        const overlay = scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.94).setInteractive();
        const title = scene.add.text(425, 42, '🛒 休息區商店', { fontSize: '21px', fill: '#ffcc00' }).setOrigin(0.5);
        const gold = scene.add.text(425, 78, `💰 金幣：${gameState.hero.gold || 0}`, { fontSize: '14px', fill: '#00ffaa' }).setOrigin(0.5);
        container.add([overlay, title, gold]);

        this.addButton(scene, container, 145, `🎴 買新卡（${SHOP_PRICES.card} 金幣）`, '#00ffaa', () => this.showCardOffer(scene, gameState));
        this.addButton(scene, container, 205, `🗑️ 移除一張卡片（${SHOP_PRICES.remove} 金幣）`, '#ff9999', () => this.removeCard(scene, gameState));
        this.addButton(scene, container, 265, `🔱 隨機加護三選一（${SHOP_PRICES.blessing} 金幣）`, '#d6a6ff', () => this.showBlessingOffer(scene, gameState));
        this.addButton(scene, container, 325, `✨ 隨機兩項數值 +1（${SHOP_PRICES.stats} 金幣）`, '#ffe27a', () => this.showStatOffer(scene, gameState));
        this.addButton(scene, container, 405, '🚶 離開休息區', '#ffcc66', () => this.finishRest(scene));
    }

    static showCardOffer(scene, gameState) {
        const cards = pickDistinct(REWARD_CARD_POOL, 2);
        const theme = cards[0] && cards[0].theme;
        const sameThemeCards = REWARD_CARD_POOL.filter(card => card.theme === theme && card.implemented !== false && !card.hidden);
        const offer = pickDistinct(sameThemeCards, 2);
        this.showChoiceUI(scene, gameState, `🎴 ${theme || '卡片'}：請先看清楚，再決定是否購買`, offer, card => {
            if (!this.canPay(gameState, SHOP_PRICES.card)) return false;
            const newCard = DeckSystem.instantiateCardDef(card);
            const deck = gameState.deckSys.originalDeck;
            const buy = () => {
                deck.push(newCard);
                gameState.hero.gold -= SHOP_PRICES.card;
                SaveSystem.save(gameState);
                this.showShop(scene, gameState);
            };
            if (deck.length >= (gameState.hero.deckCapacity || Infinity)) {
                const picker = UIInteractionSystem.createDeckPickerSession(scene, deck,
                    `🎴 牌組已滿，選一張卡片替換為 [${newCard.name}]：`,
                    (idx) => { deck.splice(idx, 1); buy(); },
                    () => this.showCardOffer(scene, gameState), '[ 🚫 放棄購買 ]');
                picker.show();
                return 'deferred';
            }
            buy();
            return true;
        });
    }

    static removeCard(scene, gameState) {
        const deck = gameState.deckSys.originalDeck;
        if (deck.length <= 3) {
            this.showMessage(scene, gameState, '牌組至少要保留 3 張卡片。');
            return;
        }
        const picker = UIInteractionSystem.createDeckPickerSession(scene, deck, `🗑️ 選擇要移除的卡片（${SHOP_PRICES.remove} 金幣）：`, (idx, card) => {
            if (!this.canPay(gameState, SHOP_PRICES.remove)) return this.showShop(scene, gameState);
            deck.splice(idx, 1);
            gameState.hero.gold -= SHOP_PRICES.remove;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
        }, () => this.showShop(scene, gameState), '[ 🚫 不移除 ]');
        picker.show();
    }

    static showBlessingOffer(scene, gameState) {
        const choices = pickDistinct(BLESSING_POOL, 3);
        this.showChoiceUI(scene, gameState, `🔱 選擇一項加護（${SHOP_PRICES.blessing} 金幣）`, choices, blessing => {
            if (!this.canPay(gameState, SHOP_PRICES.blessing)) return false;
            EffectEngine.addStacks(gameState.hero, blessing.id, 1);
            gameState.hero.gold -= SHOP_PRICES.blessing;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
            return true;
        }, item => item.desc());
    }

    static showStatOffer(scene, gameState) {
        const choices = pickDistinct(STAT_POOL, 2);
        this.showChoiceUI(scene, gameState, `✨ 購買後兩項數值都會 +1（${SHOP_PRICES.stats} 金幣）`, choices, () => {
            if (!this.canPay(gameState, SHOP_PRICES.stats)) return false;
            const adapter = { hero: gameState.hero, appendLog: () => {} };
            choices.forEach(stat => stat.apply(adapter, 1));
            gameState.hero.gold -= SHOP_PRICES.stats;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
            return true;
        }, item => item.desc(1));
    }

    static showChoiceUI(scene, gameState, title, choices, onChoose, desc = item => item.desc) {
        this.destroyUI(scene);
        const container = scene.add.container(0, 0).setDepth(2100);
        scene._restContainer = container;
        container.add(scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.95).setInteractive());
        container.add(scene.add.text(425, 42, title, { fontSize: '17px', fill: '#ffcc00', wordWrap: { width: 760 }, align: 'center' }).setOrigin(0.5));
        choices.forEach((item, index) => {
            const x = choices.length === 1 ? 425 : 245 + index * 180;
            const bg = scene.add.rectangle(x, 245, 160, 250, 0x222233).setStrokeStyle(2, 0x00ffff).setInteractive({ useHandCursor: true });
            const name = scene.add.text(x, 155, item.name, { fontSize: '14px', fill: '#ffffff', wordWrap: { width: 140 }, align: 'center' }).setOrigin(0.5);
            const text = scene.add.text(x, 245, desc(item), { fontSize: '11px', fill: '#bbbbbb', wordWrap: { width: 135 }, align: 'center', lineSpacing: 4 }).setOrigin(0.5);
            const button = scene.add.text(x, 340, `[ ${choices.length === 2 ? '購買' : '選擇'} ]`, { fontSize: '13px', fill: '#00ffaa' }).setOrigin(0.5);
            bg.on('pointerdown', () => {
                const result = onChoose(item);
                if (result === false) this.showMessage(scene, gameState, '💰 金幣不足，無法購買。');
            });
            container.add([bg, name, text, button]);
        });
        this.addButton(scene, container, 425, '↩ 返回商店', '#66ccff', () => this.showShop(scene, gameState));
    }

    static showMessage(scene, gameState, message) {
        this.destroyUI(scene);
        const container = scene.add.container(0, 0).setDepth(2200);
        scene._restContainer = container;
        container.add(scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.95).setInteractive());
        container.add(scene.add.text(425, 220, message, { fontSize: '17px', fill: '#ffffff', wordWrap: { width: 650 }, align: 'center' }).setOrigin(0.5));
        this.addButton(scene, container, 425, '↩ 返回商店', '#66ccff', () => this.showShop(scene, gameState));
    }

    static addButton(scene, container, y, label, color, onClick) {
        const button = scene.add.text(425, y, `[ ${label} ]`, { fontSize: '15px', fill: color, backgroundColor: '#222', padding: { x: 12, y: 7 }, wordWrap: { width: 720 }, align: 'center' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
        container.add(button);
    }

    static canPay(gameState, price) {
        return (gameState.hero.gold || 0) >= price;
    }

    static destroyUI(scene) {
        if (scene._restContainer) {
            scene._restContainer.destroy();
            scene._restContainer = null;
        }
    }

    static finishRest(scene) {
        this.destroyUI(scene);
        const node = scene._restNode;
        scene._restNode = null;
        scene.afterNodeCompleted(node);
    }
}