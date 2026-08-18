# BattleScene.js 重構總結

**完成時間**：2026-08-18

## 🎯 重構目標

將 BattleScene.js 的職責從「業務邏輯 + UI 渲辭 + 事件調度」分離為：
- **BattleScene**：純 UI 渲辭 + 事件監聽
- **3 個新系統**：業務邏輯、UI 交互、流程控制

---

## 📊 改動總覽

### 抽出的模組

| 模組 | 職責 | 方法數 | 檔案 |
|------|------|--------|------|
| **CardPlaySystem** | 卡牌使用的所有業務邏輯 | 3 | `js/systems/CardPlaySystem.js` |
| **UIInteractionSystem** | UI 交互流程（目標選擇、重骰、骰子選擇） | 3 個 session 工廠 | `js/systems/UIInteractionSystem.js` |
| **BattleFlowSystem** | 戰鬥流程控制（回合初始化、結束判定、技能檢查） | 6 | `js/systems/BattleFlowSystem.js` |

### BattleScene.js 瘦身結果

| 指標 | 改動前 | 改動後 | 改動 |
|------|--------|--------|------|
| 行數 | ~900 行 | ~650 行 | **-250 行** |
| 業務邏輯方法 | 10+ | 0 | 全部抽出 |
| UI 渲辭方法 | 15+ | 15+ | ✅ 保留 |
| 職責數 | 3 個 | 1 個 | 聚焦 UI |

---

## 🔄 具體改動

### 1️⃣ CardPlaySystem — 卡牌使用邏輯

**抽出方法**：
```javascript
CardPlaySystem.canPlayCard(card, hero, battleCtx)
  → { valid: boolean, reason?: string }

CardPlaySystem.analyzeCardScope(card, enemies)
  → { needsTarget: boolean, aliveEnemies: array }

CardPlaySystem.finalizeCardPlay(deckSys, hero, card, index, target, battleCtx, appendLogFn)
  → 執行結算
```

**使用示例**：
```javascript
// 改動前（BattleScene 內部）
if (this.hero.mana < effCost) return;  // 業務檢查
if (card.minSwordIntent && ...) return; // 業務檢查

// 改動後（委托給系統）
const validation = CardPlaySystem.canPlayCard(card, this.hero, this.battleCtx);
if (!validation.valid) {
    this.appendLog(validation.reason, 'system');
    return;
}
```

**優點**：
- ✅ 卡牌驗證邏輯集中，易於擴展（如新增消耗檢查）
- ✅ BattleScene 不需要知道檢查細節
- ✅ 單元測試更容易

---

### 2️⃣ UIInteractionSystem — UI 交互會話

**設計理念**：每個 UI 交互返回一個「會話對象」，自動管理生命週期

**三個會話工廠**：
```javascript
// 目標選擇會話
const session = UIInteractionSystem.createTargetPickerSession(scene, enemies, aliveEnemies, onTargetChosen);
session.show();
session.destroy();

// 重骰確認會話
const confirmSession = UIInteractionSystem.createRerollConfirmSession(scene, actionDice, rerollsLeft, onResolved);
confirmSession.show();

// 骰子選擇器會話
const pickerSession = UIInteractionSystem.createDicePickerSession(scene, title, onChosen);
pickerSession.show();
```

**優點**：
- ✅ 自動管理 UI 狀態（顯示/隱藏/銷毀）
- ✅ 避免散亂的 flag 變數（`isPickingTarget`, `pendingTargetCallback` 等）
- ✅ 易於組合多個 UI 交互

---

### 3️⃣ BattleFlowSystem — 戰鬥流程

**核心方法**：
```javascript
BattleFlowSystem.initializeTurn(hero, enemies, turnCount, deckSys, battleCtx, appendLogFn)
  → 處理回合初始化：速度骰、手牌、效果觸發

BattleFlowSystem.checkBattleStatus(hero, enemies)
  → { status: 'ongoing' | 'victory' | 'defeat', allDead?: boolean }

BattleFlowSystem.canUseActiveSkill(hero)
  → { canUse: boolean, reason?: string }

BattleFlowSystem.getSpeedRerollsRemaining(hero)
BattleFlowSystem.consumeSpeedReroll(hero)
  → 管理重骰計數

BattleFlowSystem.resolveBattleEnd(hero, enemies)
  → 戰鬥結束清理
```

**優點**：
- ✅ 回合邏輯集中，易於擴展（如新增回合開始鉤子）
- ✅ 條件檢查統一，不散亂在 toggleSkillPicker/startNewTurn 中
- ✅ BattleScene 只負責呼叫和渲辭

---

## 📝 遷移指南

### BattleScene 中被改動的方法

#### playCard() — 改用 CardPlaySystem
```javascript
// 原本內部有業務邏輯檢查 → 現在委托給 CardPlaySystem
const validation = CardPlaySystem.canPlayCard(card, this.hero, this.battleCtx);
const { needsTarget, aliveEnemies } = CardPlaySystem.analyzeCardScope(card, this.enemies);
CardPlaySystem.finalizeCardPlay(...);
```

