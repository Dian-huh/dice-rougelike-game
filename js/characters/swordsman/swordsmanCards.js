// js/characters/swordsman/swordsmanCards.js

export const SWORDSMAN_CARD_DEFS = [
    {
        id: 'KG_01', name: '型態切換', cost: 0, desc: '切換收刀/拔刀狀態，抽1張牌，劍意+1',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.stance = hero.stance === 'DRAWN' ? 'SHEATHED' : 'DRAWN';
            deckSys.drawCard();
            hero.swordIntent = Math.max(0, Math.min(10, (hero.swordIntent || 0) + 1));
            log(`🗡️ 效果發動：切換至【${hero.stance === 'DRAWN' ? '拔刀' : '收刀'}】狀態，抽 1 張牌，劍意+1`);
        }
    },
    {
        id: 'KG_02', name: '槿花泡影', cost: 2, desc: '接下來3T內，速度+1，回合開始時獲得慧眼', theme: '戰技',
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
        id: 'KG_03', name: '花風・薄紅舞', cost: 1, desc: '此回合爆擊增益+2、必定爆擊', theme: '戰技',
        scope: 'SELF', tags: [],
        onPlay: (hero, enemy, combatSys, deckSys, log) => {
            hero.turnCritBonus = (hero.turnCritBonus || 0) + 2;
            hero.forceCritThisTurn = true;
            log(`🌸 效果發動：本回合爆擊增益+2，且必定觸發爆擊加成`);
        }
    },
    {
        id: 'KG_04', name: '花風・比翼舞', cost: 2,
        desc: '劍意-2，指定自己下次攻擊骰的點數 (每5層劍意，此卡費用-1)',
        scope: 'SELF', tags: [],
        implemented: true,
        minSwordIntent: 2,
        getCost: (hero) => Math.max(0, 2 - Math.floor((hero.swordIntent || 0) / 5)),
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            hero.swordIntent = Math.max(0, (hero.swordIntent || 0) - 2);
            log(`🌸 效果發動：劍意-2 (現為 ${hero.swordIntent} 層)，請指定下次攻擊骰點數`);
            if (scene) {
                scene.openDicePicker('花風・比翼舞：指定下次攻擊骰點數 (1~6):', (i) => {
                    hero.overrideDice = i;
                    log(`🌸 已指定下次攻擊骰為【 ${i} 】點`);
                    scene.updateUI();
                });
            }
        }
    },
    {
        id: 'KG_05', name: '瞬・連擊', cost: 2, desc: '劍意-3，擲一次攻擊骰並執行(不比速度、敵方不反應)',
        scope: 'SELF', tags: [],
        minSwordIntent: 3,   // 🟢 新增：出牌前檢查用
        onPlay: (hero, enemy, combatSys, deckSys, log, scene) => {
            hero.swordIntent = Math.max(0, (hero.swordIntent || 0) - 3);
            log(`🗡️ 效果發動：劍意-3，觸發一次攻擊骰行動！`);
            if (scene) scene.triggerSoloAttack();
        }
    },
    {
        id: 'KG_06', name: '風之低語', cost: 1, desc: '閃避+1，回復2，劍意+1',
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
    KG_01: 3, KG_02: 1, KG_03: 1, KG_04: 2, KG_05: 1, KG_06: 2
};

export const SWORDSMAN_DECK = SWORDSMAN_CARD_DEFS.flatMap(def =>
    Array.from({ length: SWORDSMAN_CARD_COUNTS[def.id] || 1 }, () => ({ ...def }))
);