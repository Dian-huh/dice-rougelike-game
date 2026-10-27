// js/data/debuffRegistry.js
// 🟢 統一的 Debuff 註冊表：根據「debuff一覽.txt」模式，集中管理所有減益效果與持續傷害

// ============ [傷害] DOT 型（行動時觸發的持續傷害） ============
export const DOT_TYPES = {
    poison: {
        stacksField: 'poisonTurns',
        getDamage: () => 3,          // 強化後：每執行一個動作受3點傷害
        label: '劇毒', icon: '🤢'
    },
    bleed: {
        stacksField: 'bleedStacks',
        getDamage: (entity) => entity.bleedStacks || 0, // 傷害＝當前流血層數，行動時扣1層
        label: '流血', icon: '🩸'
    }
};

// ============ ActiveEffect 型（掛在 activeEffects 陣列） ============
export const DEBUFF_REGISTRY = {
    // [傷害] ---------------------------------------------
    debuff_shock: {
        category: 'DEBUFF',
        displayName: '電擊',
        getStatusText: (entry) => `電擊 x${entry.stacks} (回合開始受${entry.stacks}點傷害，魔力/CT-${entry.stacks})`,
        onTurnStart: (entity, entry, ctx) => {
            const dmg = entry.stacks;
            entity.hp = Math.max(0, entity.hp - dmg);
            ctx.log(`⚡ [電擊] ${entity.name} 受到 ${dmg} 點傷害！`, 'system');

            if (entity.mana !== undefined) {
                const before = entity.mana;
                entity.mana = Math.max(0, entity.mana - entry.stacks);
                ctx.log(`⚡ [電擊] 魔力 -${entry.stacks} (${before} → ${entity.mana})`, 'system');
            } else if (entity.maxCt > 0) {
                const before = entity.ct || 0;
                entity.ct = Math.max(0, before - entry.stacks);
                ctx.log(`⚡ [電擊] CT -${entry.stacks} (${before} → ${entity.ct})`, 'system');
            }

            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`⚡ [電擊] 效果已結束`, 'system');
            }
        }
    },
    
    debuff_burn: {
        category: 'DEBUFF',
        displayName: '灼燒',
        getStatusText: (entry) => `灼燒 x${entry.stacks} (每回合開始時每有1層受到1次2點傷害，灼燒-${entry.stacks > 2 ? 2 : 1}層)`,
        onTurnStart: (entity, entry, ctx) => {
            const hits = entry.stacks;
            for (let i = 0; i < hits; i++) {
                entity.hp = Math.max(0, entity.hp - 2);
            }
            const totalDmg = hits * 2;
            ctx.log(`🔥 [灼燒] ${entity.name} 有 ${hits} 層灼燒，受到 ${totalDmg} 點傷害！`, 'system');
            entry.stacks -= entry.stacks > 2 ? 2 : 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`🔥 [灼燒] 效果已結束`, 'system');
            }
        }
    },

    debuff_frostbite: {
        category: 'DEBUFF',
        displayName: '凍傷',
        getStatusText: (entry) => `凍傷 (剩餘 ${entry.stacks} 回合，每次受傷 +${entry.stacks} 點)`,
        liveStatModifier: (entity, entry, statName) => (statName === 'damageTaken' ? entry.stacks : 0),
        onTurnStart: (entity, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`🧊 [凍傷] 效果已結束`, 'system');
            }
        }
    },

    debuff_curse: {
        category: 'DEBUFF',
        displayName: '詛咒',
        getStatusText: (entry) => `詛咒 x${entry.stacks} (回合開始隨機從所有debuff中給予一種2層，詛咒-1層)`,
        onTurnStart: (entity, entry, ctx) => {
            const debuffPool = ['bleed', 'poison', 'shock', 'burn', 'frostbite', 'freeze', 'vulnerability'];
            const choice = Phaser.Utils.Array.GetRandom(debuffPool);
            switch (choice) {
                case 'bleed':
                    entity.bleedStacks = (entity.bleedStacks || 0) + 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 層【流血】！`, 'system');
                    break;
                case 'poison':
                    entity.poisonTurns = (entity.poisonTurns || 0) + 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 層【劇毒】！`, 'system');
                    break;
                case 'shock': {
                    entity.activeEffects = entity.activeEffects || [];
                    let shockEntry = entity.activeEffects.find(e => e.id === 'debuff_shock');
                    if (!shockEntry) { shockEntry = { id: 'debuff_shock', stacks: 0 }; entity.activeEffects.push(shockEntry); }
                    shockEntry.stacks += 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 層【電擊】！`, 'system');
                    break;
                }
                case 'burn': {
                    entity.activeEffects = entity.activeEffects || [];
                    let burnEntry = entity.activeEffects.find(e => e.id === 'debuff_burn');
                    if (!burnEntry) { burnEntry = { id: 'debuff_burn', stacks: 0 }; entity.activeEffects.push(burnEntry); }
                    burnEntry.stacks += 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 層【灼燒】！`, 'system');
                    break;
                }
                case 'frostbite': {
                    entity.activeEffects = entity.activeEffects || [];
                    let fbEntry = entity.activeEffects.find(e => e.id === 'debuff_frostbite');
                    if (!fbEntry) { fbEntry = { id: 'debuff_frostbite', stacks: 0 }; entity.activeEffects.push(fbEntry); }
                    fbEntry.stacks += 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 回合【凍傷】！`, 'system');
                    break;
                }
                case 'freeze': {
                    entity.activeEffects = entity.activeEffects || [];
                    let fzEntry = entity.activeEffects.find(e => e.id === 'debuff_freeze');
                    if (!fzEntry) { fzEntry = { id: 'debuff_freeze', stacks: 0, turns: 2 }; entity.activeEffects.push(fzEntry); }
                    fzEntry.stacks += 2;
                    fzEntry.turns = 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 層【冰結】(2T)！`, 'system');
                    break;
                }
                case 'vulnerability': {
                    entity.activeEffects = entity.activeEffects || [];
                    let vulnEntry = entity.activeEffects.find(e => e.id === 'debuff_vulnerability');
                    if (!vulnEntry) { vulnEntry = { id: 'debuff_vulnerability', stacks: 0, turns: 2 }; entity.activeEffects.push(vulnEntry); }
                    vulnEntry.stacks += 2;
                    vulnEntry.turns = 2;
                    ctx.log(`☠️ [詛咒] 隨機發作：附加 2 層【易傷】(2T)！`, 'system');
                    break;
                }
            }
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`☠️ [詛咒] 效果已結束`, 'system');
            }
        }
    },

    debuff_vulnerability: {
        category: 'DEBUFF',
        displayName: '易傷',
        getStatusText: (entry) => `易傷 x${entry.stacks || 1} (剩餘 ${entry.turns ?? 2} 回合，受傷害時血量額外-${entry.stacks || 1})`,
        liveStatModifier: (entity, entry, statName) => (statName === 'vulnerability' ? (entry.stacks || 1) : 0),
        onTurnStart: (entity, entry, ctx) => {
            if (entry.turns === undefined) entry.turns = 2;
            entry.turns -= 1;
            if (entry.turns <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`💔 [易傷] 效果已結束`, 'system');
            }
        }
    },

    // [控制] ---------------------------------------------
    debuff_pressure: {
        category: 'DEBUFF',
        displayName: '威壓',
        getStatusText: (entry) => `威壓 (剩餘 ${entry.stacks} 回合，攻擊骰鎖定為1，無法使用主動技能)`,
        onTurnStart: (entity, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`😱 [威壓] 效果已結束`, 'system');
            }
        }
    },

    taunt: {
        category: 'DEBUFF',
        displayName: '嘲諷',
        getStatusText: () => `嘲諷 (敵方指定攻擊只能選擇自己)`
        // 無 hook：供 AttackFlowSystem 查詢
    },

    debuff_stun: {
        category: 'DEBUFF',
        displayName: '暈眩',
        getStatusText: (entry) => `暈眩 (剩餘 ${entry.stacks} 回合，無法出卡)`,
        onTurnStart: (hero, entry, ctx) => {
            entry.stacks -= 1;
            if (entry.stacks <= 0) {
                hero.activeEffects = hero.activeEffects.filter(e => e !== entry);
                ctx.log(`💫 [暈眩] 效果已結束`, 'system');
            }
        }
    },

    debuff_freeze: {
        category: 'DEBUFF',
        displayName: '冰結',
        getStatusText: (entry) => `冰結 x${entry.stacks || 1} (剩餘 ${entry.turns ?? 2} 回合，速度-${3 * (entry.stacks || 1)}、攻擊力-${3 * (entry.stacks || 1)})`,
        liveStatModifier: (entity, entry, statName) => ['atk', 'speed'].includes(statName) ? -3 * (entry.stacks || 1) : 0,
        onTurnStart: (entity, entry, ctx) => {
            if (entry.turns === undefined) entry.turns = 2;
            entry.turns -= 1;
            if (entry.turns <= 0) {
                entity.activeEffects = entity.activeEffects.filter(e => e !== entry);
                ctx.log(`❄️ [冰結] 效果已結束`, 'system');
            }
        }
    }
};
