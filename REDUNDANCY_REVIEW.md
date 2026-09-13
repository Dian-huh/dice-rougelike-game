# 專案冗餘與重複程式碼檢查報告

> 檢查日期：2026-09-13
> 檢查範圍：`js/` 全部 JavaScript、相關重構與系統文件
> 檢查方式：全域文字模式比對、相關模組逐段核對、現有測試執行

## 摘要

目前專案的主要重複集中在以下區域：

1. `AttackFlowSystem` 的普通攻擊與偷打流程。
2. `enemyData` 中敵人的共用暴擊與基本攻擊 Intent。
3. 多處重複篩選存活敵人與隨機選取目標。
4. `MapScene` 的兩套地圖節點渲染。
5. 獎勵卡片的全體敵人傷害流程。
6. `BattleScene` 內兩套攻擊流程 UI 適配器。
7. 重構文件之間的 API 範例重複與漂移。

不建議一次全面抽象化。應優先處理會讓規則修改必須同步修改多份的重複，並保留因遊戲規則或資料可讀性而存在的重複。

## 高優先度

### 1. 普通攻擊與偷打流程重複

位置：

- `js/systems/AttackFlowSystem.js`：`_soloRoll()`、`_soloAfterRerollDecision()`
- `js/systems/AttackFlowSystem.js`：`_rollAndProceed()`、`_afterRerollDecision()`
- `js/systems/AttackFlowSystem.js`：`_soloContinue()`、`_continueWithDice()`
- `js/systems/AttackFlowSystem.js`：`_executePlayerDiceActionSolo()`、`_executePlayerDiceAction()`

重複內容：

- 壓力效果與 `overrideDice` 處理。
- 攻擊骰重骰與重骰次數消耗。
- 取得技能與攻擊範圍。
- 篩選存活敵人與嘲諷目標。
- 執行玩家骰子技能與 DOT。

建議：

- 抽出共用的骰子解析方法。
- 抽出共用的目標解析方法。
- 抽出共用的玩家骰子技能執行方法，透過上下文區分普通流程與偷打流程。
- 保留兩條流程各自的敵方反應、速度判定與回合收尾。

風險：高。攻擊規則若只修改其中一條流程，普通攻擊與偷打可能產生不同結果。

## 中高優先度

### 2. 敵人的 `rollCrit()` 重複定義

位置：`js/data/enemyData.js` 多個敵人資料物件。

多個敵人都重複以下邏輯：

```js
rollCrit() {
    if (this.isOD) return true;
    return Math.random() < (this.critChance || 0.15);
}
```

建議：

- 將預設實作移至 `ENEMY_TEMPLATE` 或 `BASE_ENEMY`。
- 只有特殊 Boss 具有不同規則時才覆寫。

風險：低。現有實作大致一致，適合優先合併。

### 3. 敵人的基本攻擊 Intent 重複定義

位置：`js/data/enemyData.js` 各敵人的 `getIntent()`。

多處重複建立：

```js
{
    id: 'ATTACK',
    type: 'ATTACK',
    value: this.atk,
    canCrit: true,
    desc: `⚔️ 普攻 (造成 ${this.atk} 點傷害)`
}
```

建議新增：

```js
function createBasicAttackIntent(enemy) {
    return {
        id: 'ATTACK',
        type: 'ATTACK',
        value: enemy.atk,
        canCrit: true,
        desc: `⚔️ 普攻 (造成 ${enemy.atk} 點傷害)`
    };
}
```

不建議把完整的 `getIntent()` 抽成通用 AI 工廠，因為每個敵人的特殊條件仍有明顯差異。

## 中優先度

### 4. 存活敵人篩選與隨機目標選取散落各處

目前類似邏輯出現在：

- `js/systems/AttackFlowSystem.js`
- `js/systems/CardPlaySystem.js`
- `js/data/effectRegistry.js`
- `js/characters/swordsman/swordsmanData.js`
- `js/data/rewardPoolData.js`
- `js/systems/CombatSystem.js`

常見片段：

```js
const aliveEnemies = enemies.filter(e => e.hp > 0);
```

以及：

```js
const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
```

建議新增低耦合的純工具：

```js
getAliveEntities(entities)
pickRandom(items)
pickRandomAlive(entities)
```

工具不應反向依賴整個 `CombatSystem`，避免資料層與戰鬥系統形成不必要的依賴。

### 5. 獎勵卡片重複處理全體敵人傷害

位置：`js/data/rewardPoolData.js` 多張 `ALL_ENEMIES` 卡片。

共同流程：

1. 篩選 `hp > 0` 的敵人。
2. 記錄全體傷害訊息。
3. 逐一呼叫 `combatSys.applyDamageToTarget()`。

