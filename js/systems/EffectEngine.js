// js/systems/EffectEngine.js
import { EFFECT_REGISTRY } from '../data/effectRegistry.js';

export const EffectEngine = {
    // 讀取用：不存在就回傳 null，不做任何寫入（避免污染唯讀查詢，例如敵人身上也會呼叫 getLiveStatBonus）
    getEntry(hero, id) {
        const effects = hero.activeEffects || [];
        return effects.find(e => e.id === id) || null;
    },

    // 疊加型效果（BLESSING）：不存在就建立，存在就疊加 stacks
    addStacks(hero, id, amount = 1) {
        hero.activeEffects = hero.activeEffects || [];
        let entry = this.getEntry(hero, id);
        if (!entry) {
            entry = { id, stacks: 0 };
            hero.activeEffects.push(entry);
        }
        entry.stacks += amount;
        return entry;
    },

    // 事件型 hook：依序呼叫 hero.activeEffects 中每個效果註冊在 registry 的對應函式
    runHook(hookName, hero, ctx = {}) {
        const effects = hero.activeEffects || [];
        effects.forEach(entry => {
            const def = EFFECT_REGISTRY[entry.id];
            if (def && typeof def[hookName] === 'function') {
                def[hookName](hero, entry, ctx);
            }
        });
    },

    // 查看用：回傳所有「有標記顯示資訊」的效果，供 UI 面板渲染，不做任何寫入
    getVisibleEffects(hero) {
        const effects = hero.activeEffects || [];
        return effects
            .filter(entry => {
                const def = EFFECT_REGISTRY[entry.id];
                return def && def.displayName && typeof def.getStatusText === 'function';
            })
            .map(entry => {
                const def = EFFECT_REGISTRY[entry.id];
                return { name: def.displayName, statusText: def.getStatusText(entry) };
            });
    },

    // 即時查詢型：加總所有 liveStatModifier 對指定 statName 的加成
    getLiveStatBonus(entity, statName) {
        const effects = entity.activeEffects || [];
        return effects.reduce((sum, entry) => {
            const def = EFFECT_REGISTRY[entry.id];
            if (def && typeof def.liveStatModifier === 'function') {
                return sum + (def.liveStatModifier(entity, entry, statName) || 0);
            }
            return sum;
        }, 0);
    },

    // 回血加值型：加總所有 onHealModify 效果
    getHealBonus(hero) {
        const effects = hero.activeEffects || [];
        return effects.reduce((sum, entry) => {
            const def = EFFECT_REGISTRY[entry.id];
            if (def && typeof def.onHealModify === 'function') {
                return sum + (def.onHealModify(hero, entry) || 0);
            }
            return sum;
        }, 0);
    },

    // === 計數器型（DICE 用，A4 才會實際掛資料，這裡先備好，A2不使用） ===
    getCounterRemaining(hero, id) {
        const entry = this.getEntry(hero, id);
        if (!entry) return 0;
        return Math.max(0, (entry.max || 0) - (entry.used || 0));
    },

    consumeCounter(hero, id) {
        const entry = this.getEntry(hero, id);
        if (!entry || (entry.used || 0) >= (entry.max || 0)) return false;
        entry.used = (entry.used || 0) + 1;
        return true;
    },

    addCounterMax(hero, id, amount = 1) {
        hero.activeEffects = hero.activeEffects || [];
        let entry = this.getEntry(hero, id);
        if (!entry) {
            entry = { id, max: 0, used: 0 };
            hero.activeEffects.push(entry);
        }
        entry.max += amount;
        return entry;
    }
};