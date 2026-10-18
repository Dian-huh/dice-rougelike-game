// js/data/enemies/sharedMoves.js
// 多隻敵人共用的招式片段。使用時請 `{ ...BOSS_CHARGE }` 展開，避免共用同一個物件
export const BOSS_CHARGE = {
    id: 'BOSS_CHARGE', type: 'SPECIAL', consumeCt: 2, consumeCtTiming: 'before',
    desc: '🔋 蓄力 (消耗2CT，攻擊力與爆擊增益+2，下回合必定發動特殊行動)',
    effects: ['selfBuff', 'setFlag'],
    selfBuff: { atk: 2, critBonus: 2 },
    setFlag: { forceSpecialNext: true },
    setFlagMsg: (c) => `🔋 ${c.attacker.name} 發動【蓄力】！攻擊力與爆擊增益 +2，下回合必定發動特殊行動！`
};