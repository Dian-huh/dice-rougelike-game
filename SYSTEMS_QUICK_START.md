# 🚀 新系統快速開始指南

## 📚 文件結構

```
js/systems/
├── CardPlaySystem.js ......................... 卡牌使用業務邏輯
├── UIInteractionSystem.js ................... UI 交互會話
├── BattleFlowSystem.js ..................... 戰鬥流程控制
├── (其他系統不變)
│   ├── CombatSystem.js
│   ├── TurnSystem.js
│   ├── EffectEngine.js
│   └── ...
└──

scenes/
└── BattleScene.js ........................... 簡化後的場景（只負責 UI）
```

---

## 🎮 如何使用各個系統

### 1️⃣ CardPlaySystem — 卡牌邏輯

**場景**：需要驗證卡牌是否可用，或執行卡牌結算

```javascript
import { CardPlaySystem } from '../systems/CardPlaySystem.js';

// ✅ 驗證卡牌
const validation = CardPlaySystem.canPlayCard(card, hero, battleCtx);
if (!validation.valid) {
    console.log(validation.reason); // ⚠️ 魔力不足...
    return;
}

// ✅ 分析卡牌範圍（是否需要選擇目標）
const { needsTarget, aliveEnemies } = CardPlaySystem.analyzeCardScope(card, enemies);
if (needsTarget) {
    showTargetPicker(aliveEnemies);
    return;
}

// ✅ 最終結算卡牌
CardPlaySystem.finalizeCardPlay(
    deckSys, hero, card, cardIndex, target, battleCtx,
    (msg, sender) => appendLog(msg, sender)  // 日誌回調
);
```

**何時使用**：
- 玩家點擊卡牌
- AI 決策卡牌使用
- 卡牌模擬（計算可能的結果）

---

### 2️⃣ UIInteractionSystem — UI 交互

**場景**：需要顯示互動 UI（目標選擇、確認框等）

```javascript
import { UIInteractionSystem } from '../systems/UIInteractionSystem.js';

// ✅ 創建目標選擇會話
const targetSession = UIInteractionSystem.createTargetPickerSession(
    scene,           // Phaser Scene
    enemies,         // 所有敵人
    aliveEnemies,    // 可選擇的敵人
    (target) => {
        console.log('玩家選擇了', target.name);
        // 進行後續操作
    }
);

// 顯示會話
targetSession.show();

// 玩家選擇後，會自動調用回調函數
// 之後可以銷毀會話
targetSession.destroy();
```

**三種會話類型**：

```javascript
// 1️⃣ 目標選擇會話
const targetSession = UIInteractionSystem.createTargetPickerSession(scene, enemies, aliveEnemies, onChosen);

// 2️⃣ 重骰確認會話
const confirmSession = UIInteractionSystem.createRerollConfirmSession(scene, diceValue, rerollsLeft, onResolved);

// 3️⃣ 骰子選擇器會話
const pickerSession = UIInteractionSystem.createDicePickerSession(scene, '選擇一個數字', onChosen);
```

**何時使用**：
- 卡牌需要目標選擇
- 攻擊骰需要確認
- 主動技能需要骰子選擇

---

### 3️⃣ BattleFlowSystem — 流程控制

**場景**：需要管理回合、技能狀態、戰鬥結束判定

```javascript
import { BattleFlowSystem } from '../systems/BattleFlowSystem.js';

// ✅ 初始化新回合
const success = BattleFlowSystem.initializeTurn(
    hero, enemies, turnCount, deckSys, battleCtx,
    (msg, sender) => appendLog(msg, sender)
);

// ✅ 檢查是否可以使用主動技能
const skillCheck = BattleFlowSystem.canUseActiveSkill(hero);
if (!skillCheck.canUse) {
    appendLog(skillCheck.reason, 'system');
    return;
}

// ✅ 獲取重骰計數
const rerollsLeft = BattleFlowSystem.getSpeedRerollsRemaining(hero);

// ✅ 消耗一次重骰
BattleFlowSystem.consumeSpeedReroll(hero);

// ✅ 檢查戰鬥狀態
const status = BattleFlowSystem.checkBattleStatus(hero, enemies);
if (status.status === 'victory') {
    // 處理勝利
} else if (status.status === 'defeat') {
    // 處理失敗
}

// ✅ 戰鬥結束清理
BattleFlowSystem.resolveBattleEnd(hero, enemies);
```

