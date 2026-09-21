// js/data/eventData.js
import { REWARD_CARD_POOL } from './rewardPoolData.js';
import { DeckSystem } from '../systems/DeckSystem.js';
import { UIInteractionSystem } from '../systems/UIInteractionSystem.js';

// ------------------------------------------------------------
// 事件寫法約定：
//   action(hero, log, ctx)：可回傳字串，或回傳 Promise<字串>（需要等玩家操作時用 async）
//   ctx = { scene, gameState, deckSys }
//   condition(hero, gameState)：選填，回傳 false 時此事件不會被抽到
//   HP 代價一律用 pctOfMaxHp()，避免不同角色血量差距過大
// ------------------------------------------------------------
function pctOfMaxHp(hero, pct) {
    return Math.max(1, Math.round(hero.maxHp * pct));
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 開啟選卡器，回傳 Promise：選了卡 -> { idx, card }；取消 -> null
function pickCardFromDeck(ctx, title, cancelLabel) {
    return new Promise(resolve => {
        const session = UIInteractionSystem.createDeckPickerSession(
            ctx.scene, ctx.deckSys.originalDeck, title,
            (idx, card) => resolve({ idx, card }),
            () => resolve(null),
            cancelLabel
        );
        session.show();
    });
}

export const EVENT_DATABASE = [
    {
        id: 'mystic_shrine',
        title: '⛩️ 神秘的血之祭壇',
        desc: '你在荒野中發現一座散發著古老微光的黑石祭壇，上面刻著「獻出鮮血，換取力量」。',
        options: [
            {
                text: '🩸 獻出 25% 最大血量 (至少 1 點)，基礎攻擊力 +2',
                action: (hero) => {
                    const cost = pctOfMaxHp(hero, 0.25);
                    hero.hp = Math.max(1, hero.hp - cost);
                    hero.atk += 2;
                    return `你將鮮血滴入祭壇，體內湧現強大的力量！(HP-${cost}, 基礎攻擊力+2)`;
                }
            },
            {
                text: '💰 獻出 20 金幣，回復 10 點血量',
                action: (hero) => {
                    if ((hero.gold || 0) < 20) return `⚠️ 金幣不足 20，祭壇毫無反應...`;
                    hero.gold -= 20;
                    hero.hp = Math.min(hero.maxHp, hero.hp + 10);
                    return `祭壇吞下了金幣，溫暖的光芒治癒了你的傷口。(金幣-20, HP+10)`;
                }
            },
            {
                text: '🏃 默默離開',
                action: () => `你決定不冒險，轉身離開了祭壇。`
            }
        ]
    },
    {
        id: 'wandering_merchant',
        title: '🎲 賭徒的骰子遊戲',
        desc: '一名戴著面具的流浪賭徒攔住了你：「嘿朋友，要來擲個骰子博一把嗎？」',
        options: [
            {
                text: '🎲 支付 15 金幣賭一把 (50% 爆擊增益+2 / 50% 什麼都沒拿到)',
                action: (hero) => {
                    if ((hero.gold || 0) < 15) return `⚠️ 金幣不足 15，賭徒不理你了。`;
                    hero.gold -= 15;
                    if (Math.random() > 0.5) {
                        hero.critBonus += 2;
                        return `🎯 運氣大爆發！你贏得了骰子對決！(爆擊增益+2)`;
                    }
                    return `💸 哎呀，你輸光了賭註... (金幣-15)`;
                }
            },
            {
                text: '👋 婉拒離開',
                action: () => `你握緊了錢包，頭也不回地離開了。`
            }
        ]
    },
    {
        id: 'abandoned_pack',
        title: '🎒 廢棄的行囊',
        desc: '路邊倒著一只被遺棄的行囊，最上層擺著一袋看得見的錢，底下似乎還藏著別的東西。',
        options: [
            {
                text: '🔍 仔細搜索 (60% 獲得 30~60 金幣 / 30% 一無所獲 / 10% 觸發陷阱，損失 20% 最大血量)',
                action: (hero) => {
                    const r = Math.random();
                    if (r < 0.6) {
                        const gold = randInt(30, 60);
                        hero.gold = (hero.gold || 0) + gold;
                        return `你在行囊底層翻出了一袋錢！(金幣+${gold})`;
                    }
                    if (r < 0.9) {
                        return `你翻遍了行囊，裡面空空如也...`;
                    }
                    const dmg = pctOfMaxHp(hero, 0.2);
                    hero.hp = Math.max(1, hero.hp - dmg);
                    return `💥 行囊裡藏著陷阱！(HP-${dmg})`;
                }
            },
            {
                text: '💰 直接拿走上層的錢袋 (金幣 +20)',
                action: (hero) => {
                    hero.gold = (hero.gold || 0) + 20;
                    return `你拿走了最上面的錢袋，沒有多看其他東西。(金幣+20)`;
                }
            },
            {
                text: '🏃 離開',
                action: () => `你覺得這只行囊來路不明，繞過它繼續前進。`
            }
        ]
    },
    {
        id: 'fallen_monk',
        title: '🙏 落魄的僧侶',
        desc: '一位衣衫破舊的僧侶坐在路旁：「施主，貧僧能為你淨化行囊中的雜念，或為你祈福療傷。」',
        condition: (hero, gameState) => !!gameState.deckSys && gameState.deckSys.originalDeck.length > 3,
        options: [
            {
                text: '🗑️ 支付 25 金幣，移除牌組中的一張卡片',
                action: async (hero, log, ctx) => {
                    if ((hero.gold || 0) < 25) return `⚠️ 金幣不足 25，僧侶搖了搖頭...`;
                    const deck = ctx.deckSys.originalDeck;
                    if (deck.length <= 3) return `⚠️ 你的牌組已經太精簡，沒有能再淨化的卡片了。`;

                    const picked = await pickCardFromDeck(ctx, '🗑️ 請選擇要移除的卡片：', '[ 🚫 改變主意了 ]');
                    if (!picked) return `你改變了主意，僧侶微笑著目送你離開。`;

                    deck.splice(picked.idx, 1);
                    hero.gold -= 25;
                    return `僧侶為 [${picked.card.name}] 誦經淨化，這張卡從你的牌組中消失了。(金幣-25)`;
                }
            },
            {
                text: '🙏 請僧侶祈福，回復 30% 最大血量',
                action: (hero) => {
                    const heal = pctOfMaxHp(hero, 0.3);
                    const before = hero.hp;
                    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
                    return `溫暖的光芒籠罩著你。(HP ${before} → ${hero.hp})`;
                }
            },
            {
                text: '🏃 默默離開',
                action: () => `你向僧侶點頭致意，繼續趕路。`
            }
        ]
    },
    {
        id: 'blacksmith',
        title: '⚒️ 荒野鐵匠鋪',
        desc: '一間簡陋的鐵匠鋪冒著爐火，鐵匠頭也不抬地說：「要磨刀還是強化？價錢好商量。」',
        condition: (hero) => (hero.gold || 0) >= 30,
        options: [
            {
                text: '⚒️ 支付 30 金幣：基礎攻擊力 +1',
                action: (hero) => {
                    if ((hero.gold || 0) < 30) return `⚠️ 金幣不足 30，鐵匠冷冷地看了你一眼。`;
                    hero.gold -= 30;
                    hero.atk += 1;
                    return `鐵匠替你磨利了武器。(金幣-30, 基礎攻擊力+1)`;
                }
            },
            {
                text: '🔥 支付 50 金幣：爆擊增益 +2',
                action: (hero) => {
                    if ((hero.gold || 0) < 50) return `⚠️ 金幣不足 50，鐵匠冷冷地看了你一眼。`;
                    hero.gold -= 50;
                    hero.critBonus += 2;
                    return `鐵匠替你的武器淬火強化。(金幣-50, 爆擊增益+2)`;
                }
            },
            {
                text: '🏃 默默離開',
                action: () => `你摸了摸錢包，決定下次再來。`
            }
        ]
    },
    {
        id: 'lost_traveler',
        title: '🧭 迷途的旅人',
        desc: '一名風塵僕僕的旅人向你求助：「我迷路了，身上的盤纏也用完了。能給我一點錢嗎？我會用身上的東西報答你。」',
        options: [
            {
                text: '🤝 給他 10 金幣，獲得一張隨機卡片 (牌組已滿時可選一張替換)',
                action: async (hero, log, ctx) => {
                    if ((hero.gold || 0) < 10) return `⚠️ 金幣不足 10，旅人失望地離開了。`;

                    const pool = REWARD_CARD_POOL.filter(c => c.implemented !== false && !c.hidden);
                    if (pool.length === 0) return `旅人翻遍了行囊，卻什麼也拿不出來...`;

                    const newCard = DeckSystem.instantiateCardDef(Phaser.Utils.Array.GetRandom(pool));
                    const deck = ctx.deckSys.originalDeck;

                    if (deck.length >= (hero.deckCapacity || Infinity)) {
                        const picked = await pickCardFromDeck(
                            ctx,
                            `🎴 牌組已達上限，請選一張卡片替換為 [${newCard.name}]：`,
                            '[ 🚫 婉拒這份謝禮 ]'
                        );
                        if (!picked) return `你婉拒了旅人的謝禮，他感激地道謝後離去。`;
                        deck.splice(picked.idx, 1);
                        deck.push(newCard);
                        hero.gold -= 10;
                        return `旅人贈與你 [${newCard.name}]，替換掉了 [${picked.card.name}]。(金幣-10)`;
                    }

                    deck.push(newCard);
                    hero.gold -= 10;
                    return `旅人贈與你一張卡片：[${newCard.name}]！(金幣-10)`;
                }
            },
            {
                text: '🚶 無視他，繼續趕路',
                action: () => `你沒有停下腳步，旅人的身影漸漸消失在身後。`
            }
        ]
    }
];