#### startNewTurn() — 改用 BattleFlowSystem
```javascript
// 原本內部呼叫 TurnSystem + EffectEngine → 現在委托給 BattleFlowSystem
BattleFlowSystem.initializeTurn(this.hero, this.enemies, this.turnCount, ...);
```

#### toggleSkillPicker() — 改用 BattleFlowSystem
```javascript
// 原本內部檢查威壓/CD → 現在委托給 BattleFlowSystem
const checkResult = BattleFlowSystem.canUseActiveSkill(this.hero);
```

#### renderSpeedRerollButton() — 改用 BattleFlowSystem
```javascript
// 原本直接呼叫 EffectEngine → 現在委托給 BattleFlowSystem
const rerollsLeft = BattleFlowSystem.getSpeedRerollsRemaining(this.hero);
```

#### checkBattleEnd() — 改用 BattleFlowSystem
```javascript
// 原本內部檢查狀態 → 現在委托給 BattleFlowSystem
const status = BattleFlowSystem.checkBattleStatus(this.hero, this.enemies);
```

---

## ✅ 保留不動的方法

BattleScene 保留所有 **UI 渲辭/創建** 方法：
- ✅ `createChatLogUI()`, `appendLog()`, `createBubble()`
- ✅ `createButton()`, `createSkillPickerUI()`
- ✅ `openDicePicker()`, `toggleBlessingPanel()`, `toggleDeckPanel()`
- ✅ `renderHandUI()`, `renderEnemyUI()`, `updateUI()`
- ✅ `showGameOverUI()`, `showVictoryUI()`
- ✅ 所有 Phaser `add.text()`, `add.rectangle()` 等操作

---

## 🔗 系統間的互動

### 呼叫流向

```
BattleScene (UI 渲辭層)
    ↓
CardPlaySystem (卡牌邏輯)
    ↓
UIInteractionSystem (UI 交互)
    ↓
BattleFlowSystem (流程控制)
    ↓
TurnSystem, EffectEngine, CombatSystem (底層系統)
```

### 依賴關係

```
BattleScene 依賴：
  ├── CardPlaySystem
  ├── UIInteractionSystem  
  ├── BattleFlowSystem
  ├── CombatSystem (成本計算)
  ├── EffectEngine (效果查詢)
  ├── AttackFlowSystem (保持不變)
  ├── RewardSystem (保持不變)
  └── TutorialSystem (保持不變)

BattleFlowSystem 依賴：
  ├── TurnSystem
  ├── EffectEngine
  └── CombatSystem

CardPlaySystem 依賴：
  └── CombatSystem

UIInteractionSystem 依賴：
  └── Phaser Scene (作為參數傳入)
```

---

## 📈 重構後的優勢

### 1. 職責分離 ✅
| 層級 | 職責 | 舉例 |
|------|------|------|
| **UI 層** | 創建和渲辭 | `this.add.text()`, `createButton()` |
| **交互層** | UI 流程 | 目標選擇 session, 重骰確認框 |
| **邏輯層** | 業務規則 | 卡牌驗證、技能檢查、回合初始化 |

### 2. 可測試性 ✅
```javascript
// CardPlaySystem 可獨立單元測試
test('canPlayCard should reject if mana insufficient', () => {
    const result = CardPlaySystem.canPlayCard(card, heroWithLowMana, battleCtx);
    assert(result.valid === false);
});
```

### 3. 可擴展性 ✅
**新增「技能冷卻延長」效果** → 只需修改 BattleFlowSystem.canUseActiveSkill()，無需改 BattleScene

### 4. 代碼易讀性 ✅
```javascript
// 改動前：混淆業務和 UI
playCard(index) {
    const card = this.deckSys.hand[index];
    const { cost: effCost } = CombatSystem.getDisplayCost(card, this.hero, this.battleCtx);
    if (this.hero.mana < effCost) { ... }
    // ... 15 行業務邏輯
    this.renderHandUI();
}

// 改動後：流程清晰
playCard(index) {
    const card = this.deckSys.hand[index];
    const validation = CardPlaySystem.canPlayCard(card, this.hero, this.battleCtx);
    if (!validation.valid) { this.appendLog(validation.reason); return; }
    // ... 清晰的流程
}
```

---

## 🔮 未來可擴展的方向

1. **HeroAbilitySystem**（可選）
   - 專門管理英雄的主動技能、被動技能
   - 解耦 `hero.useActiveSkill()` 的實現

2. **CardPlaySessionSystem**（可選）
   - 進階版的 `CardPlaySystem`
   - 自動管理卡牌使用的完整流程（驗證→目標選擇→結算）

3. **BattleEventSystem**（可選）
   - 觀察者模式：各系統對戰鬥事件感興趣
   - `battleEventBus.on('cardPlayed', ...)` 等

---

## 📋 測試清單

- [ ] 卡牌使用流程（無目標、單目標、多目標）
- [ ] 主動技能檢查（威壓、CD、自定義 useActiveSkill）
- [ ] 回合初始化（速度骰、手牌、onBattleStart hook）
- [ ] 戰鬥結束判定（敵人全滅、英雄死亡）
- [ ] 速度骰重骰（計數管理、UI 刷新）
- [ ] UI 交互（目標選擇、重骰確認、骰子選擇器）

---

**重構完成！** ✨
