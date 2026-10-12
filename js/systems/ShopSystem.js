import { REWARD_CARD_POOL, BLESSING_POOL, STAT_POOL } from '../data/rewardPoolData.js';
import { DeckSystem } from './DeckSystem.js';
import { EffectEngine } from './EffectEngine.js';
import { UIInteractionSystem } from './UIInteractionSystem.js';
import { SaveSystem } from './SaveSystem.js';
import { fullOverlay, CX, X, Y, S, px } from '../config/layout.js';

// 🟢 版面：座標沿用舊版 850x550 的設計值，統一用 X()/Y()/S()/px() 換算成 1920x1080。
// addButton 的 y 參數也是舊版座標（內部轉換）。

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
        const overlay = fullOverlay(scene, 0.94);
        const title = scene.add.text(CX, Y(55), '🔥 休息區', { fontSize: px(22), fill: '#ffcc00' }).setOrigin(0.5);
        const status = scene.add.text(CX, Y(115), `基礎休息：HP ${before} → ${after}\n💰 金幣：${gameState.hero.gold || 0}`, {
            fontSize: px(15), fill: '#ffffff', align: 'center', lineSpacing: S(8)
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
        const overlay = fullOverlay(scene, 0.94);
        const title = scene.add.text(CX, Y(42), '🛒 休息區商店', { fontSize: px(21), fill: '#ffcc00' }).setOrigin(0.5);
        const gold = scene.add.text(CX, Y(78), `💰 金幣：${gameState.hero.gold || 0}`, { fontSize: px(14), fill: '#00ffaa' }).setOrigin(0.5);
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
        container.add(fullOverlay(scene, 0.95));
        container.add(scene.add.text(CX, Y(38), `🎴 ${theme || '卡片'}：兩張一起購買或放棄`, {
            fontSize: px(17), fill: '#ffcc00', wordWrap: { width: S(760) }, align: 'center'
        }).setOrigin(0.5));
        container.add(scene.add.text(CX, Y(72), `💰 剩餘金幣：${gameState.hero.gold || 0}`, {
            fontSize: px(14), fill: '#00ffaa'
        }).setOrigin(0.5));

        cards.forEach((card, index) => {
            const x = X(315 + index * 220);
            const bg = scene.add.rectangle(x, Y(220), S(190), S(250), 0x222233).setStrokeStyle(S(2), 0x00ffff);
            const name = scene.add.text(x, Y(135), card.name, { fontSize: px(14), fill: '#ffffff', wordWrap: { width: S(165) }, align: 'center' }).setOrigin(0.5);
            const desc = scene.add.text(x, Y(235), card.desc || '', { fontSize: px(11), fill: '#bbbbbb', wordWrap: { width: S(160) }, align: 'center', lineSpacing: S(4) }).setOrigin(0.5);
            container.add([bg, name, desc]);
        });

        const buyButton = scene.add.text(CX, Y(380), `[ ✅ 一起購買（${price} 金幣） ]`, {
            fontSize: px(15), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(12), y: S(7) }
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
        container.add(fullOverlay(scene, 0.95));
        container.add(scene.add.text(CX, Y(42), title, { fontSize: px(17), fill: '#ffcc00', wordWrap: { width: S(760) }, align: 'center' }).setOrigin(0.5));
        container.add(scene.add.text(CX, Y(78), `💰 剩餘金幣：${gameState.hero.gold || 0}`, { fontSize: px(14), fill: '#00ffaa' }).setOrigin(0.5));
        choices.forEach((item, index) => {
            // 🔧 以畫面中心對稱排列（3 張時與舊版位置相同；1、2 張時也會置中）
            const x = X(425 + (index - (choices.length - 1) / 2) * 180);
            const bg = scene.add.rectangle(x, Y(245), S(160), S(250), 0x222233).setStrokeStyle(S(2), 0x00ffff).setInteractive({ useHandCursor: true });
            const name = scene.add.text(x, Y(155), item.name, { fontSize: px(14), fill: '#ffffff', wordWrap: { width: S(140) }, align: 'center' }).setOrigin(0.5);
            const text = scene.add.text(x, Y(245), desc(item), { fontSize: px(11), fill: '#bbbbbb', wordWrap: { width: S(135) }, align: 'center', lineSpacing: S(4) }).setOrigin(0.5);
            const button = scene.add.text(x, Y(340), `[ ${choices.length === 2 ? '購買' : '選擇'} ]`, { fontSize: px(13), fill: '#00ffaa' }).setOrigin(0.5);
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
        container.add(fullOverlay(scene, 0.95));
        container.add(scene.add.text(CX, Y(220), message, { fontSize: px(17), fill: '#ffffff', wordWrap: { width: S(650) }, align: 'center' }).setOrigin(0.5));
        this.addButton(scene, container, 425, '↩ 返回商店', '#66ccff', () => this.showShop(scene, gameState));
    }

    // y 為舊版座標
    static addButton(scene, container, y, label, color, onClick) {
        const button = scene.add.text(CX, Y(y), `[ ${label} ]`, { fontSize: px(15), fill: color, backgroundColor: '#222', padding: { x: S(12), y: S(7) }, wordWrap: { width: S(720) }, align: 'center' })
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