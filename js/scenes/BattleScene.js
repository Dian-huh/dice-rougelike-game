import { gameState } from '../data/gameState.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { RewardSystem } from '../systems/RewardSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { TurnSystem } from '../systems/TurnSystem.js';
import { BattleSetup } from '../systems/BattleSetup.js';
import { EffectEngine } from '../systems/EffectEngine.js';
import { AttackFlowSystem } from '../systems/AttackFlowSystem.js';

export class BattleScene extends Phaser.Scene {
    constructor() { 
        super({ key: 'BattleScene' }); 
    }

    create(data) {
    // 🟢 1. 取得目前樓層（直接用模組單例 gameState，不要用 window.gameState）
        const setup = BattleSetup.resolve(data, gameState);
        this.isFinalBoss = setup.isFinalBoss;
        this.currentStage = setup.currentStage;
        this.enemies = setup.enemies;
        this.hero = setup.hero;
        this.deckSys = setup.deckSys;
        

        // 🟢 每場戰鬥開始前重置本場牌堆狀態（手牌/抽牌堆/棄牌堆），
        // 但 originalDeck（永久收藏，含戰利品新卡）維持不變
        this.deckSys.resetForNewBattle();

        // 🟢 每場戰鬥重置用量：找出DICE計數器，used歸零（max保留，因為是永久疊加的獎勵）
        ['reroll_attack_dice', 'reroll_speed_dice'].forEach(id => {
            const entry = EffectEngine.getEntry(this.hero, id);
            if (entry) entry.used = 0;
        });
        this.turnCount = 0;
        // 🟢 B2新增：battleCtx 是 AttackFlowSystem 的唯一資料來源，
        // playerSpeedDice/lastActionDice/firstAttackTriggeredThisBattle 的所有權都搬到這裡
        this.battleCtx = {
            hero: this.hero,
            enemies: this.enemies,
            playerSpeedDice: 0,
            lastActionDice: null,
            firstAttackTriggeredThisBattle: false,
            log: (m, sender, rightMsg) => this.appendLog(m, sender, rightMsg)
        };
        
        // 🟢 新增：目標選擇 / 攻擊骰結算狀態機相關旗標
        this.isPickingTarget = false;
        this.pendingTargetCallback = null;
        this._attackFlowRunning = false;
        this.enemyDisplays = null;

        // UI 區塊
        this.heroText = this.add.text(40, 20, '', { fontSize: '15px', fill: '#4efa7b', lineSpacing: 4 });
        this.diceBoardText = this.add.text(280, 140, '', { fontSize: '15px', fill: '#00ffff', align: 'center', backgroundColor: '#222', padding: { x: 10, y: 8 } });

        this.createChatLogUI();

        // 按鈕區
        this.actionBtn = this.createButton(620, 360, '🎲 擲攻擊骰並結算', () => this.resolveAttackPhase());
        this.skillBtn = this.createButton(40, 360, '✨ 主動技能 (定骰)', () => this.toggleSkillPicker());

        this.createSkillPickerUI();

        // 🟢 新增：常駐「查看教學」按鈕，玩家隨時可重看，不受 localStorage 旗標影響
        this.tutorialBtn = this.createButton(700, 5, '📖 教學', () => this.openTutorial());

        this.appendLog(`⚔️ 進入關卡【${this.currentStage.name}】！遇到 ${this.enemies.length} 個敵人！`, 'system');

        // 🟢 第一次進入戰鬥才自動彈出教學；看完（或跳過）後才顯示對話框、開始回合
        if (!TutorialSystem.hasSeenTutorial()) {
            TutorialSystem.showTutorialUI(this, () => {
                this.showChatLogUI();
                this.startNewTurn();
            });
        } else {
            this.showChatLogUI();
            this.startNewTurn();
        }
    }

