// js/characters/swordsman/swordsmanData.js
import { EffectEngine } from '../../systems/EffectEngine.js';

// ---- 內部小工具（劍豪專屬，不放進共用系統） ----

function clampIntent(v) {
    return Math.max(0, Math.min(10, v));
}

function addSwordIntent(hero, amount) {
    hero.swordIntent = clampIntent((hero.swordIntent || 0) + amount);
}

// 慧眼：消耗一層並回傳+3傷害；沒有慧眼就回傳0
function consumeInsightBonus(hero, log) {
    if ((hero.insightStacks || 0) > 0) {
        hero.insightStacks -= 1;
        log(`👁️ [慧眼] 消耗一層，本次傷害+3`);
        return 3;
    }
    return 0;
}

// 追擊：即時依當前劍意層數換算（floor(劍意/5)），不另外存欄位，避免跟劍意本身異動時脫鉤
// 只有「攻擊骰的普攻、爆擊」(點數1、3) 會呼叫這個 —— 對應設計稿「追擊」註解的限定範圍
function applyPursuitBonus(hero, enemy, combatSys, log) {
    const pursuitStacks = Math.floor((hero.swordIntent || 0) / 5);
    for (let i = 0; i < pursuitStacks; i++) {
        if (enemy.hp <= 0) break;
        combatSys.applyDamageToTarget(enemy, 1, log);
    }
}

// 拔刀被動：造成傷害時，對隨機目標追加2次1點傷害
// 範圍：目前只掛在「攻擊骰行動」造成傷害的路徑上（見下方各技能），起始牌組卡片皆不直接造成傷害，暫不影響
function applyDrawnStanceBonus(hero, enemies, combatSys, log) {
    if (hero.stance !== 'DRAWN') return;
    for (let i = 0; i < 2; i++) {
        const pool = (enemies || []).filter(e => e.hp > 0);
        if (pool.length === 0) break;
        const target = pool[Math.floor(Math.random() * pool.length)];
        combatSys.applyDamageToTarget(target, 1, log);
    }
}

