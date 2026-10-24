// js/data/enemies/sharedMoves.js
// 多隻敵人共用的招式片段。使用時請 `{ ...BOSS_CHARGE }` 展開，避免共用同一個物件
import { EffectEngine } from '../../systems/EffectEngine.js';

// 「攻擊力 + 爆擊增益 + 即時爆擊加成」（舊 SPECIAL 分支的爆擊傷害算法）
export const critDamage = (c) => c.cs.getEffectiveEnemyAtk(c.attacker) + (c.attacker.critBonus || 0) + EffectEngine.getLiveStatBonus(c.attacker, 'crit');

export const BOSS_CHARGE = {
    id: 'BOSS_CHARGE', type: 'SPECIAL', consumeCt: 2, consumeCtTiming: 'before',
    desc: '🔋 蓄力 (消耗2CT，攻擊力與爆擊增益+2，下回合必定發動特殊行動)',
    effects: ['selfBuff', 'setFlag'],
    selfBuff: { atk: 2, critBonus: 2 },
    setFlag: { forceSpecialNext: true },
    setFlagMsg: (c) => `🔋 ${c.attacker.name} 發動【蓄力】！攻擊力與爆擊增益 +2，下回合必定發動特殊行動！`
};

// 舊 SUMMON 的戰報格式（📢 呼叫 + 👺 圖示 + 滿場時一次性提示），搬遷時原樣保留
export const summonMove = (ids, consumeCt, desc) => ({
    id: 'SUMMON', type: 'SPECIAL', summonIds: [...ids], consumeCt, desc,
    effects: ['summon'], summon: [...ids], summonIcon: '👺', summonCapNotice: true,
    summonMsg: (c) => `📢 ${c.attacker.name} 大聲呼叫，召喚了同伴支援！`
});