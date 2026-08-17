// js/characters/hero/heroCards.js

const HERO_CARD_DEFS = [
    { 
        id: 'YS_01', name: '重擊', cost: 2, desc: '造成 4 點傷害',
        scope: 'SINGLE_ENEMY', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            combatSys.applyDamageToTarget(enemy, 4, log);
        }
    },
    { 
        id: 'YS_02', name: '戰術思考', cost: 0, desc: '抽 2 張牌',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            deckSys.drawCard();
            deckSys.drawCard();
            log(`🎴 效果發動：額外抽取 2 張卡牌`);
        }
    },
    { 
        id: 'YS_03', name: '聖痕印記', cost: 1, desc: '給敵方 1 層聖痕',
        scope: 'SELF', tags: ['聖痕'],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.stigma += 1;
            log(`🔱 效果發動：敵方附加 1 層聖痕 (現為 ${hero.stigma} 層)`);
        }
    },
    { 
        id: 'YS_04', name: '光芒治癒', cost: 1, desc: '回復 3 基礎血量',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            combatSys.applyHealToHero(hero, 3, log);
        }
    },
    { 
        id: 'YS_05', name: '連打算計', cost: 3, desc: '下一次攻擊骰行動執行 2 次',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.doubleNextAction = true;
            log(`⚔️ 效果發動：下一次攻擊骰的行動將會連續【執行 2 次】！`);
        }
    },
    { 
        id: 'YS_06', name: '堅定防禦', cost: 1, desc: '獲得 3 點格擋',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.block += 3;
            log(`🛡️ 效果發動：獲得 3 點格擋 (現為 ${hero.block})`);
        }
    }
];

const HERO_CARD_COUNTS = {
    YS_01: 1, YS_02: 1, YS_03: 1, YS_04: 1, YS_05: 1, YS_06: 1
};

export const HERO_DECK = HERO_CARD_DEFS.flatMap(def =>
    Array.from({ length: HERO_CARD_COUNTS[def.id] || 1 }, () => ({ ...def }))
);