    // 🟢 新增：手動重看教學（按鈕觸發），純粹展示，不影響戰鬥流程與回合狀態
    openTutorial() {
        TutorialSystem.showTutorialUI(this, () => {
            // 關閉即可，不需要重新開始回合或做任何遊戲狀態異動
        });
    }

    getCurrentTarget() {
        return this.enemies.find(e => e.hp > 0) || this.enemies[0];
    }

    createChatLogUI() {
        const existingLog = document.getElementById('game-chat-log');
        if (existingLog) existingLog.remove();

        const logDiv = document.createElement('div');
        logDiv.id = 'game-chat-log';
        logDiv.style.position = 'absolute';
        logDiv.style.left = '50%';
        logDiv.style.transform = 'translateX(-50%)';
        logDiv.style.bottom = '10px';
        logDiv.style.width = '780px';
        logDiv.style.height = '140px';
        logDiv.style.backgroundColor = 'rgba(15, 15, 20, 0.9)';
        logDiv.style.border = '1px solid #444455';
        logDiv.style.borderRadius = '8px';
        logDiv.style.padding = '10px';
        logDiv.style.boxSizing = 'border-box';
        logDiv.style.fontFamily = 'sans-serif';
        logDiv.style.fontSize = '12px';
        logDiv.style.overflowY = 'auto';
        logDiv.style.display = 'none';  // 🟢 改為預設隱藏，等玩家看完教學（或已看過）才顯示
        logDiv.style.flexDirection = 'column';
        logDiv.style.gap = '6px';
        logDiv.style.zIndex = '1000';

        document.body.appendChild(logDiv);
        this.logContainer = logDiv;
    }

    // 🟢 新增：顯示對話框（在教學結束或確認已看過教學後呼叫）
    showChatLogUI() {
        if (this.logContainer) this.logContainer.style.display = 'flex';
    }

