import { gameState } from '../data/gameState.js';
import { createEnemyInstance, ENEMY_DATABASE } from '../data/enemyData.js';
import { getCharacterData, getCharacterDeck, getAllCharacterIds } from '../characters/characterRegistry.js';
import { DeckSystem } from './DeckSystem.js';
import { REWARD_CARD_POOL } from '../data/rewardPoolData.js';
import { CombatSystem } from './CombatSystem.js';
import { MoveRunner, MOVE_HANDLERS } from './MoveRunner.js';


// ============================================================
// 🧪 Step 0：招式新舊對照測試工具（固定隨機種子）
// ============================================================
const MOVE_SNAP_PREFIX = 'dice_move_snapshot_';

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// 同時固定三種隨機來源，離開時一定還原
function withSeed(seedStr, fn) {
    const rng = mulberry32(hashStr(seedStr));
    const orig = {
        random: Math.random,
        between: Phaser.Math.Between,
        getRandom: Phaser.Utils.Array.GetRandom
    };
    Math.random = rng;
    Phaser.Math.Between = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
    Phaser.Utils.Array.GetRandom = (arr, start = 0, len) => {
        if (!arr || arr.length === 0) return null;
        const l = len === undefined ? arr.length - start : len;
        return arr[start + Math.floor(rng() * l)];
    };
    try { return fn(); }
    finally {
        Math.random = orig.random;
        Phaser.Math.Between = orig.between;
        Phaser.Utils.Array.GetRandom = orig.getRandom;
    }
}

function cloneIntent(it) {
    const c = { ...it };
    if (it.statusEffect) c.statusEffect = { ...it.statusEffect };
    if (Array.isArray(it.summonIds)) c.summonIds = [...it.summonIds];
    return c;
}

// 依「狀態描述」建立攻擊者：探測意圖與實際執行共用，確保兩邊狀態一致
function buildAttacker(enemyId, tier, state) {
    const inst = createEnemyInstance(enemyId, tier);
    CombatSystem.setActiveEnemies([inst]);   // 部分 onPhaseTransition 會讀
    if (state.phase > 1) {
        inst.phase = state.phase;
        if (typeof inst.onPhaseTransition === 'function') inst.onPhaseTransition(state.phase, () => {});
    }
    Object.assign(inst, state.flags);
    inst.isBreak = state.brk;
    if (state.brk) inst._intentLockedInBreak = true;
    inst.ct = state.ct;
    return inst;
}

function makeTestHero() {
    const d = getCharacterData('hero');
    const h = JSON.parse(JSON.stringify(d));
    gameState._restoreFunctionFields(h, d);
    Object.assign(h, { hp: 60, maxHp: 60, gold: 100, bleedStacks: 2, armorHits: 1, stigma: 0 });
    return h;
}

const SNAP_FIELDS = ['id', 'hp', 'maxHp', 'block', 'ct', 'od', 'maxOd', 'isOD', 'isBreak', 'isFlying',
    'dodgeCount', 'bleedStacks', 'poisonTurns', 'gold', 'stolenGold', 'isVulnerable', 'armorHits',
    'atk', 'critBonus', 'critChance', 'speedBonus', 'phase', 'chargeTurns', 'heroicTurns', 'rageTurns',
    'nextDamageBonus', 'forceSpecialNext', 'forceSacrificeNext', 'pendingDelayedHeal',
    'pendingLightningRecall', 'awakenPending', 'forceSlayerNext', 'escaped', 'stigma'];

function snapEntity(e) {
    const o = {};
    SNAP_FIELDS.forEach(k => { if (e[k] !== undefined) o[k] = e[k]; });
    o.fx = (e.activeEffects || []).map(x => ({ ...x }));
    return o;
}

