// js/systems/moveHandlers.js
// 往 MOVE_HANDLERS 註冊基本 handlers。由 CombatSystem import 以觸發註冊（避免與 MoveRunner 循環依賴）。
// 文字覆寫：intent[`${effect}Msg`]（字串或 (ctx)=>字串）；'' = 不輸出；未定義 = 用預設
import { MOVE_HANDLERS, MoveRunner } from './MoveRunner.js';
import { EffectEngine } from './EffectEngine.js';

const R = (v, ctx) => MoveRunner.resolve(v, ctx);

function say(ctx, name, fallback) {
    const m = ctx.intent[`${name}Msg`];
    const text = m === undefined ? fallback : R(m, ctx);
    if (text) ctx.log(text);
}

// 狀態分派：generic attack 的 statusEffect 與 status 陣列共用。entry.msg 可覆寫文字
function applyStatusEntry(ctx, t, entry) {
    const { cs, log } = ctx;
    const turns = R(entry.turns, ctx), stacks = R(entry.stacks, ctx);
    const out = (def) => {
        const m = entry.msg === undefined ? def : R(entry.msg, ctx);
        if (m) log(m);
    };
    switch (entry.type) {
        case 'poison':
            t.poisonTurns = turns || 3;
            out(`☠️ ${t.name} 中了【劇毒】(持續 ${t.poisonTurns} 回合)！`);
            break;
        case 'bleed': {
            const n = stacks || 1;
            t.bleedStacks = (t.bleedStacks || 0) + n;
            out(`🩸 ${t.name} 附加 ${n} 層【流血】！`);
            break;
        }
        case 'stun': {
            if (t.hp <= 0) break;
            const n = turns || 2;
            out(`💫 ${t.name} 陷入【暈眩】(${n} 回合)！`);
            cs.applyStun(t, n, log);
            break;
        }
        case 'burn': {
            if (t.hp <= 0) break;
            const n = turns || 5;
            cs.addTimedStatus(t, 'debuff_burn', n, 'REFRESH');
            out(`🔥 ${t.name} 陷入【灼燒】(${n} 回合)！`);
            break;
        }
        case 'frostbite': {
            if (t.hp <= 0) break;
            const n = turns || 5;
            cs.addTimedStatus(t, 'debuff_frostbite', n, 'REFRESH');
            out(`🧊 ${t.name} 陷入【凍傷】(${n} 回合)！`);
            break;
        }
        case 'shock': {
            const n = stacks || 1;
            EffectEngine.addStacks(t, 'debuff_shock', n);
            out(`⚡ ${t.name} 附加 ${n} 層【電擊】！`);
            break;
        }
        case 'freeze': {
            const n = turns || 2;
            EffectEngine.addStacks(t, 'debuff_freeze', n);
            out(`❄️ ${t.name} 被施加【冰結】(${n}回合)！`);
            break;
        }
        case 'pressure': {
            const n = turns || 2;
            cs.addTimedStatus(t, 'debuff_pressure', n, 'REFRESH');
            out(`😱 ${t.name} 陷入【威壓】(${n}回合)！`);
            break;
        }
        default:
            console.error(`⚠️ [MoveRunner] 未知的 status type: ${entry.type}`);
    }
}

// 通用攻擊型招式：逐字搬自 executeEnemyIntent 的「2. 攻擊型招式 / 3. 狀態附加」
// consumeCt 與 bossHeal 由 runner 統一處理，這裡不碰
MOVE_HANDLERS.attack = (ctx, intent) => {
    const { cs, attacker, target, log, enemies } = ctx;
    const hitCount = R(intent.hits, ctx) || 1;

    for (let i = 0; i < hitCount; i++) {
        if (target.hp <= 0) break;

        let baseDmg = (R(intent.value, ctx) || attacker.atk || 0) + EffectEngine.getLiveStatBonus(attacker, 'atk');
        if (attacker.nextDamageBonus) {
            baseDmg += attacker.nextDamageBonus;
            attacker.nextDamageBonus = 0;
        }

        const isCrit = attacker.isOD || (intent.canCrit && typeof attacker.rollCrit === 'function' && attacker.rollCrit());
        if (isCrit) {
            baseDmg += (attacker.critBonus || 2) + EffectEngine.getLiveStatBonus(attacker, 'crit');
            log(`💥 【${intent.desc || '攻擊'}】觸發暴擊！`);
        }

        if (intent.trueDamage || intent.unblockable) {
            const trueDmg = Math.round(baseDmg * (attacker.dmgMul || 1));
            target.hp = Math.max(0, target.hp - trueDmg);
            log(`⚡ ${attacker.name} 使用【${intent.desc}】，造成 ${trueDmg} 點無視防禦與閃避的真實傷害！`);
        } else {
            cs.applyDamageToTarget(target, baseDmg, log, enemies, attacker);
        }
    }

    if (attacker.stealOnAttackChance && Math.random() < attacker.stealOnAttackChance) {
        cs.stealGold(attacker, target, attacker.stealOnAttackAmount || 0, log);
    }

    if (intent.statusEffect) applyStatusEntry(ctx, target, intent.statusEffect);
    if (intent.id === 'DIVE') attacker.isFlying = false;
};