    appendLog(msg, sender = 'player', rightMsg = null) {
        if (!this.logContainer) return;

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.width = '100%';

        if (sender === 'player') {
            row.style.justifyContent = 'flex-start';
            const bubble = this.createBubble(msg, '#1a382b', '#4efa7b', '#00ffaa');
            row.appendChild(bubble);
        } 
        else if (sender === 'enemy') {
            row.style.justifyContent = 'flex-end';
            const bubble = this.createBubble(msg, '#3d1c1c', '#ff6666', '#ff4444');
            row.appendChild(bubble);
        } 
        else if (sender === 'simultaneous') {
            row.style.justifyContent = 'space-between';
            const pBubble = this.createBubble(`⚡ 玩家: ${msg}`, '#1a382b', '#4efa7b', '#00ffaa');
            const eBubble = this.createBubble(`⚡ 敵人: ${rightMsg}`, '#3d1c1c', '#ff6666', '#ff4444');
            pBubble.style.maxWidth = '48%';
            eBubble.style.maxWidth = '48%';
            row.appendChild(pBubble);
            row.appendChild(eBubble);
        } 
        else if (sender === 'system') {
            row.style.justifyContent = 'center';
            const sysText = document.createElement('div');
            sysText.style.color = '#ffcc00';
            sysText.style.backgroundColor = 'rgba(255, 204, 0, 0.1)';
            sysText.style.padding = '2px 10px';
            sysText.style.borderRadius = '10px';
            sysText.style.fontSize = '11px';
            sysText.innerText = msg;
            row.appendChild(sysText);
        }

        this.logContainer.appendChild(row);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    createBubble(text, bgColor, textColor, borderColor) {
        const bubble = document.createElement('div');
        bubble.innerText = text;
        bubble.style.backgroundColor = bgColor;
        bubble.style.color = textColor;
        bubble.style.border = `1px solid ${borderColor}`;
        bubble.style.borderRadius = '6px';
        bubble.style.padding = '4px 8px';
        bubble.style.maxWidth = '75%';
        bubble.style.wordBreak = 'break-word';
        return bubble;
    }

    createButton(x, y, text, callback) {
        return this.add.text(x, y, `[ ${text} ]`, { fontSize: '15px', fill: '#00ffff', backgroundColor: '#222' })
            .setInteractive({ useHandCursor: true }).on('pointerdown', callback);
    }

    createSkillPickerUI() {
        this.pickerContainer = this.add.container(200, 160);
        let bg = this.add.rectangle(180, 40, 420, 90, 0x000000, 0.95).setStrokeStyle(2, 0xffcc00);
        let title = this.add.text(10, 5, '請選擇下一次攻擊骰的指定數字 (1~6):', { fontSize: '14px', fill: '#ffcc00' });
        this.pickerContainer.add([bg, title]);

        for (let i = 1; i <= 6; i++) {
            let btn = this.add.text((i - 1) * 65 + 15, 35, `[ ${i} ]`, { fontSize: '20px', fill: '#ffffff', backgroundColor: '#333' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.hero.overrideDice = i;
                    this.hero.cdActiveSkill = 3;
                    this.pickerContainer.setVisible(false);
                    this.appendLog(`✨ [主動技能] 指定下次攻擊骰為【 ${i} 】點`, 'player');
                    this.updateUI();
                });
            this.pickerContainer.add(btn);
        }
        this.pickerContainer.setDepth(100).setVisible(false);
    }

    toggleSkillPicker() {
        if (this.isPickingTarget || this.rerollPromptContainer) return; // 🟢 加上重骰確認框判定
        if (this.hero.isPressured) {
            this.appendLog(`⚠️ 受到【威壓】封印，本回合無法使用主動技能`, 'system');
            return;
        }
        if (this.hero.cdActiveSkill > 0) {
            this.appendLog(`⚠️ 主動技能冷卻中！還需等待 ${this.hero.cdActiveSkill} 回合`, 'system');
            return;
        }
        this.pickerContainer.setVisible(!this.pickerContainer.visible);
    }

    startNewTurn() {
        if (this.enemies.every(e => e.hp <= 0) || this.hero.hp <= 0) return;

        this.turnCount += 1;
        const { playerSpeedDice } = TurnSystem.startTurn(
            this.hero, this.enemies, this.turnCount,
            (m, sender) => this.appendLog(m, sender)
        );
        this.battleCtx.playerSpeedDice = playerSpeedDice;

        
        this.deckSys.fillHandToMax(this.hero.maxMana);

        // 🟢 修正：onBattleStart 統一在這裡呼叫一次，涵蓋 BLESSING(守護/渾身) + SPEEDRUN(戰鬥爆發)
        if (this.turnCount === 1) {
            EffectEngine.runHook('onBattleStart', this.hero, {
                log: (m, sender) => this.appendLog(m, sender),
                deckSys: this.deckSys
            });
        }

        this.appendLog(`--- 第 ${this.turnCount} 回合開始 ---`, 'system');
        this.renderHandUI();
        this.renderSpeedRerollButton();
        this.updateUI();
    }

    renderSpeedRerollButton() {
        if (this.speedRerollBtn) { this.speedRerollBtn.destroy(); this.speedRerollBtn = null; }

        const rerollsLeft = EffectEngine.getCounterRemaining(this.hero, 'reroll_speed_dice');
        if (rerollsLeft <= 0) return;

        this.speedRerollBtn = this.add.text(500, 115, `[ 🔄 重骰速度骰 (剩餘${rerollsLeft}次) ]`, {
            fontSize: '12px', fill: '#66ccff', backgroundColor: '#222', padding: { x: 6, y: 4 }
        }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            if (this.isPickingTarget || this.rerollPromptContainer) return;
            EffectEngine.consumeCounter(this.hero, 'reroll_speed_dice');
            this.battleCtx.playerSpeedDice = Phaser.Math.Between(1, 6) + CombatSystem.getEffectiveSpeedBonus(this.hero);
            this.appendLog(`🔄 重骰速度骰：新結果 [ ${this.battleCtx.playerSpeedDice} ]`, 'system');
            this.renderSpeedRerollButton();
            this.updateUI();
        });
    }

