// js/characters/characterBaseFields.js
//
// 🟢 角色共用欄位：純粹是戰鬥/存檔系統管線用的預設值，跟角色數值特色無關。
// 新增角色時在該角色的 xxxData.js 用 ...BASE_CHARACTER_FIELDS 展開即可。
// 要調整「所有角色共用」的初始值（例如 deckCapacity 起始值），只需要改這裡一處。

export const BASE_CHARACTER_FIELDS = {
    battleCritBonus: 0,
    battleHealBonus: 0,
    armorHits: 0,
    isVulnerable: false,
    block: 0,
    dodgeCount: 0,
    doubleNextAction: false,
    poisonTurns: 0,
    isPressured: false,
    stigma: 0,
    gold: 50,
    cdActiveSkill: 0,
    overrideDice: null,
    battleAtkBonus: 0,
    deckCapacity: 15,
    activeEffects: [],
    lastPlayedCard: null,
    startBlock: 0,
    goldGainBonus: 0,
    rewardCounts: { STAT: 0, BLESSING: 0, CARD: 0 },
    firstCardFreeEachBattle: false,
    turnSpeedBonus: 0,
    freeGoldCardsThisTurn: false,
    nextStigmaCardDiscount: 0
};