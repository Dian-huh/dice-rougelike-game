import test from 'node:test';
import assert from 'node:assert/strict';
import { AttackFlowSystem } from './AttackFlowSystem.js';

// ------------------------------------------------------------
// 最小化 Phaser mock：Phaser.Math.Between 改成從固定佇列依序吐值，
// 讓每次「擲骰」的結果在測試裡是可控、可預測的。
// ------------------------------------------------------------
function installPhaserMock(diceQueue) {
    let i = 0;
    globalThis.Phaser = {
        Math: {
            Between: () => {
                if (i >= diceQueue.length) {
                    throw new Error(`測試骰值佇列不夠用了 (index ${i})，請檢查測試案例是否漏設定`);
                }
                return diceQueue[i++];
            }
        },
        Utils: { Array: { GetRandom: (arr) => arr[0] } }
    };
}

// ------------------------------------------------------------
// 建立測試用敵人：只留下順序判定會用到的欄位
// ------------------------------------------------------------
function makeEnemy(name, speedDice) {
    return {
        name,
        hp: 100,
        maxHp: 100,
        speedDice,
        block: 0,
        dodgeCount: 0,
        executeAction() { /* 由呼叫端外部的 log 記錄，這裡不用做事 */ }
    };
}

// ------------------------------------------------------------
// 建立測試用勇者：dice=1 是普通單體攻擊、dice=6 模擬「技能3」會觸發再攻擊
// ------------------------------------------------------------
function makeHero(log) {
    return {
        name: '測試勇者',
        hp: 50, maxHp: 50,
        atk: 3, critBonus: 0, battleAtkBonus: 0, battleCritBonus: 0,
        healRatio: 1, battleHealBonus: 0,
        atkCount: 1,
        doubleNextAction: false,
        overrideDice: null,
        isPressured: false,
        activeEffects: [],
        diceSkills: {
            1: {
                name: '普通攻擊', scope: 'SINGLE_ENEMY',
                execute: (hero, enemy, combatSys, log2, flowCtx) => {
                    // flowCtx 有 totalTimes 欄位代表這是主攻擊骰流程(ctx._flow)；
                    // 沒有的話代表是偷打/再攻擊流程(ctx._solo)，用不同標籤方便測試辨認
                    const isSolo = !flowCtx || flowCtx.totalTimes === undefined;
                    log(isSolo ? `HERO_SOLO_ATK:${enemy.name}` : `HERO_ATK:${enemy.name}`);
                }
            },
            6: {
                name: '技能3(模擬再攻擊)', scope: 'SINGLE_ENEMY',
                execute: (hero, enemy, combatSys, log2, flowCtx) => {
                    log(`HERO_SKILL3:${enemy.name}`);
                    flowCtx.pendingReattacks = (flowCtx.pendingReattacks || 0) + 1;
                }
            }
        }
    };
}

function makeCtx(hero, enemies, playerSpeedDice, log) {
    return {
        hero, enemies, playerSpeedDice,
        lastActionDice: null,
        firstAttackTriggeredThisBattle: true, // 關掉先攻加成，避免干擾測試判讀
        log: (m) => { if (m) log(m); }
    };
}

// 幫忙把 begin/resume 的流程一路跑到底，遇到 NEED_TARGET 就照 pickTarget(candidates) 選擇
function runFlowToCompletion(ctx, firstStep, pickTargetFn) {
    let step = firstStep;
    while (step.type !== 'DONE') {
        if (step.type === 'NEED_TARGET') {
            const target = pickTargetFn(step.candidates);
            step = AttackFlowSystem.resume(ctx, { target });
        } else if (step.type === 'ACTION_UPDATE') {
            step = AttackFlowSystem.resume(ctx);
        } else if (step.type === 'NEED_REROLL_CONFIRM') {
            step = AttackFlowSystem.resume(ctx, { reroll: false });
        } else {
            throw new Error(`未預期的 step.type: ${step.type}`);
        }
    }
}

test('第二次行動(atkCount=2)：兩隻敵人皆PLAYER_FIRST，換目標時不應提早出手/交錯', () => {
    installPhaserMock([1, 1]); // 兩次攻擊骰都骰到「1」(普通攻擊)
    const log = [];
    const enemyA = makeEnemy('A', 5); // 速度較快
    const enemyB = makeEnemy('B', 2); // 速度較慢
    const hero = makeHero((m) => log.push(m));
    hero.atkCount = 2;
    const ctx = makeCtx(hero, [enemyA, enemyB], 10, (m) => log.push(m)); // 玩家對A、B都是PLAYER_FIRST

    // 敵人真正「行動」時要能被記錄到
    enemyA.executeAction = () => log.push('ENEMY_ACT:A');
    enemyB.executeAction = () => log.push('ENEMY_ACT:B');

    let pickCount = 0;
    const pickTarget = (candidates) => {
        pickCount += 1;
        // 第一次選A，第二次選B（刻意換目標）
        return pickCount === 1 ? candidates.find(e => e.name === 'A') : candidates.find(e => e.name === 'B');
    };

    runFlowToCompletion(ctx, AttackFlowSystem.begin(ctx), pickTarget);

    console.log('  [第二次行動] 實際 log 順序：', log);

    // 正確行為：玩家的兩次攻擊都應該先完整打完，敵人才動；
    // 且敵人動的順序要照速度(A比B快)排序，不能交錯
    assert.deepEqual(log, ['HERO_ATK:A', 'HERO_ATK:B', 'ENEMY_ACT:A', 'ENEMY_ACT:B']);
});

test('技能3再攻擊：偷打流程不應觸發敵人反應，且延後的敵人仍照速度排序補上行動', () => {
    installPhaserMock([6, 1]); // 第一次骰到6(觸發再攻擊)，再攻擊骰到1
    const log = [];
    const enemyA = makeEnemy('A', 5);  // 比玩家慢 -> PLAYER_FIRST，應延後
    const enemyC = makeEnemy('C', 20); // 比玩家快 -> ENEMY_FIRST，應立刻行動
    const hero = makeHero((m) => log.push(m));
    hero.atkCount = 1; // 只有1次主行動，靠技能3觸發再攻擊
    const ctx = makeCtx(hero, [enemyA, enemyC], 10, (m) => log.push(m));

    enemyA.executeAction = () => log.push('ENEMY_ACT:A');
    enemyC.executeAction = () => log.push('ENEMY_ACT:C');

    const pickTarget = (candidates) => candidates.find(e => e.name === 'A'); // 主行動與再攻擊都打A

    runFlowToCompletion(ctx, AttackFlowSystem.begin(ctx), pickTarget);

    console.log('  [技能3再攻擊] 實際 log 順序：', log);

    // 正確行為：
    // 1. HERO_SKILL3:A 先發動
    // 2. C比玩家快，立刻反應 (ENEMY_ACT:C 緊接在後)
    // 3. 再攻擊(偷打)是 HERO_SOLO_ATK:A，過程中不應該有任何敵人插進來反應
    // 4. 整輪結束後，A(PLAYER_FIRST)才補上行動，且只行動一次
    assert.equal(log[0], 'HERO_SKILL3:A');
    assert.equal(log[1], 'ENEMY_ACT:C');
    assert.equal(log[2], 'HERO_SOLO_ATK:A');
    assert.equal(log[3], 'ENEMY_ACT:A');
    assert.equal(log.length, 4);
    // A只能行動一次，不能因為身分在「目標」與「路人」間切換而重複行動
    assert.equal(log.filter(m => m === 'ENEMY_ACT:A').length, 1);
});