**何時使用**：
- 每回合開始
- 玩家按下主動技能按鈕
- 檢查戰鬥是否結束
- 重骰速度骰

---

## 🔄 常見流程示例

### 場景 1: 玩家使用卡牌

```javascript
playCard(cardIndex) {
    const card = this.deckSys.hand[cardIndex];
    
    // 1️⃣ 驗證
    const validation = CardPlaySystem.canPlayCard(card, this.hero, this.battleCtx);
    if (!validation.valid) {
        this.appendLog(validation.reason, 'system');
        return;
    }
    
    // 2️⃣ 分析範圍
    const { needsTarget, aliveEnemies } = CardPlaySystem.analyzeCardScope(card, this.enemies);
    
    if (needsTarget) {
        // 3️⃣ 顯示目標選擇 UI
        const session = UIInteractionSystem.createTargetPickerSession(
            this, this.enemies, aliveEnemies,
            (target) => this.finalizeCardPlay(cardIndex, card, target, session)
        );
        this.uiTargetPickerSession = session;
        session.show();
    } else {
        // 直接結算
        const target = card.scope === 'SINGLE_ENEMY' ? (aliveEnemies[0] || null) : null;
        this.finalizeCardPlay(cardIndex, card, target);
    }
}

finalizeCardPlay(cardIndex, card, target, session) {
    if (session) session.destroy();
    
    // 4️⃣ 結算卡牌
    CardPlaySystem.finalizeCardPlay(
        this.deckSys, this.hero, card, cardIndex, target, this.battleCtx,
        (m, sender) => this.appendLog(m, sender)
    );
    
    // 5️⃣ 刷新 UI
    this.renderHandUI();
    this.updateUI();
    this.checkBattleEnd();
}
```

---

### 場景 2: 開始新回合

```javascript
startNewTurn() {
    if (this.enemies.every(e => e.hp <= 0) || this.hero.hp <= 0) return;
    
    this.turnCount += 1;
    
    // 1️⃣ 初始化回合（業務邏輯）
    BattleFlowSystem.initializeTurn(
        this.hero, this.enemies, this.turnCount, this.deckSys, this.battleCtx,
        (m, sender) => this.appendLog(m, sender)
    );
    
    // 2️⃣ 刷新 UI
    this.renderHandUI();
    this.renderSpeedRerollButton();
    this.updateUI();
}
```

---

### 場景 3: 使用主動技能

```javascript
toggleSkillPicker() {
    if (this.isPickingTarget || this.rerollPromptContainer) return;
    
    // 1️⃣ 檢查是否可用
    const checkResult = BattleFlowSystem.canUseActiveSkill(this.hero);
    if (!checkResult.canUse) {
        this.appendLog(checkResult.reason, 'system');
        return;
    }
    
    // 2️⃣ 執行技能（如果有自定義實現）
    if (typeof this.hero.useActiveSkill === 'function') {
        this.hero.useActiveSkill(CombatSystem, (m) => this.appendLog(m, 'player'));
        this.updateUI();
        return;
    }
    
    // 3️⃣ 否則顯示骰子選擇器
    this.pickerContainer.visible 
        ? this.pickerContainer.setVisible(false)
        : this.openDicePicker('請選擇...' , null);
}
```

---

### 場景 4: 檢查戰鬥結束

```javascript
checkBattleEnd() {
    // 1️⃣ 檢查狀態
    const status = BattleFlowSystem.checkBattleStatus(this.hero, this.enemies);
    
    if (status.status === 'victory') {
        // 2️⃣ 清理戰鬥狀態
        BattleFlowSystem.resolveBattleEnd(this.hero, this.enemies);
        
        // 3️⃣ 銷毀交互 UI
        if (this.handContainer) this.handContainer.destroy();
        if (this.actionBtn) this.actionBtn.destroy();
        
        // 4️⃣ 顯示結算畫面
        if (this.isFinalBoss) {
            this.showVictoryUI();
        } else {
            RewardSystem.showRewardUI(this, this.currentStage);
        }
        return true;
    }
    
    if (status.status === 'defeat') {
        this.showGameOverUI();
        return true;
    }
    
    return false;
}
```

