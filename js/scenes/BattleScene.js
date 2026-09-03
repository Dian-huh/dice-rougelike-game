import { gameState } from '../data/gameState.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { RewardSystem } from '../systems/RewardSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { BattleSetup } from '../systems/BattleSetup.js';
import { EffectEngine } from '../systems/EffectEngine.js';
import { AttackFlowSystem } from '../systems/AttackFlowSystem.js';
import { CardPlaySystem } from '../systems/CardPlaySystem.js';
import { UIInteractionSystem } from '../systems/UIInteractionSystem.js';
import { BattleFlowSystem } from '../systems/BattleFlowSystem.js';

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
        this._attackFlowRunning = false;
        this.enemyDisplays = null;

        // UI 區塊
        this.heroText = this.add.text(40, 20, '', { fontSize: '15px', fill: '#4efa7b', lineSpacing: 4 });
        this.diceBoardText = this.add.text(280, 140, '', { fontSize: '15px', fill: '#00ffff', align: 'center', backgroundColor: '#222', padding: { x: 10, y: 8 } });

        this.createChatLogUI();
         // 按鈕區
        this.actionBtn = this.createButton(620, 360, '🎲 擲攻擊骰並結算', () => this.resolveAttackPhase());
        this.skillBtn = this.createButton(40, 360, '✨ 主動技能 (定骰)', () => this.toggleSkillPicker());

        this._dicePickerOnChosen = null;
        this.dicePickerSession = UIInteractionSystem.createDicePickerSession(
            this,
            '請選擇下一次攻擊骰的指定數字 (1~6):',
            (i) => {
                const cb = this._dicePickerOnChosen;
                this._dicePickerOnChosen = null;   // 🔴 一定要在呼叫cb之前先清空，避免殘留
                if (cb) {
                    cb(i);
                } else {
                    this.hero.overrideDice = i;
                    this.hero.cdActiveSkill = 3;
                    this.appendLog(`✨ [主動技能] 指定下次攻擊骰為【 ${i} 】點`, 'player');
                    CombatSystem.tickActionDOT(this.hero, (m) => this.appendLog(m, 'player'));   // 🟢 新增
                    this.updateUI();
                }
            }
        );

        // 🟢 新增：常駐「查看教學」按鈕，玩家隨時可重看，不受 localStorage 旗標影響
        this.tutorialBtn = this.createButton(700, 5, '📖 教學', () => this.openTutorial());
        this.blessingBtn = this.createButton(700, 40, '🔱 查看加護', () => this.toggleBlessingPanel());
        this.blessingPanelContainer = null;
        this.deckBtn = this.createButton(700, 75, '🎴 查看牌組', () => this.toggleDeckPanel());
        this.deckPanelContainer = null;


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

    toggleBlessingPanel() {
        if (this.blessingPanelContainer) {
            this.blessingPanelContainer.destroy();
            this.blessingPanelContainer = null;
            return;
        }
        if (this.isPickingTarget || this.rerollPromptContainer) return;

        const effects = EffectEngine.getVisibleEffects(this.hero);
        const container = this.add.container(0, 0).setDepth(1800);
        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.9).setInteractive();
        const title = this.add.text(425, 50, '🔱 目前持有的加護 / 被動', { fontSize: '18px', fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        if (effects.length === 0) {
            const emptyText = this.add.text(425, 150, '目前沒有任何加護或被動效果。', { fontSize: '14px', fill: '#aaaaaa' }).setOrigin(0.5);
            container.add(emptyText);
        } else {
            effects.forEach((e, idx) => {
                const y = 100 + idx * 36;
                const line = this.add.text(150, y, `• ${e.statusText}`, { fontSize: '14px', fill: '#eeeeee', wordWrap: { width: 550 } });
                container.add(line);
            });
        }

        const closeBtn = this.add.text(425, 480, '[ 關閉 ]', {
            fontSize: '15px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 12, y: 6 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              container.destroy();
              this.blessingPanelContainer = null;
          });
        container.add(closeBtn);

        this.blessingPanelContainer = container;
    }

    toggleDeckPanel() {
        if (this.deckPanelContainer) {
            this.closeDeckPanel();
            return;
        }
        if (this.isPickingTarget || this.rerollPromptContainer || this.blessingPanelContainer) return;

        const groups = this.deckSys.getCollectionSummary();
        const container = this.add.container(0, 0).setDepth(1800);
        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.9).setInteractive();
        const title = this.add.text(425, 25, `🎴 目前牌組收藏 (${this.deckSys.originalDeck.length}/${this.hero.deckCapacity || '∞'})`, { fontSize: '16px', fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        // 🟢 可捲動區域：卡片群組全部放進 gridContainer，viewport 外的部分靠遮罩隱藏
        const viewportX = 20, viewportY = 60, viewportW = 810, viewportH = 400;
        const gridContainer = this.add.container(0, 0);
        container.add(gridContainer);

        const perRow = 5;
        groups.forEach((g, idx) => {
            const col = idx % perRow;
            const row = Math.floor(idx / perRow);
            const x = 90 + col * 140;
            const y = viewportY + 40 + row * 95;

            const { cost } = CombatSystem.getDisplayCost(g.card, this.hero, this.battleCtx);
            const costLabel = (typeof g.card.getCost === 'function') ? `${cost}費(浮動)` : `${cost}費`;
            const countLabel = g.count > 1 ? ` x${g.count}` : '';

            const cardBg = this.add.rectangle(x, y, 120, 78, 0x222233).setStrokeStyle(2, 0x00ffff);
            const nameText = this.add.text(x - 55, y - 33, `${g.card.name}${countLabel}`, { fontSize: '12px', fill: '#fff', wordWrap: { width: 110 } });
            const costText = this.add.text(x - 55, y - 14, costLabel, { fontSize: '10px', fill: '#66ccff' });
            const descText = this.add.text(x - 55, y + 2, g.card.desc, { fontSize: '9px', fill: '#aaaaaa', wordWrap: { width: 110 , useAdvancedWrap: true } });

            gridContainer.add([cardBg, nameText, costText, descText]);
        });

        // 遮罩：只顯示 viewport 範圍內的內容
        const maskGraphics = this.add.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(viewportX, viewportY, viewportW, viewportH);
        maskGraphics.setVisible(false);
        gridContainer.setMask(maskGraphics.createGeometryMask());

        // 捲動範圍計算
        const totalRows = Math.ceil(groups.length / perRow);
        const totalContentHeight = totalRows * 95;
        const maxScroll = Math.max(0, totalContentHeight - viewportH + 40);

        const scrollBy = (delta) => {
            const newY = Phaser.Math.Clamp(gridContainer.y - delta, -maxScroll, 0);
            gridContainer.y = newY;
        };

        // 滑鼠滾輪（桌面）
        this._deckWheelHandler = (pointer, objs, dx, dy) => scrollBy(-dy * 0.5);
        this.input.on('wheel', this._deckWheelHandler);

        // 上下按鈕（觸控/手機）
        if (maxScroll > 0) {
            const upBtn = this.add.text(810, viewportY + 20, '▲', { fontSize: '20px', fill: '#66ccff', backgroundColor: '#222', padding: { x: 6, y: 4 } })
                .setInteractive({ useHandCursor: true }).on('pointerdown', () => scrollBy(95));
            const downBtn = this.add.text(810, viewportY + viewportH - 20, '▼', { fontSize: '20px', fill: '#66ccff', backgroundColor: '#222', padding: { x: 6, y: 4 } })
                .setInteractive({ useHandCursor: true }).on('pointerdown', () => scrollBy(-95));
            container.add([upBtn, downBtn]);
        }

        const closeBtn = this.add.text(425, 505, '[ 關閉 ]', {
            fontSize: '15px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 12, y: 6 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.closeDeckPanel());
        container.add(closeBtn);

        this.deckPanelContainer = container;
        this._deckMaskGraphics = maskGraphics;
    }

    // 🟢 統一收尾：銷毀面板、遮罩，並解除 wheel 監聽（避免累積殘留監聽器）
    closeDeckPanel() {
        if (this._deckWheelHandler) {
            this.input.off('wheel', this._deckWheelHandler);
            this._deckWheelHandler = null;
        }
        if (this._deckMaskGraphics) {
            this._deckMaskGraphics.destroy();
            this._deckMaskGraphics = null;
        }
        if (this.deckPanelContainer) {
            this.deckPanelContainer.destroy();
            this.deckPanelContainer = null;
        }
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

    openDicePicker(title, onChosen) {
        this._dicePickerOnChosen = onChosen;
        this.dicePickerSession.setTitle(title);
        this.dicePickerSession.show();
    }

    toggleSkillPicker() {
        if (this.isPickingTarget || this.rerollPromptContainer) return;

        // 第一步：检查是否可以使用主动技能
        const checkResult = BattleFlowSystem.canUseActiveSkill(this.hero);
        if (!checkResult.canUse) {
            this.appendLog(checkResult.reason, 'system');
            return;
        }

        // 第二步：如果英雄有自定义的 useActiveSkill 方法，则调用
        if (typeof this.hero.useActiveSkill === 'function') {
            this.hero.useActiveSkill(CombatSystem, (m) => this.appendLog(m, 'player'));
            CombatSystem.tickActionDOT(this.hero, (m) => this.appendLog(m, 'player'));
            this.updateUI();
            return;
        }

         // 第三步：否则显示骰子选择器
        const pickerVisible = this.dicePickerSession.container && this.dicePickerSession.container.visible;
        if (pickerVisible) {
            this.dicePickerSession.hide();
        } else {
            this.openDicePicker('請選擇下一次攻擊骰的指定數字 (1~6):', null);
        }
    }

    startNewTurn() {
        // 检查战斗是否已结束
        if (this.enemies.every(e => e.hp <= 0) || this.hero.hp <= 0) return;

        this.turnCount += 1;

        // 委托给 BattleFlowSystem 处理回合初始化业务逻辑
        BattleFlowSystem.initializeTurn(
            this.hero,
            this.enemies,
            this.turnCount,
            this.deckSys,
            this.battleCtx,
            (m, sender) => this.appendLog(m, sender)
        );

        // 更新 UI
        this.renderHandUI();
        this.renderSpeedRerollButton();
        this.updateUI();
    }

    renderSpeedRerollButton() {
        if (this.speedRerollBtn) { this.speedRerollBtn.destroy(); this.speedRerollBtn = null; }

        // 使用 BattleFlowSystem 获取剩余重骰次数
        const rerollsLeft = BattleFlowSystem.getSpeedRerollsRemaining(this.hero);
        if (rerollsLeft <= 0) return;

        this.speedRerollBtn = this.add.text(500, 115, `[ 🔄 重骰速度骰 (剩餘${rerollsLeft}次) ]`, {
            fontSize: '12px', fill: '#66ccff', backgroundColor: '#222', padding: { x: 6, y: 4 }
        }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            if (this.isPickingTarget || this.rerollPromptContainer) return;
            BattleFlowSystem.consumeSpeedReroll(this.hero);
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
            const { cost: effCost, isFreeFirstCard } = CombatSystem.getDisplayCost(card, this.hero, this.battleCtx);

            let cardBg = this.add.rectangle(index * 130 + 50, 40, 120, 80, 0x333333)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.playCard(index));

            let title = this.add.text(index * 130 + 5, 10, `${card.name} (${effCost}費${isFreeFirstCard ? '🏅' : ''})`, { fontSize: '13px', fill: '#fff' });
            let desc = this.add.text(index * 130 + 5, 30, card.desc, { fontSize: '11px', fill: '#aaa', wordWrap: { width: 110 ,useAdvancedWrap: true } });

            this.handContainer.add([cardBg, title, desc]);
        });
    }

    // ============================================================
    // 🟢 目標選擇 UI：改用 UIInteractionSystem 處理
    // 保留 showEnemyTargetPicker 作為 AttackFlowSystem 的適配器
    // ============================================================

    renderEnemyUI() {
        if (this.isPickingTarget) return;
        if (this.enemyDisplays) {
            this.enemyDisplays.forEach(d => d.container.destroy());
        }
        this.enemyDisplays = [];

        // 🟢 只顯示存活的敵人，死亡的直接消失、不佔版面
        const aliveEnemies = this.enemies.filter(e => e.hp > 0);

        aliveEnemies.forEach((enemy, idx) => {
            const x = 450;
            const y = 20 + idx * 100;
            const container = this.add.container(x, y);

            const bg = this.add.rectangle(150, 35, 320, 80, 0x000000, 0)
                .setStrokeStyle(0);

            const status = `HP: ${enemy.hp}/${enemy.maxHp}`;   // 存活才會被列進來，不用再判斷已擊倒
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

    // ============================================================
    // 🟢 卡牌使用：委托给 CardPlaySystem 处理业务逻辑，
    // BattleScene 只负责显示目标选择 UI 并触发最终结算
    // ============================================================

    playCard(index) {
        if (this.isPickingTarget || this.rerollPromptContainer) return;

        const card = this.deckSys.hand[index];
        if (!card) return;

        // 第一步：验证卡牌是否可以使用（魔力、剑意等）
        const validation = CardPlaySystem.canPlayCard(card, this.hero, this.battleCtx);
        if (!validation.valid) {
            this.appendLog(validation.reason, 'system');
            return;
        }

        // 第二步：判断是否需要目标选择
        const { needsTarget, aliveEnemies } = CardPlaySystem.analyzeCardScope(card, this.enemies);

        if (needsTarget) {
            // 显示目标选择 UI，选定后回调 finalizeCardPlay
            const session = UIInteractionSystem.createTargetPickerSession(
                this,
                this.enemies,
                aliveEnemies,
                (target) => this.finalizeCardPlay(index, card, target, session)
            );
            this.uiTargetPickerSession = session;
            session.show();
            return;
        }

        // 没有需要选择的目标，直接结算
        const target = (card.scope === 'SINGLE_ENEMY') ? (aliveEnemies[0] || null) : null;
        this.finalizeCardPlay(index, card, target);
    }

    finalizeCardPlay(index, card, target, targetSession) {
        // 如果使用了目标选择 UI，需要关闭它
        if (targetSession) {
            targetSession.destroy();
            this.uiTargetPickerSession = null;
        }

        // 调用 CardPlaySystem 的最终结算方法，传递 this 作为 scene 参数
        CardPlaySystem.finalizeCardPlay(
            this.deckSys,
            this.hero,
            card,
            index,
            target,
            this.battleCtx,
            (m, sender) => this.appendLog(m, sender),
            this  // 🟢 新增：传递 scene 参数，以便卡片调用 UI 方法
        );

        // 更新 UI
        this.renderHandUI();
        this.updateUI();
        this.checkBattleEnd();
    }

// ============================================================
    // 🟢 B2重構：攻擊骰結算改由 AttackFlowSystem 驅動狀態機，
    // BattleScene 只負責畫面互動（顯示目標選擇/重骰確認框）與收尾流程控制
    // ============================================================

    // 🟢 新增：卡片/技能觸發的「偷打」——不比速度、敵方不反應，跟主攻擊流程分開但共用目標選擇UI
    triggerSoloAttack() {
        if (this.isPickingTarget || this.rerollPromptContainer) return;
        this.runSoloStep(AttackFlowSystem.beginSolo(this.battleCtx));
    }

    runSoloStep(step) {
        if (step.type === 'NEED_TARGET') {
            const session = UIInteractionSystem.createTargetPickerSession(
                this, this.enemies, step.candidates,
                (target) => this.runSoloStep(AttackFlowSystem.resumeSolo(this.battleCtx, { target }))
            );
            session.show();
        } else if (step.type === 'NEED_REROLL_CONFIRM') {
            this.promptAttackDiceReroll(step.actionDice, step.rerollsLeft, (payload) => {
                this.runSoloStep(AttackFlowSystem.resumeSolo(this.battleCtx, payload));
            });
        } else {
            this.updateUI();
            this.checkBattleEnd();
        }
    }


    resolveAttackPhase() {
        if (this.isPickingTarget || this._attackFlowRunning || this.rerollPromptContainer) return;
        this._attackFlowRunning = true;
        this.runFlowStep(AttackFlowSystem.begin(this.battleCtx));
    }

    runFlowStep(step) {
        if (step.type === 'NEED_TARGET') {
            const session = UIInteractionSystem.createTargetPickerSession(
                this, this.enemies, step.candidates,
                (target) => this.runFlowStep(AttackFlowSystem.resume(this.battleCtx, { target }))
            );
            session.show();
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
    promptAttackDiceReroll(actionDice, rerollsLeft, onResolved) {
        if (this.rerollPromptContainer) { this.rerollPromptContainer.destroy(); this.rerollPromptContainer = null; }

        const resolve = onResolved || ((payload) => this.runFlowStep(AttackFlowSystem.resume(this.battleCtx, payload)));

        const session = UIInteractionSystem.createRerollConfirmSession(this, actionDice, rerollsLeft, (payload) => {
            this.rerollPromptContainer = null;
            resolve(payload);
        });
        session.show();
        this.rerollPromptContainer = session.container;
    }

    checkBattleEnd() {
        // 使用 BattleFlowSystem 检查战斗状态
        const status = BattleFlowSystem.checkBattleStatus(this.hero, this.enemies);

        if (status.status === 'victory') {
            this.appendLog(`🎉 區域內所有敵人已被全數擊敗！戰鬥獲勝！`, 'system');

            // 清理战斗作用域的临时统计
            BattleFlowSystem.resolveBattleEnd(status, this.hero);

            // 销毁交互 UI
            if (this.handContainer) this.handContainer.destroy();
            if (this.actionBtn) this.actionBtn.destroy();
            if (this.skillBtn) this.skillBtn.destroy();
            if (this.speedRerollBtn) { this.speedRerollBtn.destroy(); this.speedRerollBtn = null; }
            if (this.rerollPromptContainer) { this.rerollPromptContainer.destroy(); this.rerollPromptContainer = null; }
            if (this.uiTargetPickerSession) { this.uiTargetPickerSession.destroy(); this.uiTargetPickerSession = null; }

            // 分流：最終樓層 Boss 戰勝利 → 遊戲通關結算；一般戰鬥勝利 → 獎勵選擇
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

        if (status.status === 'defeat') {
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
        if (this.dicePickerSession) this.dicePickerSession.hide();

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

    // 🟢 統一的「重新開始」邏輯：清空對話框、重置全域狀態、回到地圖場景讓玩家重新選角
    restartGame() {
        this.removeChatLogUI();
        gameState.resetToCharacterSelect();   // 🔴 改動：不再直接 initNewGame()（原本會固定角色）
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
        if (this.hero.stigma > 0) statusText += ` 🔱[聖痕x${this.hero.stigma}]`; 
        if (this.hero.bleedStacks > 0) statusText += ` 🩸[流血x${this.hero.bleedStacks}]`;
        const heroShock = EffectEngine.getEntry(this.hero, 'debuff_shock');
        if (heroShock) statusText += ` ⚡[電擊x${heroShock.stacks}]`;

        if (this.hero.stance !== undefined) {
            statusText += this.hero.stance === 'DRAWN' ? ` 🗡️[拔刀]` : ` 🛡️[收刀]`;
        }
        if (this.hero.swordIntent > 0) statusText += ` 💠[劍意x${this.hero.swordIntent}]`;
        if (this.hero.insightStacks > 0) statusText += ` 👁️[慧眼]`;
        if (this.hero.forceCritThisTurn) statusText += ` 🌸[必定爆擊-本回合]`;

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