export const HERO_DECK = [
    { 
        id: 1, name: '重擊', cost: 2, desc: '造成 4 點傷害',
        scope: 'SINGLE_ENEMY',
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            combatSys.applyDamageToTarget(enemy, 4, log);
        }
    },
    { 
        id: 2, name: '戰術思考', cost: 0, desc: '抽 2 張牌',
        scope: 'SELF',
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            deckSys.drawCard();
            deckSys.drawCard();
            log(`🎴 效果發動：額外抽取 2 張卡牌`);
        }
    },
    { 
        id: 3, name: '聖痕印記', cost: 1, desc: '給敵方 1 層聖痕',
        scope: 'SELF',
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.stigma += 1;
            log(`🔱 效果發動：敵方附加 1 層聖痕 (現為 ${hero.stigma} 層)`);
        }
    },
    { 
        id: 6, name: '光芒治癒', cost: 1, desc: '回復 3 基礎血量',
        scope: 'SELF',
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            combatSys.applyHealToHero(hero, 3, log);
        }
    },
    { 
        id: 7, name: '連打算計', cost: 3, desc: '下一次攻擊骰行動執行 2 次',
        scope: 'SELF',
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.doubleNextAction = true;
            log(`⚔️ 效果發動：下一次攻擊骰的行動將會連續【執行 2 次】！`);
        }
    },
    { 
        id: 8, name: '堅定防禦', cost: 1, desc: '獲得 3 點格擋',
        scope: 'SELF',
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.block += 3;
            log(`🛡️ 效果發動：獲得 3 點格擋 (現為 ${hero.block})`);
        }
    }
];