    renderHandUI() {
        if (this.handContainer) this.handContainer.destroy();
        this.handContainer = this.add.container(40, 260);

        this.deckSys.hand.forEach((card, index) => {
            let cardBg = this.add.rectangle(index * 130 + 50, 40, 120, 80, 0x333333)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.playCard(index));

            let title = this.add.text(index * 130 + 5, 10, `${card.name} (${card.cost}費)`, { fontSize: '13px', fill: '#fff' });
            let desc = this.add.text(index * 130 + 5, 30, card.desc, { fontSize: '11px', fill: '#aaa', wordWrap: { width: 110 } });

            this.handContainer.add([cardBg, title, desc]);
        });
    }

    // ============================================================
    // 🟢 目標選擇 UI：讓場上每隻敵人變成可獨立點擊的物件
    // ============================================================

    renderEnemyUI() {
        if (this.enemyDisplays) {
            this.enemyDisplays.forEach(d => d.container.destroy());
        }
        this.enemyDisplays = [];

        this.enemies.forEach((enemy, idx) => {
            const x = 450;
            const y = 20 + idx * 100;
            const container = this.add.container(x, y);

            // 高亮/可點擊用的背景框，平常透明無邊框，只有在選擇目標時才會顯示
            const bg = this.add.rectangle(150, 35, 320, 80, 0x000000, 0)
                .setStrokeStyle(0);

            const status = enemy.hp <= 0 ? '💀 (已擊倒)' : `HP: ${enemy.hp}/${enemy.maxHp}`;
            const extraStatusLine = enemy.getStatusLine ? enemy.getStatusLine() : '';
            const text = this.add.text(0, 0,
                `[ 😈 ${enemy.name} #${idx + 1} ] (${status})\n` +
                `  格擋: ${enemy.block || 0} | 攻: ${enemy.atk} | ${extraStatusLine}\n` +
                `  速度: [ ${enemy.speedDice || 0} ] | 預告意圖: ${enemy.currentIntent ? enemy.currentIntent.desc : '無'}`,
                { fontSize: '14px', fill: '#ff5555', lineSpacing: 4 }
            );

            container.add([bg, text]);
            this.enemyDisplays.push({ enemy, container, bg, text });
        });
    }

    // 顯示目標選擇 UI：只有 aliveEnemies 內的敵人可以點擊，選定後呼叫 callback(target) 並復原顯示
    showEnemyTargetPicker(aliveEnemies, callback) {
        if (!this.enemyDisplays || this.enemyDisplays.length === 0) this.renderEnemyUI();

        this.isPickingTarget = true;
        this.pendingTargetCallback = callback;
        this.appendLog(`🎯 請點選要攻擊的敵人目標...`, 'system');

        this.enemyDisplays.forEach(display => {
            if (display.enemy.hp > 0 && aliveEnemies.includes(display.enemy)) {
                display.bg.setFillStyle(0x333355, 0.35).setStrokeStyle(2, 0xffff00);
                display.bg.setInteractive({ useHandCursor: true });
                display.bg.on('pointerdown', () => this.onEnemyTargetChosen(display.enemy));
            }
        });
    }

    onEnemyTargetChosen(enemy) {
        // 復原所有敵人顯示的可點擊狀態
        this.enemyDisplays.forEach(display => {
            display.bg.removeAllListeners('pointerdown');
            display.bg.disableInteractive();
            display.bg.setFillStyle(0x000000, 0).setStrokeStyle(0);
        });

        this.isPickingTarget = false;
        const cb = this.pendingTargetCallback;
        this.pendingTargetCallback = null;

        this.appendLog(`🎯 選定目標：${enemy.name}`, 'system');

        if (cb) cb(enemy);
    }

    // ============================================================
    // 🟢 卡牌使用：依 scope 判斷是否需要目標選擇
    // ============================================================

    playCard(index) {
        if (this.isPickingTarget || this.rerollPromptContainer) return;


        const card = this.deckSys.hand[index];
        if (!card) return;

        if (this.hero.mana < card.cost) {
            this.appendLog(`⚠️ 魔力不足，無法使用 [${card.name}]`, 'system');
            return;
        }

        const scope = card.scope || 'SELF';
        const aliveEnemies = this.enemies.filter(e => e.hp > 0);

        if (scope === 'SINGLE_ENEMY' && aliveEnemies.length > 1) {
            this.showEnemyTargetPicker(aliveEnemies, (target) => {
                this.finalizeCardPlay(index, card, target);
            });
            return;
        }

        const target = (scope === 'SINGLE_ENEMY') ? (aliveEnemies[0] || null) : null;
        this.finalizeCardPlay(index, card, target);
    }

    finalizeCardPlay(index, card, target) {
        this.hero.mana -= card.cost;
        this.deckSys.playCard(index);
        CombatSystem.tickPoison(this.hero, (m) => this.appendLog(m, 'player'));

        this.appendLog(`🃏 使用卡牌 [${card.name}] (-${card.cost}費)`, 'player');

        if (card.onPlay) {
            card.onPlay(this.hero, target, CombatSystem, this.deckSys, (m) => this.appendLog(m, 'player'), this);
        }

        this.renderHandUI();
        this.updateUI();
        this.checkBattleEnd();
    }