建議在 `CombatSystem` 提供：

```js
 damageAllAliveEnemies(enemies, damage, logCallback)
```

卡片本身仍保留傷害計算與特殊文字，避免把卡片規則全部塞進戰鬥系統。

### 6. `MapScene` 兩套地圖節點渲染流程近乎相同

位置：

- `js/scenes/MapScene.js`：`renderRegionMapUI()`
- `js/scenes/MapScene.js`：`renderMapUI()`

重複內容：

- 計算節點座標。
- 建立節點背景與文字。
- 計算是否可點擊。
- 綁定 `pointerdown`。
- 依可用狀態切換顏色。

建議抽出：

```js
renderMapNode(container, node, x, y, options)
```

區域圖的連線、節點可用規則與容器管理仍應保留在各自方法中。

### 7. `BattleScene` 的普通攻擊與偷打 UI 適配器重複

位置：`js/scenes/BattleScene.js`：`runSoloStep()`、`runFlowStep()`。

兩者都會處理：

- `NEED_TARGET`：建立目標選擇器。
- `NEED_REROLL_CONFIRM`：建立重骰確認 UI。
- 其他狀態：更新 UI 或結束流程。

建議抽出共用的攻擊流程步驟處理器，將回呼與後續狀態交給呼叫端傳入。

## 中低優先度

### 8. 函式還原邏輯不一致

`js/data/gameState.js` 已有遞迴的 `_restoreFunctionFields()`，可還原角色資料內所有巢狀函式。

但 `js/systems/BattleSetup.js` 的 fallback 路徑仍手動指定：

```js
hero.diceSkills = charData.diceSkills;
```

建議統一使用同一個函式還原流程，否則角色日後新增 `useActiveSkill` 或其他方法時，兩條初始化路徑可能出現不同結果。

### 9. `gameState` 同時保留新舊地圖狀態

`js/data/gameState.js` 同時維護：

- 舊系統：`mapData`、`currentFloor`
- 區域系統：`currentRegionGraph`、`currentNodeId`、`regionsCompleted`

這不完全是重複函式，但會造成狀態判斷、存檔與初始化邏輯重複維護。

建議：

- 若舊地圖已不再使用，規劃移除 legacy 欄位。
- 若仍需相容，集中在一個 legacy adapter，不要讓新舊流程散落在各系統。

## 文件冗餘與漂移

以下文件重複描述相同的重構內容：

- `REFACTOR_SUMMARY.md`
- `REFACTOR_COMPARISON.md`
- `REFACTOR_CHECKLIST.md`
- `SYSTEMS_QUICK_START.md`
- `BUGFIX_KG04_KG05.md`

已觀察到的問題：

- `finalizeCardPlay()` 的參數簽名在不同文件中不一致。
- `resolveBattleEnd()` 的呼叫方式在文件與現況不一致。
- 部分文件仍宣稱 `BattleScene` 幾乎只負責 UI，但現況仍保留流程控制與狀態防護。
- 修復文件與快速入門文件對 `scene` 參數的描述不同。

建議：

1. 保留一份描述目前 API 的文件。
2. 將比較文件標記為歷史紀錄。
3. 在快速入門文件只保留可直接執行的現況範例。

## 不建議處理的合理重複

以下重複目前具有合理性：

- 各敵人的特殊 Intent pool。
- 不同角色的骰子技能資料。
- `DeckSystem.init()` 與 `resetForNewBattle()` 的語意區分。
- 各張卡片的效果定義樣板。
- UI 面板建立與清理程式，因為各面板生命週期與內容差異較大。

過度抽象這些內容，可能降低資料可讀性，並讓單一遊戲規則需要追蹤多個工廠或設定層。

## 測試基線

執行：

```text
node js/systems/verify_order.test.mjs
```

結果：

- 通過：1
- 失敗：1

失敗測試：

- `js/systems/verify_order.test.mjs` 的「第二次行動」順序測試。
- 實際結果缺少預期的 `HERO_ATK:B`。

在重構 `AttackFlowSystem` 前，應先保留此測試並確認攻擊順序規則，避免抽取共用方法時掩蓋既有流程問題。

## 建議處理順序

1. 先處理 `AttackFlowSystem` 的骰子、目標與玩家技能執行重複。
2. 為普通攻擊與偷打流程補足測試，再進行抽取。
3. 抽出敵人共用的 `rollCrit()` 與基本攻擊 Intent。
4. 建立存活目標與隨機選取工具。
5. 抽出全體敵人傷害 helper。
6. 最後整理 `MapScene`、`BattleScene` UI 重複與 Markdown 文件。
