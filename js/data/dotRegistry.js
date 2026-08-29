// js/data/dotRegistry.js
// 🟢 「行動時觸發」的持續傷害通用表。敵人劇毒維持走 onTurnEnd 各自邏輯，不在此表內。
export const DOT_TYPES = {
    poison: {
        stacksField: 'poisonTurns',
        getDamage: () => 1,
        label: '劇毒', icon: '🤢'
    },
    bleed: {
        stacksField: 'bleedStacks',
        getDamage: (entity) => entity.bleedStacks || 0,   // 傷害＝當前流血層數
        label: '流血', icon: '🩸'
    }
};