// ============================================================
    // 🟢 B2重構：攻擊骰結算改由 AttackFlowSystem 驅動狀態機，
    // BattleScene 只負責畫面互動（顯示目標選擇/重骰確認框）與收尾流程控制
    // ============================================================

    resolveAttackPhase() {
        if (this.isPickingTarget || this._attackFlowRunning || this.rerollPromptContainer) return;
        this._attackFlowRunning = true;
        this.runFlowStep(AttackFlowSystem.begin(this.battleCtx));
    }

    // 統一收 AttackFlowSystem 回傳的 step，依 type 分派
    runFlowStep(step) {
        if (step.type === 'NEED_TARGET') {
            this.showEnemyTargetPicker(step.candidates, (target) => {
                this.runFlowStep(AttackFlowSystem.resume(this.battleCtx, { target }));
            });
        } else if (step.type === 'NEED_REROLL_CONFIRM') {
            this.promptAttackDiceReroll(step.actionDice, step.rerollsLeft);
        } else if (step.type === 'ACTION_UPDATE') {
            this.updateUI();
            this.runFlowStep(AttackFlowSystem.resume(this.battleCtx));
        } else { // 'DONE'
            this._attackFlowRunning = false;
            if (!this.checkBattleEnd()) {
                this.startNewTurn();
            }
        }
    }

    // 🟢 重構：不再遞迴自己呼叫自己，每次只顯示「當下這顆骰」的確認框，
    // 玩家選完後透過 resume() 交還給 AttackFlowSystem 決定要不要再問一次
    promptAttackDiceReroll(actionDice, rerollsLeft) {
        if (this.rerollPromptContainer) this.rerollPromptContainer.destroy();

        const container = this.add.container(0, 0).setDepth(1500);
        const bg = this.add.rectangle(620, 200, 260, 90, 0x000000, 0.95).setStrokeStyle(2, 0x66ccff);
        const text = this.add.text(500, 165, `🎲 攻擊骰結果：[ ${actionDice} ] 點`, { fontSize: '15px', fill: '#ffffff' });
        const confirmBtn = this.add.text(500, 200, '[ ✅ 確定使用 ]', { fontSize: '14px', fill: '#00ffaa' })
            .setInteractive({ useHandCursor: true });
        const rerollBtn = this.add.text(500, 230, `[ 🔄 重骰 (剩餘${rerollsLeft}次) ]`, { fontSize: '14px', fill: '#66ccff' })
            .setInteractive({ useHandCursor: true });

        container.add([bg, text, confirmBtn, rerollBtn]);
        this.rerollPromptContainer = container;

        confirmBtn.on('pointerdown', () => {
            container.destroy();
            this.rerollPromptContainer = null;
            this.runFlowStep(AttackFlowSystem.resume(this.battleCtx, { reroll: false }));
        });

        rerollBtn.on('pointerdown', () => {
            container.destroy();
            this.rerollPromptContainer = null;
            this.runFlowStep(AttackFlowSystem.resume(this.battleCtx, { reroll: true }));
        });
    }

    checkBattleEnd() {
        const allDead = this.enemies.every(e => e.hp <= 0);
        if (allDead) {
            this.appendLog(`🎉 區域內所有敵人已被全數擊敗！戰鬥獲勝！`, 'system');

            CombatSystem.resetBattleScopedStats(this.hero);

            if (this.handContainer) this.handContainer.destroy();
            if (this.actionBtn) this.actionBtn.destroy();
            if (this.skillBtn) this.skillBtn.destroy();
            if (this.speedRerollBtn) { this.speedRerollBtn.destroy(); this.speedRerollBtn = null; }
            if (this.rerollPromptContainer) { this.rerollPromptContainer.destroy(); this.rerollPromptContainer = null; }

            // 🟢 分流：最終樓層 Boss 戰勝利 → 遊戲通關結算；一般戰鬥勝利 → 照舊進入獎勵選擇
            if (this.isFinalBoss) {
                this.time.delayedCall(600, () => {
                    this.showVictoryUI();
                });
            } else {
                this.time.delayedCall(600, () => {
                    RewardSystem.showRewardUI(this, this.currentStage);
                });
            }
            return true;
        }
        if (this.hero.hp <= 0) {
            this.appendLog(`💀 勇者倒下了... 遊戲結束！`, 'system');
            this.time.delayedCall(600, () => {
                this.showGameOverUI();
            });
            return true;
        }
        return false;
    }

    // 🟢 清除戰鬥對話框 DOM 元素，避免切換場景後殘留疊在畫面上
    removeChatLogUI() {
        const existingLog = document.getElementById('game-chat-log');
        if (existingLog) existingLog.remove();
        this.logContainer = null;
    }

    // 🟢 死亡結算畫面
    showGameOverUI() {
        // 摧毀底下仍可互動的元素，避免玩家對著覆蓋層背後繼續操作
        if (this.handContainer) this.handContainer.destroy();
        if (this.actionBtn) this.actionBtn.destroy();
        if (this.skillBtn) this.skillBtn.destroy();
        if (this.pickerContainer) this.pickerContainer.setVisible(false);

        this.add.rectangle(425, 275, 850, 550, 0x000000, 0.92).setDepth(3000);
        this.add.text(425, 220, '💀 遊戲結束', { fontSize: '32px', fill: '#ff4444' }).setOrigin(0.5).setDepth(3001);
        this.add.text(425, 270, `勇者倒下於第 ${gameState.currentFloor} 層...`, { fontSize: '16px', fill: '#cccccc' }).setOrigin(0.5).setDepth(3001);

        this.add.text(425, 340, '[ 🔄 重新開始 ]', {
            fontSize: '18px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 14, y: 8 }
        }).setOrigin(0.5).setDepth(3001)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.restartGame());
    }

    // 🟢 全破結算畫面（僅在打贏最終樓層 Boss 時觸發）
    showVictoryUI() {
        this.add.rectangle(425, 275, 850, 550, 0x000000, 0.92).setDepth(3000);
        this.add.text(425, 200, '🏆 恭喜通關！', { fontSize: '32px', fill: '#ffcc00' }).setOrigin(0.5).setDepth(3001);
        this.add.text(425, 250, `你成功擊敗了滅世黑龍，拯救了世界！`, { fontSize: '16px', fill: '#cccccc' }).setOrigin(0.5).setDepth(3001);
        this.add.text(425, 290, `💰 最終金幣：${this.hero.gold || 0}　❤️ 剩餘 HP：${this.hero.hp}/${this.hero.maxHp}`, { fontSize: '14px', fill: '#4efa7b' }).setOrigin(0.5).setDepth(3001);

        this.add.text(425, 360, '[ 🔄 開始新的旅程 ]', {
            fontSize: '18px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 14, y: 8 }
        }).setOrigin(0.5).setDepth(3001)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.restartGame());
    }

    // 🟢 統一的「重新開始」邏輯：清空對話框、重置全域存檔、回到地圖場景
    restartGame() {
        this.removeChatLogUI();
        gameState.initNewGame();
        this.scene.start('MapScene');
        this.scene.stop('BattleScene');
    }

   // js/scenes/BattleScene.js 中的 nextStage() 方法：

    nextStage() {
        this.appendLog(`🗺️ 戰鬥勝利！返回地圖...`, 'system');
        
        this.time.delayedCall(500, () => {
            this.removeChatLogUI();  // 🟢 新增
            gameState.nextFloor();   // 🔑 統一只用模組單例，不再判斷 window.gameState
            this.scene.start('MapScene');
            this.scene.stop('BattleScene');
        });
    }

    updateUI() {
        let overrideText = this.hero.overrideDice !== null ? `(預定: ${this.hero.overrideDice})` : '';
        let lastDiceText = this.battleCtx.lastActionDice !== null ? `上次攻擊骰: [ ${this.battleCtx.lastActionDice} ]` : '攻擊骰: 未擲骰';
        
        this.diceBoardText.setText(
            `【第 ${this.turnCount} 回合】\n` +
            `🎲 速度骰：玩家 [ ${this.battleCtx.playerSpeedDice} ]\n` +
            `${lastDiceText} ${overrideText}`
        );

        let passivesText = this.hero.startBlock ? ` | 開局格擋: +${this.hero.startBlock}` : '';
        let statusText = '';
        if (this.hero.poisonTurns > 0) statusText += ` 🤢[劇毒x${this.hero.poisonTurns}]`;
        if (this.hero.isPressured) statusText += ` 😱[威壓中]`;
        if (this.hero.stigma > 0) statusText += ` 🔱[聖痕x${this.hero.stigma}]`; // 🟢 新增

        // 改成：
        const effAtk = CombatSystem.getEffectiveAtk(this.hero);
        const effCrit = CombatSystem.getEffectiveCritBonus(this.hero);
        const effArmorMax = CombatSystem.getEffectiveArmorMax(this.hero);

        this.heroText.setText(
            `[ 🛡️ ${this.hero.name} ]  💰 金幣: ${this.hero.gold || 0}${passivesText}${statusText}\n` +
            `HP: ${this.hero.hp}/${this.hero.maxHp} | 格擋: ${this.hero.block} | 閃避: ${this.hero.dodgeCount || 0} 次\n` +
            `魔力: ${this.hero.mana}/${this.hero.maxMana} | 攻擊力: ${effAtk}\n` +
            `爆擊增益: +${effCrit} | 回復量: x${this.hero.healRatio + this.hero.battleHealBonus}\n` +
            `護甲值: ${Math.max(0, effArmorMax - (this.hero.armorHits || 0))}/${effArmorMax} ${this.hero.isVulnerable ? '⚠️(破防中!)' : ''}\n` +
            `主動技能 CD: ${this.hero.cdActiveSkill} 回合`
        );

        // 🟢 改為渲染每隻敵人各自獨立可互動的物件，而非單一整塊文字
        this.renderEnemyUI();
    }
}