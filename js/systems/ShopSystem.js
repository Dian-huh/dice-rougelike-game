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
const PRICE_STEP = 10;
const CARD_REFRESH_BASE_PRICE = 10;

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
        scene._shopState = {
            card: 0, remove: 0, blessing: 0, stats: 0,
            cardRefresh: 0, blessingRefresh: 0, statsRefresh: 0
        };
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

        this.addButton(scene, container, 145, `🎴 買兩張新卡（${this.getPrice(scene, 'card')} 金幣）`, '#00ffaa', () => this.showCardOffer(scene, gameState));
        this.addButton(scene, container, 205, `🗑️ 移除一張卡片（${this.getPrice(scene, 'remove')} 金幣）`, '#ff9999', () => this.removeCard(scene, gameState));
        this.addButton(scene, container, 265, `🔱 隨機加護三選一（${this.getPrice(scene, 'blessing')} 金幣）`, '#d6a6ff', () => this.showBlessingOffer(scene, gameState));
        this.addButton(scene, container, 325, `✨ 隨機兩項數值 +1（${this.getPrice(scene, 'stats')} 金幣）`, '#ffe27a', () => this.showStatOffer(scene, gameState));
        this.addButton(scene, container, 405, '🚶 離開休息區', '#ffcc66', () => this.finishRest(scene));
    }

    static showCardOffer(scene, gameState) {
        const cards = pickDistinct(REWARD_CARD_POOL, 2);
        const theme = cards[0] && cards[0].theme;
        const sameThemeCards = REWARD_CARD_POOL.filter(card => card.theme === theme && card.implemented !== false && !card.hidden);
        const offer = pickDistinct(sameThemeCards, 2);
        const price = this.getPrice(scene, 'card');
        this.showCardBundleUI(scene, gameState, theme, offer, price);
    }

    static showCardBundleUI(scene, gameState, theme, cards, price) {
        this.destroyUI(scene);
        const container = scene.add.container(0, 0).setDepth(2100);
        scene._restContainer = container;
        container.add(scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.95).setInteractive());
        container.add(scene.add.text(425, 38, `🎴 ${theme || '卡片'}：兩張一起購買或放棄`, {
            fontSize: '17px', fill: '#ffcc00', wordWrap: { width: 760 }, align: 'center'
        }).setOrigin(0.5));
        container.add(scene.add.text(425, 72, `💰 剩餘金幣：${gameState.hero.gold || 0}`, {
            fontSize: '14px', fill: '#00ffaa'
        }).setOrigin(0.5));

        cards.forEach((card, index) => {
            const x = 315 + index * 220;
            const bg = scene.add.rectangle(x, 220, 190, 250, 0x222233).setStrokeStyle(2, 0x00ffff);
            const name = scene.add.text(x, 135, card.name, { fontSize: '14px', fill: '#ffffff', wordWrap: { width: 165 }, align: 'center' }).setOrigin(0.5);
            const desc = scene.add.text(x, 235, card.desc || '', { fontSize: '11px', fill: '#bbbbbb', wordWrap: { width: 160 }, align: 'center', lineSpacing: 4 }).setOrigin(0.5);
            container.add([bg, name, desc]);
        });

        const buyButton = scene.add.text(425, 380, `[ ✅ 一起購買（${price} 金幣） ]`, {
            fontSize: '15px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 12, y: 7 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            const deck = gameState.deckSys.originalDeck;
            if (!this.canPay(gameState, price)) {
                this.showMessage(scene, gameState, '💰 金幣不足，無法購買這兩張卡片。');
                return;
            }
            if (deck.length + cards.length > (gameState.hero.deckCapacity || Infinity)) {
                this.showMessage(scene, gameState, '🎴 牌組至少需要兩個空位，才能一起購買這兩張卡片。');
                return;
            }
            cards.forEach(card => deck.push(DeckSystem.instantiateCardDef(card)));
            gameState.hero.gold -= price;
            scene._shopState.card += 1;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
        });
        container.add(buyButton);

        const refreshPrice = this.getRefreshPrice(scene);
        this.addButton(scene, container, 430, `🔄 刷新兩張卡（${refreshPrice} 金幣）`, '#66ccff', () => {
            if (!this.canPay(gameState, refreshPrice)) {
                this.showMessage(scene, gameState, '💰 金幣不足，無法刷新卡片。');
                return;
            }
            gameState.hero.gold -= refreshPrice;
            scene._shopState.cardRefresh += 1;
            SaveSystem.save(gameState);
            this.showCardOffer(scene, gameState);
        });
        this.addButton(scene, container, 480, '🚫 放棄購買', '#ff9999', () => this.showShop(scene, gameState));
    }

    static removeCard(scene, gameState) {
        const deck = gameState.deckSys.originalDeck;
        const price = this.getPrice(scene, 'remove');
        if (deck.length <= 3) {
            this.showMessage(scene, gameState, '牌組至少要保留 3 張卡片。');
            return;
        }
        const picker = UIInteractionSystem.createDeckPickerSession(scene, deck, `🗑️ 選擇要移除的卡片（${price} 金幣，剩餘 ${gameState.hero.gold || 0} 金幣）：`, (idx, card) => {
            if (!this.canPay(gameState, price)) return this.showShop(scene, gameState);
            deck.splice(idx, 1);
            gameState.hero.gold -= price;
            scene._shopState.remove += 1;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
        }, () => this.showShop(scene, gameState), '[ 🚫 不移除 ]');
        picker.show();
    }

    static showBlessingOffer(scene, gameState) {
        const choices = pickDistinct(BLESSING_POOL, 3);
        const price = this.getPrice(scene, 'blessing');
        this.showChoiceUI(scene, gameState, `🔱 選擇一項加護（${price} 金幣）`, choices, blessing => {
            if (!this.canPay(gameState, price)) return false;
            EffectEngine.addStacks(gameState.hero, blessing.id, 1);
            gameState.hero.gold -= price;
            scene._shopState.blessing += 1;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
            return true;
        }, item => item.desc(), 'blessing');
    }

    static showStatOffer(scene, gameState) {
        const choices = pickDistinct(STAT_POOL, 2);
        const price = this.getPrice(scene, 'stats');
        this.showChoiceUI(scene, gameState, `✨ 購買後兩項數值都會 +1（${price} 金幣）`, choices, () => {
            if (!this.canPay(gameState, price)) return false;
            const adapter = { hero: gameState.hero, appendLog: () => {} };
            choices.forEach(stat => stat.apply(adapter, 1));
            gameState.hero.gold -= price;
            scene._shopState.stats += 1;
            SaveSystem.save(gameState);
            this.showShop(scene, gameState);
            return true;
        }, item => item.desc(1), 'stats');
    }

    static showChoiceUI(scene, gameState, title, choices, onChoose, desc = item => item.desc, refreshType = null) {
        this.destroyUI(scene);
        const container = scene.add.container(0, 0).setDepth(2100);
        scene._restContainer = container;
        container.add(scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.95).setInteractive());
        container.add(scene.add.text(425, 42, title, { fontSize: '17px', fill: '#ffcc00', wordWrap: { width: 760 }, align: 'center' }).setOrigin(0.5));
        container.add(scene.add.text(425, 78, `💰 剩餘金幣：${gameState.hero.gold || 0}`, { fontSize: '14px', fill: '#00ffaa' }).setOrigin(0.5));
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
        if (refreshType) {
            const refreshPrice = this.getRefreshPrice(scene, refreshType);
            this.addButton(scene, container, 425, `🔄 刷新內容（${refreshPrice} 金幣）`, '#66ccff', () => {
                if (!this.canPay(gameState, refreshPrice)) {
                    this.showMessage(scene, gameState, '💰 金幣不足，無法刷新內容。');
                    return;
                }
                gameState.hero.gold -= refreshPrice;
                scene._shopState[`${refreshType}Refresh`] += 1;
                SaveSystem.save(gameState);
                if (refreshType === 'blessing') this.showBlessingOffer(scene, gameState);
                else this.showStatOffer(scene, gameState);
            });
        }
        this.addButton(scene, container, 480, '↩ 返回商店', '#66ccff', () => this.showShop(scene, gameState));
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

    static getPrice(scene, type) {
        const count = scene._shopState ? scene._shopState[type] || 0 : 0;
        return SHOP_PRICES[type] + count * PRICE_STEP;
    }

    static getRefreshPrice(scene, type = 'card') {
        const countKey = type === 'card' ? 'cardRefresh' : `${type}Refresh`;
        const count = scene._shopState ? scene._shopState[countKey] || 0 : 0;
        return CARD_REFRESH_BASE_PRICE + count * PRICE_STEP;
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