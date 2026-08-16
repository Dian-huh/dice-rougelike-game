// js/characters/swordsman/swordsmanCards.js

const SWORDSMAN_CARD_DEFS = [
    {
        id: 1, name: '型態切換', cost: 0, desc: '切換收刀/拔刀狀態，抽1張牌，劍意+1',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.stance = hero.stance === 'DRAWN' ? 'SHEATHED' : 'DRAWN';
            deckSys.drawCard();
            hero.swordIntent = Math.max(0, Math.min(10, (hero.swordIntent || 0) + 1));
            log(`🗡️ 效果發動：切換至【${hero.stance === 'DRAWN' ? '拔刀' : '收刀'}】狀態，抽 1 張牌，劍意+1`);
        }
    },
    {
        id: 2, name: '槿花泡影', cost: 2, desc: '接下來3T內，速度+1，回合開始時獲得慧眼',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.activeEffects = hero.activeEffects || [];
            let e = hero.activeEffects.find(x => x.id === 'swordsman_petal_shadow');
            if (!e) { e = { id: 'swordsman_petal_shadow', stacks: 0 }; hero.activeEffects.push(e); }
            e.stacks = 3;
            log(`🌸 效果發動：接下來 3 回合速度+1，回合開始獲得慧眼`);
        }
    },
    {
        id: 3, name: '花風・薄紅舞', cost: 1, desc: '此回合爆擊增益+2、必定爆擊',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.turnCritBonus = (hero.turnCritBonus || 0) + 2;
            hero.forceCritThisTurn = true;
            log(`🌸 效果發動：本回合爆擊增益+2，且必定觸發爆擊加成`);
        }
    },
    // ⚠️ 這張目前沒有實作，見文末說明——需要一個新的「選骰UI」才能正確做「指定點數」
    {
        id: 4, name: '花風・比翼舞', cost: 2,
        desc: '劍意-2，指定自己下次攻擊骰的點數 (每5層劍意，此卡費用-1) 【未實作，需要新UI】',
        scope: 'SELF', tags: [],
        implemented: false,
        getCost: (hero) => Math.max(0, 2 - Math.floor((hero.swordIntent || 0) / 5)),
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            log(`⚠️ 花風・比翼舞尚未實作（需要選骰UI），本次出牌沒有效果`);
        }
    },
    {
        id: 5, name: '瞬・連擊', cost: 2, desc: '劍意-3，擲一次攻擊骰並執行',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            hero.swordIntent = Math.max(0, (hero.swordIntent || 0) - 3);
            log(`🗡️ 效果發動：劍意-3，觸發一次攻擊骰行動！`);
            if (scene && !scene._attackFlowRunning && !scene.isPickingTarget) {
                scene.resolveAttackPhase();
            }
        }
    },
    {
        id: 6, name: '風之低語', cost: 1, desc: '閃避+1，回復2，劍意+1',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.dodgeCount = (hero.dodgeCount || 0) + 1;
            combatSys.applyHealToHero(hero, 2, log);
            hero.swordIntent = Math.max(0, Math.min(10, (hero.swordIntent || 0) + 1));
            log(`🍃 效果發動：閃避+1，回復2，劍意+1`);
        }
    }
];

// 🟢 方法B：數量表跟卡片定義分開，之後要調張數只改這裡
const SWORDSMAN_CARD_COUNTS = {
    1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1
};

export const SWORDSMAN_DECK = SWORDSMAN_CARD_DEFS.flatMap(def =>
    Array.from({ length: SWORDSMAN_CARD_COUNTS[def.id] || 1 }, () => ({ ...def }))
);