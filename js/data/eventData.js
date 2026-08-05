export const EVENT_DATABASE = [
    {
        id: 'mystic_shrine',
        title: '⛩️ 神秘的血之祭壇',
        desc: '你在荒野中發現一座散發著古老微光的黑石祭壇，上面刻著「獻出鮮血，換取力量」。',
        options: [
            {
                text: '🩸 獻出 5 點血量，基礎攻擊力 +2',
                action: (hero, log) => {
                    hero.hp = Math.max(1, hero.hp - 5);
                    hero.atk += 2;
                    return `你將鮮血滴入祭壇，體內湧現強大的力量！(HP-5, 基礎攻擊力+2)`;
                }
            },
            {
                text: '💰 獻出 20 金幣，回復 10 點血量',
                action: (hero, log) => {
                    if ((hero.gold || 0) < 20) return `⚠️ 金幣不足 20，祭壇毫無反應...`;
                    hero.gold -= 20;
                    hero.hp = Math.min(hero.maxHp, hero.hp + 10);
                    return `祭壇吞下了金幣，溫暖的光芒治癒了你的傷口。(金幣-20, HP+10)`;
                }
            },
            {
                text: '🏃 默默離開',
                action: (hero, log) => {
                    return `你決定不冒險，轉身離開了祭壇。`;
                }
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
                action: (hero, log) => {
                    if ((hero.gold || 0) < 15) return `⚠️ 金幣不足 15，賭徒不理你了。`;
                    hero.gold -= 15;
                    if (Math.random() > 0.5) {
                        hero.critBonus += 2;
                        return `🎯 運氣大爆發！你贏得了骰子對決！(爆擊增益+2)`;
                    } else {
                        return `💸 哎呀，你輸光了賭註... (金幣-15)`;
                    }
                }
            },
            {
                text: '👋 婉拒離開',
                action: (hero, log) => {
                    return `你握緊了錢包，頭也不回地離開了。`;
                }
            }
        ]
    }
];