// 單純傷害（舊 SPECIAL 招式寫法）：只呼叫 applyDamageToTarget，不加爆擊/即時加成
// damage 可為數字、函式、或陣列（陣列＝依序多次獨立打擊，例如 [爆擊傷害, 1]）；hits 為每次打擊的重複次數
// 可用 ctx.dmg 在 damageMsg 取得第一段傷害；damageOpts 原樣傳給 applyDamageToTarget 第 6 參數
MOVE_HANDLERS.damage = (ctx, intent) => {
    const raw = R(intent.damage !== undefined ? intent.damage : intent.value, ctx);
    const strikes = (Array.isArray(raw) ? raw : [raw]).map(v => R(v, ctx));
    const hits = R(intent.hits, ctx) || 1;
    const opts = R(intent.damageOpts, ctx) || {};
    ctx.dmg = strikes[0];
    say(ctx, 'damage');
    ctx.targets.forEach(t => {
        strikes.forEach(dmg => {
            for (let i = 0; i < hits; i++) {
                if (t.hp <= 0) break;
                ctx.cs.applyDamageToTarget(t, dmg, ctx.log, ctx.enemies, ctx.attacker, opts);
            }
        });
    });
};

// status：陣列，每項 { type, turns?, stacks?, msg? }，turns/stacks 可為函式
MOVE_HANDLERS.status = (ctx, intent) => {
    const entries = R(intent.status, ctx) || [];
    ctx.targets.forEach(t => entries.forEach(e => {
        if (typeof e.when === 'function' && !e.when(ctx)) return;
        applyStatusEntry(ctx, t, e);
    }));
};

// heal：預設對自己；ctx.healed / ctx.overflow / ctx.healTarget 供訊息使用；healOverflowToBlock 把溢出轉格擋(1:1)
MOVE_HANDLERS.heal = (ctx, intent) => {
    ctx.targets.forEach(t => {
        ctx.cur = t;   // 供函式型 heal 依目標決定量（例：血量最低者回5、其餘回2）
        const amount = R(intent.heal, ctx);
        const before = t.hp;
        const healed = Math.max(0, Math.min(t.maxHp - before, amount));
        t.hp = before + healed;
        ctx.healed = healed;
        ctx.overflow = amount - healed;
        ctx.healTarget = t;
        say(ctx, 'heal');
        if (intent.healOverflowToBlock && ctx.overflow > 0) {
            t.block = (t.block || 0) + ctx.overflow;
            say(ctx, 'healOverflow', `🛡️ 過量治療 ${ctx.overflow} 點轉換為格擋！`);
        }
    });
};
MOVE_HANDLERS.heal.defaultTo = 'self';

MOVE_HANDLERS.block = (ctx, intent) => {
    const n = R(intent.block, ctx);
    ctx.targets.forEach(t => { t.block = (t.block || 0) + n; });
    say(ctx, 'block');
};
MOVE_HANDLERS.block.defaultTo = 'self';

// selfBuff：數值「累加」，{ atk: 2, critBonus: 2 }；值可為函式
MOVE_HANDLERS.selfBuff = (ctx, intent) => {
    const obj = R(intent.selfBuff, ctx) || {};
    ctx.targets.forEach(t => Object.keys(obj).forEach(k => { t[k] = (t[k] || 0) + R(obj[k], ctx); }));
    say(ctx, 'selfBuff');
};
MOVE_HANDLERS.selfBuff.defaultTo = 'self';

// setFlag：欄位「直接賦值」，{ forceSpecialNext: true }；值可為函式
MOVE_HANDLERS.setFlag = (ctx, intent) => {
    const obj = R(intent.setFlag, ctx) || {};
    ctx.targets.forEach(t => Object.keys(obj).forEach(k => { t[k] = R(obj[k], ctx); }));
    say(ctx, 'setFlag');
};
MOVE_HANDLERS.setFlag.defaultTo = 'self';

MOVE_HANDLERS.ct = (ctx, intent) => {
    const n = R(intent.ct, ctx);
    ctx.targets.forEach(t => { t.ct = Math.max(0, Math.min(t.maxCt, (t.ct || 0) + n)); });
    say(ctx, 'ct');
};
MOVE_HANDLERS.ct.defaultTo = 'self';

MOVE_HANDLERS.steal = (ctx, intent) => {
    const n = R(intent.steal !== undefined ? intent.steal : intent.value, ctx);
    say(ctx, 'steal');
    ctx.targets.forEach(t => ctx.cs.stealGold(ctx.attacker, t, n, ctx.log));
};

MOVE_HANDLERS.summon = (ctx, intent) => {
    say(ctx, 'summon');
    ctx.cs.summonEnemies(ctx.attacker, R(intent.summon, ctx) || [], ctx.enemies, ctx.log,
        { icon: intent.summonIcon, capNotice: intent.summonCapNotice, silentCap: intent.summonSilentCap });
};
MOVE_HANDLERS.summon.defaultTo = 'self';