---

## 💡 設計模式

### 1. 注入式依賴 (Dependency Injection)

各系統不直接操作 Phaser Scene，而是通過回調接收依賴：

```javascript
// ❌ 不好：系統需要 scene
static finalizeCardPlay(scene, card) {
    scene.appendLog(...);  // 耦合
}

// ✅ 好：注入日誌函數
static finalizeCardPlay(card, appendLogFn) {
    appendLogFn(...);  // 解耦
}
```

### 2. 會話模式 (Session Pattern)

UI 交互返回一個會話對象，自動管理生命週期：

```javascript
const session = UIInteractionSystem.createTargetPickerSession(...);
session.show();  // 顯示
// ... 用戶交互
session.destroy();  // 清理
```

### 3. 結構化回傳 (Structured Returns)

系統方法返回結構化的結果，而不是拋出異常：

```javascript
// ❌ 不好：拋出異常
static canPlayCard(card) {
    if (!this.canAfford(card)) throw new Error('魔力不足');
}

// ✅ 好：返回結構化結果
static canPlayCard(card) {
    if (!this.canAfford(card)) {
        return { valid: false, reason: '魔力不足' };
    }
    return { valid: true };
}
```

---

## 🧪 測試示例

```javascript
// CardPlaySystem 測試
describe('CardPlaySystem', () => {
    it('should reject card if mana insufficient', () => {
        const hero = { mana: 0 };
        const card = { /* ... */ };
        
        const result = CardPlaySystem.canPlayCard(card, hero, {});
        assert(result.valid === false);
        assert(result.reason.includes('魔力不足'));
    });
});

// BattleFlowSystem 測試
describe('BattleFlowSystem', () => {
    it('should report victory when all enemies are dead', () => {
        const hero = { hp: 50 };
        const enemies = [{ hp: 0 }, { hp: 0 }];
        
        const status = BattleFlowSystem.checkBattleStatus(hero, enemies);
        assert(status.status === 'victory');
    });
});
```

---

## ⚙️ 擴展指南

### 添加新的卡牌驗證規則

```javascript
// CardPlaySystem.js
static canPlayCard(card, hero, battleCtx) {
    // ... 現有檢查 ...
    
    // ✨ 新增檢查：CD 冷卻
    if (card.cd && card.cd > 0) {
        return { valid: false, reason: `⚠️ 卡牌冷卻中！還需等待 ${card.cd} 回合` };
    }
    
    return { valid: true };
}
```

### 添加新的回合階段

```javascript
// BattleFlowSystem.js
static initializeTurn(hero, enemies, turnCount, deckSys, battleCtx, appendLogFn) {
    // ... 現有邏輯 ...
    
    // ✨ 新增：onTurnStart hook
    EffectEngine.runHook('onTurnStart', hero, {
        log: (m, sender) => appendLogFn(m, sender),
        deckSys: deckSys
    });
    
    return true;
}
```

### 添加新的 UI 會話

```javascript
// UIInteractionSystem.js
static createCustomDialogSession(scene, message, options, onChosen) {
    return {
        message: message,
        options: options,
        onChosen: onChosen,
        container: null,
        
        show() { /* 渲辭自定義對話框 */ },
        hide() { /* 隱藏 */ },
        destroy() { /* 銷毀 */ }
    };
}
```

---

## 🐛 常見陷阱

| 陷阱 | ❌ 錯誤做法 | ✅ 正確做法 |
|------|----------|---------|
| 忘記銷毀會話 | `session.show(); // 遺漏 destroy` | `session.destroy();` |
| 直接修改 hero.mana | `this.hero.mana -= cost;` | 交給 CardPlaySystem |
| 在系統中呼叫 appendLog | `appendLog(...)` 作為參數 | `appendLogFn(...)` 注入 |
| 混合業務和 UI | 在一個方法中都做 | 分離到不同系統 |

---

## 📖 相關文件

- [REFACTOR_SUMMARY.md](./REFACTOR_SUMMARY.md) — 重構總體概覽
- [REFACTOR_COMPARISON.md](./REFACTOR_COMPARISON.md) — 改動前後對比

---

**準備好使用新系統了嗎？** 🚀
