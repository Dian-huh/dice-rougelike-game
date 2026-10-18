// js/systems/MoveRunner.js
//
// 宣告式招式執行器。CombatSystem.executeEnemyIntent 完成前置處理後，
// 若 intent 帶 effects（或 run），就交給這裡；其餘仍走舊 if 鏈。
// MoveRunner 不 import CombatSystem（由呼叫端傳入 cs），避免循環依賴。

// handler 簽名：(ctx, intent) => void
//   ctx = { cs, attacker, target, intent, log, enemies, hero, targets, to, halt }
//   ctx.targets：本次 effect 依 `to` 解析出的目標陣列
//   ctx.halt = true：handler 可要求中止後續 effects（自爆、逃亡用）
//   handler.defaultTo：該 handler 未指定 to 時的預設目標（例如 selfBuff 可設 'self'）
// Step 2 才會往這裡填 damage / status / heal ...
export const MOVE_HANDLERS = {};

export class MoveRunner {
    // 函式型欄位：在「執行當下」才計算
    static resolve(v, ctx) {
        return typeof v === 'function' ? v(ctx) : v;
    }

    // to：'hero'(預設) / 'self' / 'allies'(含自己) / 'otherAllies' / 'randomAlly'(其他友軍) / 'lowestAlly'
    static resolveTargets(to, ctx) {
        const { cs, attacker, target, enemies } = ctx;
        const alive = (enemies || []).filter(e => e && e.hp > 0);
        const others = alive.filter(e => e !== attacker);
        switch (to) {
            case 'self': return [attacker];
            case 'allies': return alive;
            case 'otherAllies': return others;
            case 'randomAlly':   // 沿用舊程式的 Math.random 寫法，測試固定種子時抽法一致
                return others.length ? [others[Math.floor(Math.random() * others.length)]] : [];
            case 'lowestAlly': {
                const t = cs.getLowestHpPercentAlly(alive);
                return t ? [t] : [];
            }
            case 'hero':
            default:
                return target ? [target] : [];
        }
    }

    static execute(cs, attacker, target, intent, log, enemies) {
        const safeLog = typeof log === 'function' ? log : console.log;
        const ctx = {
            cs, attacker, target, intent, enemies,
            log: safeLog,
            hero: cs._activeHero || target,
            targets: [], to: 'hero', halt: false
        };

        // consumeCt 時機：預設 after；烈焰琉璃的 ct setter 有副作用，必要時可指定 'before'
        const timing = intent.consumeCtTiming === 'before' ? 'before' : 'after';
        const consume = () => {
            const n = this.resolve(intent.consumeCt, ctx);
            if (n) attacker.ct = Math.max(0, attacker.ct - n);
        };
        if (timing === 'before') consume();

        for (const name of (intent.effects || [])) {
            if (ctx.halt) break;

            const handler = MOVE_HANDLERS[name];
            if (typeof handler !== 'function') {
                console.error(`⚠️ [MoveRunner] 未知的 effect: ${name}（招式 ${intent.id}）`);
                continue;
            }

            // 目標優先序：`${effect}To` > intent.to > handler.defaultTo > 'hero'
            const to = intent[`${name}To`] || intent.to || handler.defaultTo || 'hero';

            // 防呆：對玩家的 effect 在玩家已死時略過；自身/友軍類 effect 不受影響
            if (to === 'hero' && (!target || target.hp <= 0)) continue;

            // 條件：`${effect}When`
            const when = intent[`${name}When`];
            if (typeof when === 'function' && !when(ctx)) continue;

            ctx.to = to;
            ctx.targets = this.resolveTargets(to, ctx);
            handler(ctx, intent);
        }

        // 保底：所有 effects 之後執行；只寫 run 的招式 effects 可省略
        if (typeof intent.run === 'function') intent.run(ctx);

        if (timing === 'after') consume();

        // 取代舊分支各自呼叫的 applyBossHealOnSpecial，招式宣告 bossHeal: true 即可
        if (intent.bossHeal) cs.applyBossHealOnSpecial(attacker, target, safeLog);
    }
}