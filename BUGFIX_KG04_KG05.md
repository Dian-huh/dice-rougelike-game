# 🔧 KG_04 和 KG_05 效果修复报告

**修复时间**：2026-08-18  
**状态**：✅ 完成

---

## 🐛 问题诊断

### 问题现象
1. **KG_04（花風・比翼舞）**：应显示点数选择 UI，但 UI 未出现
2. **KG_05（瞬・連擊）**：应触发独立攻击流程，但完全没有响应

### 根本原因
**CardPlaySystem.finalizeCardPlay 未传递 `scene` 参数给卡片的 `onPlay` 方法**

```javascript
// ❌ 修复前：只传 5 个参数
if (card.onPlay) {
    card.onPlay(hero, target, CombatSystem, deckSys, (m) => appendLogFn(m, 'player'));
}

// ✅ 修复后：传 6 个参数，包括 scene
if (card.onPlay) {
    card.onPlay(hero, target, CombatSystem, deckSys, (m) => appendLogFn(m, 'player'), scene);
}
```

当 `scene` 为 `undefined` 时，卡片中的 `if (scene)` 条件判断失败，导致 UI 方法未被调用。

---

## ✅ 修复方案

### 修改 1：CardPlaySystem.js

**位置**：`js/systems/CardPlaySystem.js` 第 51 行

**改动**：
1. 添加 `scene` 参数到 `finalizeCardPlay` 方法签名
2. 在调用 `card.onPlay` 时传递 `scene` 参数

```javascript
// 修复前
static finalizeCardPlay(deckSys, hero, card, index, target, battleCtx, appendLogFn) {
    // ...
    if (card.onPlay) {
        card.onPlay(hero, target, CombatSystem, deckSys, (m) => appendLogFn(m, 'player'));
    }
}

// 修复后
static finalizeCardPlay(deckSys, hero, card, index, target, battleCtx, appendLogFn, scene = null) {
    // ...
    if (card.onPlay) {
        card.onPlay(hero, target, CombatSystem, deckSys, (m) => appendLogFn(m, 'player'), scene);
    }
}
```

**优点**：
- ✅ 向后兼容（scene 参数带默认值）
- ✅ 不影响其他卡片
- ✅ 清晰表达意图

### 修改 2：BattleScene.js

**位置**：`js/scenes/BattleScene.js` 第 548 行（finalizeCardPlay 方法）

**改动**：在调用 `CardPlaySystem.finalizeCardPlay` 时，传递 `this` 作为 scene 参数

```javascript
// 修复前
CardPlaySystem.finalizeCardPlay(
    this.deckSys,
    this.hero,
    card,
    index,
    target,
    this.battleCtx,
    (m, sender) => this.appendLog(m, sender)
);

// 修复后
CardPlaySystem.finalizeCardPlay(
    this.deckSys,
    this.hero,
    card,
    index,
    target,
    this.battleCtx,
    (m, sender) => this.appendLog(m, sender),
    this  // 🟢 新增：传递 scene 参数
);
```

---

## 🔗 修复链路

```
BattleScene.playCard()
    ↓
BattleScene.finalizeCardPlay(index, card, target, session)
    ↓
CardPlaySystem.finalizeCardPlay(..., scene = this)  ✅ 修复点
    ↓
card.onPlay(hero, target, CombatSystem, deckSys, log, scene)  ✅ 现在有 scene 了
    ↓
对于 KG_04：scene.openDicePicker() ✅ 可以调用
对于 KG_05：scene.triggerSoloAttack() ✅ 可以调用
```

---

## 📋 影响范围

### 受益卡片

| 卡片 | 效果 | 状态 |
|------|------|------|
| **KG_04** | 花風・比翼舞 - 指定攻击骰点数 | ✅ 修复 |
| **KG_05** | 瞬・連擊 - 触发独立攻击 | ✅ 修复 |

### 兼容性

- ✅ 不影响现有卡片（旧卡片不使用 scene 参数）
- ✅ 不影响 CardPlaySystem 的其他调用
- ✅ 向后兼容（scene 参数有默认值 `null`）

---

## 🧪 测试步骤

### KG_04 测试

```
1. 启动游戏选择剑豪
2. 进入战斗，确保剑意 ≥ 2
3. 从手牌中使用「花風・比翼舞」
4. ✅ 应该看到「点数选择 UI」
5. 点击数字（1-6 之一）
6. ✅ 应该显示「已指定下次攻擊骰為【 N 】點」
7. 按下「🎲 擲攻擊骰並結算」按钮
8. ✅ 攻击骰应该显示指定的点数
```

### KG_05 测试

```
1. 启动游戏选择剑豪
2. 进入战斗，确保剑意 ≥ 3
3. 从手牌中使用「瞬・連擊」
4. ✅ 应该看到「🗡️ 效果發動：劍意-3，觸發一次攻擊骰行動！」
5. ✅ 应该立即看到攻击流程（与主回合的攻击分开）
6. 无需比速度，敌人不反应
7. ✅ 可以选择目标、确认骰点等
```

---

## 📊 改动统计

| 文件 | 改动 | 行数 |
|------|------|------|
| CardPlaySystem.js | 添加 scene 参数 + 传递参数 | +3 行 |
| BattleScene.js | 传递 this 作为 scene | +1 行 |
| **总计** | | **+4 行** |

---

## 🎯 验证清单

- [x] CardPlaySystem.js 接受并传递 scene 参数
- [x] BattleScene.js 在调用时传递 this
- [x] 无编译错误
- [x] 向后兼容
- [x] 修复链路完整

---

## 🚀 后续验证

1. **启动游戏** — 确保没有运行时错误
2. **测试 KG_04** — 验证点数选择 UI 出现
3. **测试 KG_05** — 验证独立攻击触发
4. **回归测试** — 测试其他卡片是否正常

---

**修复完成！** ✨