// 探測：在多種狀態下反覆呼叫 getIntent，依 id+desc 去重，收集該敵人所有可到達的招式
function discoverCases(enemyId) {
    const probe = createEnemyInstance(enemyId, 0);
    const phases = (probe.phaseThresholds && probe.phaseThresholds.length) ? [1, 2] : [1];
    const flagSets = [{}, { forceSpecialNext: true }, { forceSacrificeNext: true },
        { pendingDelayedHeal: true }, { pendingLightningRecall: true },
        { forceSlayerNext: true }, { isFlying: true }];
    const maxCt = Math.max(probe.maxCt || 0, 4);
    const found = new Map();

    CombatSystem.setActiveHero(null);
    phases.forEach(phase => [false, true].forEach(brk => {
        flagSets.forEach((flags, fi) => {
            for (let ct = 0; ct <= maxCt; ct++) {
                const state = { phase, brk, flags, ct };
                for (let k = 0; k < 8; k++) {
                    withSeed(`probe|${enemyId}|${phase}|${brk}|${fi}|${ct}|${k}`, () => {
                        try {
                            const e = buildAttacker(enemyId, 0, state);
                            const it = e.getIntent(1, 3, e);
                            if (!it || !it.id) return;
                            const key = `${it.id}|${it.desc}`;
                            if (!found.has(key)) found.set(key, { enemyId, state, intent: cloneIntent(it) });
                        } catch (err) { /* 該狀態不合法，略過 */ }
                    });
                }
            }
        });
    }));
    return [...found.values()];
}

function runCase(c, tier, legacy) {
    const key = `${c.enemyId}|${c.intent.id}|${c.intent.desc}|t${tier}`;
    const prev = { hero: CombatSystem._activeHero, enemies: CombatSystem._activeEnemies, log: CombatSystem._battleLog };
    const logs = [];
    const log = (m) => logs.push(String(m));
    const result = withSeed(`run|${key}`, () => {
        CombatSystem.setActiveHero(null);
        CombatSystem.setBattleLog(log);
        const attacker = buildAttacker(c.enemyId, tier, c.state);
        const allies = ['goblin', 'undead'].map(id => createEnemyInstance(id, tier));
        allies[0].hp = Math.max(1, Math.ceil(allies[0].maxHp / 2));
        const enemies = [attacker, ...allies];
        const hero = makeTestHero();
        CombatSystem.setActiveHero(hero);
        CombatSystem.setActiveEnemies(enemies);
        let err = null;
        try {
            const intent = cloneIntent(c.intent);
            if (legacy) { delete intent.effects; delete intent.run; }
            attacker.executeAction(attacker, intent, hero, CombatSystem, log, enemies);
        } catch (e) { err = String((e && e.message) || e); }
        return { err, log: logs, hero: snapEntity(hero), enemies: enemies.map(snapEntity) };
    });
    CombatSystem._activeHero = prev.hero;
    CombatSystem._activeEnemies = prev.enemies;
    CombatSystem._battleLog = prev.log;
    return [key, result];
}

function runAll(cases, legacy) {
    const out = {};
    cases.forEach(c => [0, 1, 2].forEach(t => { const [k, r] = runCase(c, t, legacy); out[k] = r; }));
    return out;
}

function diffSnapshots(a, b) {
    const diffs = [];
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(key => {
        const x = a[key], y = b[key];
        if (!x || !y) { diffs.push({ key, what: x ? '只存在於 A' : '只存在於 B' }); return; }
        if (JSON.stringify(x) === JSON.stringify(y)) return;
        const what = [];
        if (x.err !== y.err) what.push(`err: ${x.err} → ${y.err}`);
        const fieldDiff = (label, p, q) => new Set([...Object.keys(p), ...Object.keys(q)]).forEach(f => {
            if (JSON.stringify(p[f]) !== JSON.stringify(q[f])) what.push(`${label}.${f}: ${JSON.stringify(p[f])} → ${JSON.stringify(q[f])}`);
        });
        fieldDiff('hero', x.hero, y.hero);
        const n = Math.max(x.enemies.length, y.enemies.length);
        for (let i = 0; i < n; i++) fieldDiff(`enemy[${i}]`, x.enemies[i] || {}, y.enemies[i] || {});
        if (JSON.stringify(x.log) !== JSON.stringify(y.log)) {
            const i = x.log.findIndex((l, idx) => l !== y.log[idx]);
            const idx = i === -1 ? Math.min(x.log.length, y.log.length) : i;
            what.push(`log[${idx}]: "${x.log[idx]}" → "${y.log[idx]}"`);
        }
        diffs.push({ key, what: what.join(' ; ') });
    });
    return diffs;
}