export const SWORDSMAN_DATA = {
    id: 'swordsman',
    name: '劍豪',
    description: '高風險高回報的雙型態角色，透過切換【收刀】/【拔刀】狀態與經營【劍意】資源，打出爆發連段。血量偏低，須謹慎運用閃避反擊。',
    hp: 8, maxHp: 8,
    atk: 5,
    critBonus: 2,
    battleCritBonus: 0,
    battleHealBonus: 0,
    mana: 2, maxMana: 2,
    healRatio: 1,
    speedBonus: 2,
    atkCount: 2,
    armorMax: 2,
    armorHits: 0,
    isVulnerable: false,
    block: 0,
    dodgeCount: 0,
    doubleNextAction: false,
    poisonTurns: 0,
    isPressured: false,
    stigma: 0,
    gold: 0,
    cdActiveSkill: 0,
    overrideDice: null,
    battleAtkBonus: 0,
    deckCapacity: 10,
    activeEffects: [],
    lastPlayedCard: null,
    startBlock: 0,
    goldGainBonus: 0,
    rewardCounts: { STAT: 0, BLESSING: 0, CARD: 0 },
    firstCardFreeEachBattle: false,

    // 🟢 劍豪專屬欄位
    stance: 'SHEATHED',        // 'SHEATHED'(收刀) / 'DRAWN'(拔刀)
    swordIntent: 0,            // 劍意，上限10（clampIntent 統一夾住）
    insightStacks: 0,          // 慧眼，上限1
    turnCritBonus: 0,          // 花風・薄紅舞用：單回合暴擊增益，每回合開始由 TurnSystem 重置
    forceCritThisTurn: false,  // 花風・薄紅舞用：單回合必定爆擊旗標，每回合開始由 TurnSystem 重置

    // 🟢 被動：收刀狀態下閃避成功，對隨機目標反擊5點傷害、回復3
    // 由 CombatSystem.applyDamageToTarget 在閃避成功時呼叫（見上方共用系統改動）
    onDodgeSuccess(enemies, log, combatSys) {
        if (this.stance !== 'SHEATHED') return;
        const aliveEnemies = (enemies || []).filter(e => e.hp > 0);
        if (aliveEnemies.length === 0) return;
        const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        log(`🌀 [被動:收刀反擊] 閃避成功，對 ${target.name} 造成 5 點傷害並回復 3 點HP！`);
        combatSys.applyDamageToTarget(target, 5, log);
        combatSys.applyHealToHero(this, 3, log);
    },

    // 🟢 主動技能：切換型態，冷卻1T（由 BattleScene.toggleSkillPicker 呼叫，見上方共用系統改動）
    useActiveSkill(combatSys, log) {
        if (this.stance === 'DRAWN') {
            this.stance = 'SHEATHED';
            this.insightStacks = Math.min(1, (this.insightStacks || 0) + 1);
            log(`✨ [主動技能] 切換至【收刀】狀態，獲得【慧眼】`);
        } else {
            this.stance = 'DRAWN';
            addSwordIntent(this, 3);
            log(`✨ [主動技能] 切換至【拔刀】狀態，劍意+3`);
        }
        this.cdActiveSkill = 1;
    },

    diceSkills: {
        1: {
            name: '普通攻擊',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log, flowCtx, enemies) => {
                const insightBonus = consumeInsightBonus(hero, log);
                let atkVal = combatSys.getEffectiveAtk(hero) + insightBonus;
                if (hero.forceCritThisTurn) {
                    atkVal += combatSys.getEffectiveCritBonus(hero);
                    log(`🌸 [花風・薄紅舞] 本回合必定爆擊生效！`);
                }
                log(`⚔️ 觸發 [1:普通攻擊] 造成 ${atkVal} 點傷害`);
                combatSys.applyDamageToTarget(enemy, atkVal, log);
                applyPursuitBonus(hero, enemy, combatSys, log);
                applyDrawnStanceBonus(hero, enemies, combatSys, log);
            }
        },
        2: {
            name: '技能1',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log, flowCtx, enemies) => {
                const insightBonus = consumeInsightBonus(hero, log);
                if (hero.stance === 'SHEATHED') {
                    // 剎那：造成單體5點傷害，劍意+1，若劍意>5，再對同目標造成劍意層數點傷害
                    let dmg = 5 + insightBonus;
                    log(`⚔️ 觸發 [技能1:剎那] 造成 ${dmg} 點傷害`);
                    combatSys.applyDamageToTarget(enemy, dmg, log);
                    addSwordIntent(hero, 1);
                    if (hero.swordIntent > 5 && enemy.hp > 0) {
                        log(`🗡️ 劍意超過5層，追加 ${hero.swordIntent} 點傷害！`);
                        combatSys.applyDamageToTarget(enemy, hero.swordIntent, log);
                    }
                } else {
                    // 千紫萬紅：劍意-3，造成單體爆擊傷害，再給予目標(劍意-3後的層數)次1點傷害
                    addSwordIntent(hero, -3);
                    const critDmg = combatSys.getEffectiveAtk(hero) + combatSys.getEffectiveCritBonus(hero) + insightBonus;
                    log(`💥 觸發 [技能1:千紫萬紅] 造成 ${critDmg} 點爆擊傷害`);
                    combatSys.applyDamageToTarget(enemy, critDmg, log);
                    const hits = hero.swordIntent || 0;
                    for (let i = 0; i < hits; i++) {
                        if (enemy.hp <= 0) break;
                        combatSys.applyDamageToTarget(enemy, 1, log);
                    }
                }
                applyDrawnStanceBonus(hero, enemies, combatSys, log);
            }
        },
        3: {
            name: '爆擊攻擊',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log, flowCtx, enemies) => {
                const insightBonus = consumeInsightBonus(hero, log);
                const critDmg = combatSys.getEffectiveAtk(hero) + combatSys.getEffectiveCritBonus(hero) + insightBonus;
                log(`💥 觸發 [3:爆擊攻擊] 造成 ${critDmg} 點傷害！`);
                combatSys.applyDamageToTarget(enemy, critDmg, log);
                applyPursuitBonus(hero, enemy, combatSys, log);
                applyDrawnStanceBonus(hero, enemies, combatSys, log);
            }
        },
        4: {
            name: '技能2',
            scope: 'SELF',   // 拔刀版是對全體造成傷害，不需要玩家指定目標，內部自行遍歷 enemies 即可
            execute: (hero, enemy, combatSys, log, flowCtx, enemies) => {
                if (hero.stance === 'SHEATHED') {
                    // 寂寞無為：獲得3次閃避，劍意+1，獲得慧眼
                    // 🟢 簡化：規格提到「3T內每次閃避都反擊5點傷害」，但這正是收刀被動本身就會做的事（見 onDodgeSuccess），
                    //    這裡不另外做「限時3回合」的機制，直接授予閃避次數即可，反擊由被動統一處理
                    hero.dodgeCount = (hero.dodgeCount || 0) + 3;
                    addSwordIntent(hero, 1);
                    hero.insightStacks = Math.min(1, (hero.insightStacks || 0) + 1);
                    EffectEngine.addStacks(hero, 'swordsman_lonely_inaction', 3);   // 🟢 新增
                    log(`🌀 觸發 [技能2:寂寞無為] 獲得 3 次閃避，劍意+1，獲得【慧眼】(接下來3回合，閃避成功額外反擊5點)`);
                } else {
                    // 清風明月：劍意-3，全體爆擊傷害，敵全體CT-1，依CT被減少的敵人數獲得等量劍意
                    addSwordIntent(hero, -3);
                    const insightBonus = consumeInsightBonus(hero, log);
                    const aliveEnemies = (enemies || []).filter(e => e.hp > 0);
                    let ctReducedCount = 0;
                    aliveEnemies.forEach(en => {
                        const dmg = combatSys.getEffectiveAtk(hero) + combatSys.getEffectiveCritBonus(hero) + insightBonus;
                        combatSys.applyDamageToTarget(en, dmg, log);
                        if ((en.ct || 0) > 0) {
                            en.ct = Math.max(0, en.ct - 1);
                            ctReducedCount += 1;
                        }
                    });
                    addSwordIntent(hero, ctReducedCount);
                    log(`💥 觸發 [技能2:清風明月] 對全體造成爆擊傷害，敵方CT各-1，劍意+${ctReducedCount}`);
                    applyDrawnStanceBonus(hero, enemies, combatSys, log);
                }
            }
        },
        5: {
            name: '閃避',
            scope: 'SELF',
            execute: (hero, enemy, combatSys, log) => {
                hero.dodgeCount += 1;
                log(`🌀 觸發 [5:閃避] 獲得 1 次閃避狀態！(現有閃避: ${hero.dodgeCount} 次)`);
            }
        },
        6: {
            name: '技能3',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log, flowCtx, enemies) => {
                const insightBonus = consumeInsightBonus(hero, log);
                if (hero.stance === 'SHEATHED') {
                    // 蝴蝶刃・屠龍：劍意+1，造成單體(爆擊+劍意數)傷害，切換拔刀，獲得慧眼，再攻擊
                    addSwordIntent(hero, 1);
                    const dmg = combatSys.getEffectiveCritBonus(hero) + (hero.turnCritBonus || 0) + (hero.swordIntent || 0) + insightBonus;
                    log(`💥 觸發 [技能3:蝴蝶刃・屠龍] 造成 ${dmg} 點傷害`);
                    combatSys.applyDamageToTarget(enemy, dmg, log);
                    hero.stance = 'DRAWN';
                    hero.insightStacks = Math.min(1, (hero.insightStacks || 0) + 1);
                    log(`🗡️ 切換至【拔刀】狀態，獲得【慧眼】`);
                    applyDrawnStanceBonus(hero, enemies, combatSys, log);
                    flowCtx.pendingReattacks = (flowCtx.pendingReattacks || 0) + 1;
                } else {
                    // 蝴蝶刃・萬華蝶：造成單體(劍意數)次攻擊力傷害，消耗全部劍意，
                    // 若慧眼被消耗，再對同目標造成爆擊傷害，切換收刀，再攻擊
                    const atkVal = combatSys.getEffectiveAtk(hero) + insightBonus;
                    const hits = hero.swordIntent || 0;
                    for (let i = 0; i < hits; i++) {
                        if (enemy.hp <= 0) break;
                        combatSys.applyDamageToTarget(enemy, atkVal, log);
                    }
                    log(`⚔️ 觸發 [技能3:蝴蝶刃・萬華蝶] 造成 ${hits} 次 ${atkVal} 點傷害，消耗全部劍意`);
                    hero.swordIntent = 0;
                    if (insightBonus > 0 && enemy.hp > 0) {
                        const critDmg = combatSys.getEffectiveAtk(hero) + combatSys.getEffectiveCritBonus(hero);;
                        log(`👁️ 慧眼被消耗，追加 ${critDmg} 點爆擊傷害！`);
                        combatSys.applyDamageToTarget(enemy, critDmg, log);
                    }
                    hero.stance = 'SHEATHED';
                    log(`🗡️ 切換至【收刀】狀態`);
                    applyDrawnStanceBonus(hero, enemies, combatSys, log); // 此時已切回收刀，實際上不會觸發，保留呼叫是為了跟其他技能寫法一致
                    flowCtx.pendingReattacks = (flowCtx.pendingReattacks || 0) + 1;
                }
            }
        }
    }
};