MOVE_HANDLERS.breakArmor = (ctx, intent) => {
    ctx.targets.forEach(t => { t.armorHits = t.armorMax || 0; t.isVulnerable = true; });
    say(ctx, 'breakArmor');
};

MOVE_HANDLERS.dodge = (ctx, intent) => {
    ctx.targets.forEach(t => { t.dodgeCount = (t.dodgeCount || 0) + 1; });
    say(ctx, 'dodge');
};
MOVE_HANDLERS.dodge.defaultTo = 'self';

// effect：[{ id, n, mode, props? }]
//   mode 'add'(預設)=EffectEngine.addStacks；'refresh'/'extend'=addTimedStatus；'push'=直接 push { id, ...props }
MOVE_HANDLERS.effect = (ctx, intent) => {
    const list = R(intent.effect, ctx) || [];
    ctx.targets.forEach(t => list.forEach(e => {
        const n = R(e.n, ctx);
        switch (e.mode || 'add') {
            case 'add': EffectEngine.addStacks(t, e.id, n); break;
            case 'refresh': ctx.cs.addTimedStatus(t, e.id, n, 'REFRESH'); break;
            case 'extend': ctx.cs.addTimedStatus(t, e.id, n, 'EXTEND'); break;
            case 'push':
                t.activeEffects = t.activeEffects || [];
                t.activeEffects.push({ id: e.id, ...(e.props || {}) });
                break;
            default: console.error(`⚠️ [MoveRunner] 未知的 effect mode: ${e.mode}`);
        }
    }));
    say(ctx, 'effect');
};
MOVE_HANDLERS.effect.defaultTo = 'self';

// selfCost：{ block: 5 } 扣自身欄位；任一不足 → 輸出 selfCostFailMsg、ctx.halt = true
MOVE_HANDLERS.selfCost = (ctx, intent) => {
    const cost = R(intent.selfCost, ctx) || {};
    const a = ctx.attacker;
    for (const k of Object.keys(cost)) {
        if ((a[k] || 0) < R(cost[k], ctx)) {
            say(ctx, 'selfCostFail');
            ctx.halt = true;
            return;
        }
    }
    Object.keys(cost).forEach(k => { a[k] = (a[k] || 0) - R(cost[k], ctx); });
    say(ctx, 'selfCost');
};
MOVE_HANDLERS.selfCost.defaultTo = 'self';

// selfLoss：自己扣欄位，不低於 selfLossMin（預設 0），不會失敗。例：{ hp: 10 } + selfLossMin: { hp: 1 }
MOVE_HANDLERS.selfLoss = (ctx, intent) => {
    const loss = R(intent.selfLoss, ctx) || {};
    const mins = R(intent.selfLossMin, ctx) || {};
    const a = ctx.attacker;
    Object.keys(loss).forEach(k => { a[k] = Math.max(mins[k] || 0, (a[k] || 0) - R(loss[k], ctx)); });
    say(ctx, 'selfLoss');
};
MOVE_HANDLERS.selfLoss.defaultTo = 'self';

// roll：擲一次機率，結果存 ctx.rolled，後續 effect 用 [effect]When 分支
MOVE_HANDLERS.roll = (ctx, intent) => {
    ctx.rolled = Math.random() < (R(intent.roll, ctx) || 0);
};
MOVE_HANDLERS.roll.defaultTo = 'self';

// escape：脫離戰鬥（不算擊殺，跳過賞金/返還/詛咒）
MOVE_HANDLERS.escape = (ctx) => {
    ctx.targets.forEach(t => ctx.cs.escapeFromBattle(t, ctx.log));
};
MOVE_HANDLERS.escape.defaultTo = 'self';

// log：純輸出一行訊息（用 logWhen 決定要不要輸出，logMsg 寫內容）
MOVE_HANDLERS.log = (ctx) => say(ctx, 'log');
MOVE_HANDLERS.log.defaultTo = 'self';

// selfDestruct：引爆自身對目標造成爆擊傷害後死亡（走 SELF_DESTRUCT，可觸發怨氣，不給詛咒）
MOVE_HANDLERS.selfDestruct = (ctx) => ctx.cs.selfDestruct(ctx.attacker, ctx.target, ctx.enemies, ctx.log);

// buff：限時增益，buff: { type: 'charge' | 'heroic' | 'rage', turns, value? }，對每個目標各套一次
MOVE_HANDLERS.buff = (ctx, intent) => {
    const b = R(intent.buff, ctx) || {};
    ctx.targets.forEach(t => {
        if (b.type === 'charge') ctx.cs.applyChargeBuff(t, b.turns);
        else if (b.type === 'heroic') ctx.cs.applyHeroicBuff(t, b.turns);
        else if (b.type === 'rage') ctx.cs.applyRageBuff(t, b.turns || 2, b.value || 2);
        else console.error(`⚠️ [MoveRunner] 未知的 buff type: ${b.type}`);
    });
    say(ctx, 'buff');
};
MOVE_HANDLERS.buff.defaultTo = 'self';