export const DebugSystem = {
    _game: null,
    init(game) { this._game = game; },

    listEnemies() {
        console.log('可用敵人 id：', Object.keys(ENEMY_DATABASE));
    },

   // 🟢 整理後的冒煙測試：每隻敵人在一般/Break 狀態各抽 30 次意圖，確認不會丟錯且有 id/desc
    checkEnemies() {
        let bad = 0;
        Object.keys(ENEMY_DATABASE).forEach(id => {
            try {
                const e = createEnemyInstance(id, 0);
                for (const brk of [false, true]) {
                    e.isBreak = brk;
                    e.ct = e.maxCt;   // 讓滿 CT 技也有機會被抽到
                    for (let i = 0; i < 30; i++) {
                       const it = e.getIntent(1, 1, e);
                       if (!it || !it.id || !it.desc) throw new Error(`意圖缺欄位: ${JSON.stringify(it)}`);
                    }
                }
            } catch (err) { bad++; console.error(`❌ ${id}`, err); }
        });
        console.log(bad === 0 ? `✅ ${Object.keys(ENEMY_DATABASE).length} 隻敵人意圖檢查通過` : `⚠️ ${bad} 隻有問題`);
    },

    listCharacters() {
        console.log('可用角色 id：', getAllCharacterIds());
    },

    // 🟢 新增：查詢可用卡片（含起始牌組+獎池，因為 REWARD_CARD_POOL 已涵蓋所有帶 theme 的角色卡）
    listCards() {
        console.table(REWARD_CARD_POOL.map(c => ({
            id: c.id, name: c.name, theme: c.theme || '(base)', cost: c.cost, implemented: c.implemented !== false
        })));
    },

    /**
     * 啟動測試戰鬥
     */
    startTestBattle(opts = {}) {
        if (!this._game) { console.error('⚠️ DebugSystem 尚未初始化'); return; }

        const characterId = opts.characterId || 'hero';
        const enemyIds = opts.enemies && opts.enemies.length > 0 ? opts.enemies : ['goblin'];

        const charData = getCharacterData(characterId);
        const charDeck = getCharacterDeck(characterId);
        if (!charData || !charDeck) {
            console.error(`⚠️ 找不到角色 id=${characterId}，可用角色:`, getAllCharacterIds());
            return;
        }

        const hero = JSON.parse(JSON.stringify(charData));
        gameState._restoreFunctionFields(hero, charData);

        if (opts.maxHp != null) hero.maxHp = opts.maxHp;
        hero.hp = opts.hp != null ? opts.hp : hero.maxHp;
        if (opts.maxMana != null) hero.maxMana = opts.maxMana;
        if (opts.mana != null) hero.mana = opts.mana;
        if (opts.atk != null) hero.atk = opts.atk;
        if (opts.critBonus != null) hero.critBonus = opts.critBonus;
        if (opts.speedBonus != null) hero.speedBonus = opts.speedBonus;
        if (opts.atkCount != null) hero.atkCount = opts.atkCount;
        if (opts.armorMax != null) hero.armorMax = opts.armorMax;
        if (opts.deckCapacity != null) hero.deckCapacity = opts.deckCapacity;
        if (opts.gold != null) hero.gold = opts.gold;

        const deckSys = new DeckSystem(charDeck);

        const enemies = enemyIds
            .map(id => {
                const inst = createEnemyInstance(id, opts.scaleTier || 0);
                if (!inst) console.warn(`⚠️ 找不到敵人 id=${id}，已略過`);
                return inst;
            })
            .filter(Boolean);

        if (enemies.length === 0) {
            console.error('⚠️ 沒有任何有效敵人，測試關卡取消');
            return;
        }

        gameState.hero = hero;
        gameState.deckSys = deckSys;

        // 🟢 修正：game.scene.start() 不會自動停掉其他場景，
        // 需要明確 stop 掉 MapScene / 舊的 BattleScene，避免底下畫面殘留、按鈕仍可互動
        ['MapScene', 'BattleScene'].forEach(key => {
            const sc = this._game.scene.getScene(key);
            if (sc && sc.scene.isActive()) {
                this._game.scene.stop(key);
            }
        });

        this._game.scene.start('BattleScene', {
            hero,
            deckSys,
            node: { type: 'BATTLE' },
            __debugOverride: { enemies }
        });

        console.log(`🧪 測試關卡啟動：角色[${characterId}] 敵人[${enemyIds.join(', ')}]`, hero);
    },

    // 🟢 新增：獲得指定卡片，用來測試新卡效果
    // opts.count：張數（預設1）
    giveCard(cardId, opts = {}) {
        const cardDef = REWARD_CARD_POOL.find(c => c.id === cardId);
        if (!cardDef) {
            console.error(`⚠️ 找不到卡片 id=${cardId}，可用 DEBUG.listCards() 查詢`);
            return;
        }

        const count = opts.count || 1;
        const battleScene = this._game.scene.getScene('BattleScene');
        const isBattleRunning = battleScene && battleScene.scene.isActive();
        const targetDeckSys = isBattleRunning ? battleScene.deckSys : gameState.deckSys;

        if (!targetDeckSys) {
            console.error('⚠️ 目前沒有可用的牌組（未在戰鬥中，也沒有 gameState.deckSys），請先 DEBUG.startTestBattle(...)');
            return;
        }

        for (let i = 0; i < count; i++) {
            const newCard = DeckSystem.instantiateCardDef(cardDef);
            targetDeckSys.originalDeck.push(newCard);
            if (isBattleRunning) {
                targetDeckSys.hand.push(newCard); // 🟢 戰鬥中直接塞進手牌，立刻可打
            }
        }

        if (isBattleRunning) {
            battleScene.renderHandUI();
            battleScene.updateUI();
        }

        console.log(`🧪 已獲得卡片 [${cardDef.name}] x${count}${isBattleRunning ? '（已直接放入手牌）' : '（已加入牌組收藏，下次抽牌可能抽到）'}`);
    },

    // 🟢 直接跳到「指定區域作為本輪壓軸」：用來測 regionBoss 與通關流程（需先進入地圖畫面）
    jumpToFinalRegion(regionId = 'region_deadcity') {
        if (!gameState.hero) { console.error('⚠️ 請先開始一局遊戲（進入地圖後再呼叫）'); return; }
        gameState.regionsCompleted = gameState.regionsPerRun - 1;
        gameState.pendingRegionChoices = null;
        gameState.chooseRegion(regionId);
        const mapScene = this._game.scene.getScene('MapScene');
        if (mapScene && mapScene.scene.isActive()) mapScene.scene.restart();
        console.log(`🧪 已跳到壓軸區域 [${regionId}]（regionsCompleted=${gameState.regionsCompleted}，敵人為最高成長等級）`);
    },

        /**
     * 招式對照測試
     *  DEBUG.compareMoves({ save: 'baseline' })        存基準快照到 localStorage
     *  DEBUG.compareMoves({ against: 'baseline' })     與已存快照比對
     *  DEBUG.compareMoves({ legacyVsNew: true })       同一份程式，比對「新路徑」vs「移除 effects/run 的舊路徑」
     *  選項 enemyId：只測單一敵人
     * 每次執行都會先做種子自洽檢查（同一批案例跑兩次必須完全相同）
     */
    compareMoves(opts = {}) {
        const ids = opts.enemyId ? [opts.enemyId] : Object.keys(ENEMY_DATABASE);
        const cases = [];
        const coverage = {};
        ids.forEach(id => {
            if (!ENEMY_DATABASE[id]) { console.error(`⚠️ 找不到敵人 ${id}`); return; }
            const cs = discoverCases(id);
            coverage[id] = cs.map(c => c.intent.id).filter((v, i, a) => a.indexOf(v) === i).sort().join(', ');
            cases.push(...cs);
        });
        console.log(`🧪 探測到 ${cases.length} 個招式案例（×3 個 scaleTier = ${cases.length * 3} 次執行）`);
        console.table(coverage);

        const passA = runAll(cases, false);
        const passB = runAll(cases, false);
        const self = diffSnapshots(passA, passB);
        if (self.length > 0) {
            console.error(`❌ 種子自洽失敗：同一批案例兩次結果不同（${self.length} 筆），隨機來源沒被完全固定`);
            console.table(self);
            return { ok: false, selfCheck: self };
        }
        console.log('✅ 種子自洽：兩次執行結果完全一致');

        const errs = Object.entries(passA).filter(([, r]) => r.err).map(([k, r]) => ({ key: k, err: r.err }));
        if (errs.length) { console.warn(`⚠️ ${errs.length} 筆執行時丟出例外（基準中保留）`); console.table(errs); }

        if (opts.save) {
            try {
                localStorage.setItem(MOVE_SNAP_PREFIX + opts.save, JSON.stringify(passA));
                console.log(`💾 已存快照 [${opts.save}]（${Object.keys(passA).length} 筆）`);
            } catch (e) { console.error('⚠️ 存入 localStorage 失敗（可能超過容量）：', e); }
        }

        let other = null, label = '';
        if (opts.against) {
            const raw = localStorage.getItem(MOVE_SNAP_PREFIX + opts.against);
            if (!raw) { console.error(`⚠️ 找不到快照 [${opts.against}]`); return { ok: false }; }
            other = JSON.parse(raw); label = `快照 [${opts.against}]`;
            // 只測單一敵人時，只比對該敵人的案例
            if (opts.enemyId) Object.keys(other).forEach(k => { if (!k.startsWith(opts.enemyId + '|')) delete other[k]; });
        } else if (opts.legacyVsNew) {
            other = runAll(cases, true); label = '舊路徑（移除 effects/run）';
        }
        if (other) {
            const diffs = diffSnapshots(passA, other);
            if (diffs.length === 0) console.log(`✅ 與${label}比對：零差異（${Object.keys(passA).length} 筆）`);
            else { console.error(`❌ 與${label}比對：${diffs.length} 筆差異`); console.table(diffs); }
            return { ok: diffs.length === 0, diffs };
        }
        return { ok: true, cases: cases.length };
    },

    // 🧪 Step 1：驗證 MoveRunner 骨架本身（用臨時 handler，不依賴任何真實招式）
    testMoveRunner() {
        const hero = makeTestHero();
        const attacker = createEnemyInstance('undead', 0);
        const goblin = createEnemyInstance('goblin', 0);
        goblin.hp = Math.ceil(goblin.maxHp / 2);               // 讓 goblin 成為血量比例最低的友軍
        const other = createEnemyInstance('skeleton', 0);
        const enemies = [attacker, goblin, other];

        const seen = [];
        MOVE_HANDLERS.__probe = (ctx) => seen.push({ to: ctx.to, ids: ctx.targets.map(t => t.id), ct: ctx.attacker.ct });
        MOVE_HANDLERS.__halt = (ctx) => { ctx.halt = true; seen.push({ halt: true }); };

        const prevHero = CombatSystem._activeHero;
        CombatSystem.setActiveHero(hero);
        const results = [];
        const check = (name, ok) => results.push({ 測試: name, 結果: ok ? '✅' : '❌' });
        const run = (intent, setup) => {
            seen.length = 0;
            attacker.ct = 3; hero.hp = 60;
            if (setup) setup();
            MoveRunner.execute(CombatSystem, attacker, hero, intent, () => {}, enemies);
        };
        const probeTo = (to) => { run({ effects: ['__probe'], to }); return seen[0] ? seen[0].ids : null; };

        try {
            // 目標解析
            check('to=hero', JSON.stringify(probeTo('hero')) === JSON.stringify(['hero']));
            check('to=self', JSON.stringify(probeTo('self')) === JSON.stringify(['undead']));
            check('to=allies (含自己，3 隻)', (probeTo('allies') || []).length === 3);
            const oa = probeTo('otherAllies') || [];
            check('to=otherAllies (2 隻，不含自己)', oa.length === 2 && !oa.includes('undead'));
            check('to=lowestAlly = 半血 goblin', JSON.stringify(probeTo('lowestAlly')) === JSON.stringify(['goblin']));
            const ra = probeTo('randomAlly') || [];
            check('to=randomAlly (1 隻，不含自己)', ra.length === 1 && ra[0] !== 'undead');

            // 函式型欄位
            check('resolve 函式/常數', MoveRunner.resolve(() => 7, {}) === 7 && MoveRunner.resolve(5, {}) === 5);

            // consumeCt 時機（attacker.ct 起始 3）
            run({ effects: ['__probe'], to: 'self', consumeCt: 2 });
            check('consumeCt after：effect 看到 3，結束後 1', seen[0].ct === 3 && attacker.ct === 1);
            run({ effects: ['__probe'], to: 'self', consumeCt: 2, consumeCtTiming: 'before' });
            check('consumeCt before：effect 看到 1，結束後 1', seen[0].ct === 1 && attacker.ct === 1);
            run({ effects: ['__probe'], to: 'self', consumeCt: () => 3 });
            check('consumeCt 函式型：結束後 0', attacker.ct === 0);

            // when 條件
            run({ effects: ['__probe'], to: 'self', __probeWhen: () => false });
            check('[effect]When=false 略過', seen.length === 0);
            run({ effects: ['__probe'], to: 'self', __probeWhen: (ctx) => ctx.attacker === attacker });
            check('[effect]When=true 執行，ctx 可用', seen.length === 1);

            // 玩家已死的防呆
            run({ effects: ['__probe'] }, () => { hero.hp = 0; });
            check('玩家已死：對 hero 的 effect 略過', seen.length === 0);
            run({ effects: ['__probe'], to: 'self' }, () => { hero.hp = 0; });
            check('玩家已死：對 self 的 effect 仍執行', seen.length === 1);

            // run 保底與順序、halt
            const order = [];
            MOVE_HANDLERS.__order = () => order.push('effect');
            run({ effects: ['__order'], to: 'self', run: () => order.push('run') });
            check('run 在 effects 之後執行', order.join(',') === 'effect,run');
            run({ effects: ['__halt', '__probe'], to: 'self' });
            check('ctx.halt 中止後續 effects', seen.length === 1 && seen[0].halt === true);
            delete MOVE_HANDLERS.__order;

            // 未知 effect 不丟例外
            const origErr = console.error;
            console.error = () => {};
            let threw = false;
            try { run({ effects: ['__nope'], to: 'self' }); } catch (e) { threw = true; }
            console.error = origErr;
            check('未知 effect 不丟例外', !threw);

            // 分流：只有 run、沒有 effects 的招式也要走 MoveRunner
            seen.length = 0;
            CombatSystem.executeEnemyIntent(attacker, { id: 'T', type: 'SPECIAL', run: () => seen.push('run-only') }, hero, () => {}, enemies);
            check('executeEnemyIntent 分流（只有 run）', seen[0] === 'run-only');
            CombatSystem.executeEnemyIntent(attacker, { id: 'T2', type: 'SPECIAL', effects: ['__probe'], to: 'self' }, hero, () => {}, enemies);
            check('executeEnemyIntent 分流（effects）', seen.length === 2);
        } finally {
            delete MOVE_HANDLERS.__probe;
            delete MOVE_HANDLERS.__halt;
            CombatSystem._activeHero = prevHero;
        }

        console.table(results);
        const ok = results.every(r => r.結果 === '✅');
        console.log(ok ? '✅ MoveRunner 骨架測試全數通過' : '❌ 有測試失敗');
        return ok;
    },

};