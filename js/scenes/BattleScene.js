import { HERO_DATA } from '../characters/hero/heroData.js';
import { HERO_DECK } from '../characters/hero/heroCards.js';
import { gameState } from '../data/gameState.js';
import { getStageData } from '../data/stageData.js'; // 🟢 補上這一行！
import { DeckSystem } from '../systems/DeckSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { RewardSystem } from '../systems/RewardSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';

export class BattleScene extends Phaser.Scene {
    constructor() { 
        super({ key: 'BattleScene' }); 
    }

    create(data) {
    // 🟢 1. 取得目前樓層（直接用模組單例 gameState，不要用 window.gameState）
        const currentFloor = (gameState && gameState.currentFloor) 
            ? gameState.currentFloor 
            : 1;
        const currentStageId = `1-${currentFloor}`;

        // 🟢 2. 從 MapScene 傳入的 node 資料判斷節點類型（BATTLE / BOSS）
        const nodeType = (data && data.node && data.node.type) ? data.node.type : 'BATTLE';

        // 🟢 新增：判斷這是不是「最終樓層的 Boss 戰」，決定戰勝後要進入一般獎勵流程還是遊戲通關結算
        const totalFloors = (gameState && gameState.mapData) ? gameState.mapData.length : 5;
        this.isFinalBoss = (nodeType === 'BOSS' && currentFloor === totalFloors);

        // 🟢 3. 依樓層 + 節點類型動態取得關卡資料
        const stageInfo = getStageData ? getStageData(currentStageId, nodeType) : null;
        this.currentStage = stageInfo || { name: '冒險關卡', enemies: [] };
        this.enemies = (this.currentStage && this.currentStage.enemies) ? this.currentStage.enemies : [];

        // 🟢 4. 角色與牌組初始化（優先序：外部直接傳入 > 全域 gameState 單例 > 全新預設值）
        //     🔑 關鍵修正：這裡改用 gameState（模組單例），確保拿到的是「同一個」持續累積 buff 的 hero 物件
        if (data && data.hero) {
            this.hero = data.hero;
            this.deckSys = data.deckSys;
        } else if (gameState && gameState.hero) {
            this.hero = gameState.hero;
            this.deckSys = gameState.deckSys;
        } else {
            this.hero = JSON.parse(JSON.stringify(HERO_DATA));
            this.hero.diceSkills = HERO_DATA.diceSkills;
            this.deckSys = new DeckSystem(HERO_DECK);
        }

        // 🟢 每場戰鬥開始前重置本場牌堆狀態（手牌/抽牌堆/棄牌堆），
        // 但 originalDeck（永久收藏，含戰利品新卡）維持不變
        this.deckSys.resetForNewBattle();
        this.turnCount = 0;
        this.playerSpeedDice = 0;
        this.lastActionDice = null;

        // 🟢 新增：目標選擇 / 攻擊骰結算狀態機相關旗標
        this.isPickingTarget = false;
        this.pendingTargetCallback = null;
        this.attackPhaseState = null;
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
        if (this.isPickingTarget) return; // 🟢 目標選擇中，鎖定其他操作
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
        this.hero.mana = this.hero.maxMana;
        if (this.hero.cdActiveSkill > 0) this.hero.cdActiveSkill--;
        
        if (this.hero.isVulnerable) { this.hero.isVulnerable = false; this.hero.armorHits = 0; }

        // 🟢 第一回合發動被動 Buff（開局護盾）
        if (this.turnCount === 1 && this.hero.startBlock && this.hero.startBlock > 0) {
            this.hero.block += this.hero.startBlock;
            this.appendLog(`🛡️ [開局被動發動] 獲得 ${this.hero.startBlock} 點格擋！`, 'system');
        }

                // 🟢 新增：每回合開始發動被動 Buff（聖痕君臨：每回合施加聖痕，可跨回合疊加）
        if (this.hero.stigmaPerTurn && this.hero.stigmaPerTurn > 0) {
            this.hero.stigma += this.hero.stigmaPerTurn;
            this.appendLog(`🔱 [回合被動發動] 對敵方施加 ${this.hero.stigmaPerTurn} 層聖痕 (現為 ${this.hero.stigma} 層)`, 'system');
        }

        this.enemies.forEach(enemy => {
            if (enemy.hp > 0) {
                if (enemy.isVulnerable) { enemy.isVulnerable = false; enemy.armorHits = 0; }
                // 每回合結束自動+1CT等機制（黑龍設計文件要求），只有第一回合前不觸發
                if (this.turnCount > 1 && typeof enemy.onTurnEnd === 'function') {
                    enemy.onTurnEnd((m) => this.appendLog(m, 'system'));
                }
                enemy.speedDice = Phaser.Math.Between(1, enemy.speedDiceSides || 6) + (enemy.speedBonus || 0);
                enemy.currentIntent = enemy.getIntent(this.turnCount, enemy.speedDice, enemy);
            }
        });

        this.deckSys.fillHandToMax(this.hero.maxMana);
        this.playerSpeedDice = Phaser.Math.Between(1, 6) + this.hero.speedBonus;

        this.appendLog(`--- 第 ${this.turnCount} 回合開始 ---`, 'system');
        this.renderHandUI();
        this.updateUI();
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

    // 劇毒：設計文件是「每執行一個動作就受1點傷害」，所以在每次玩家實際行動時觸發，而不是每回合結束觸發一次
    tickPoison(entity, log) {
        if (entity.poisonTurns > 0) {
            entity.hp = Math.max(0, entity.hp - 1);
            entity.poisonTurns -= 1;
            log(`🤢 【劇毒】發作，${entity.name} 受到 1 點傷害 (剩餘 ${entity.poisonTurns} 回合)`);
        }
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
        if (this.isPickingTarget) return;

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
        this.tickPoison(this.hero, (m) => this.appendLog(m, 'player'));

        this.appendLog(`🃏 使用卡牌 [${card.name}] (-${card.cost}費)`, 'player');

        if (card.onPlay) {
            card.onPlay(this.hero, target, CombatSystem, this.deckSys, (m) => this.appendLog(m, 'player'), this);
        }

        this.renderHandUI();
        this.updateUI();
        this.checkBattleEnd();
    }

    // ============================================================
    // 🟢 攻擊骰結算：拆成狀態機，讓玩家的單一招式跟敵人各自行動解耦
    // ============================================================

    resolveAttackPhase() {
        if (this.isPickingTarget || this.attackPhaseState) return;

        this.attackPhaseState = { timesRemaining: this.hero.atkCount };
        this.hero.atkCount = 1;
        this.runAttackPhaseStep();
    }

    runAttackPhaseStep() {
        const state = this.attackPhaseState;
        if (!state) return;

        if (this.enemies.every(e => e.hp <= 0) || this.hero.hp <= 0 || state.timesRemaining <= 0) {
            this.attackPhaseState = null;
            if (!this.checkBattleEnd()) {
                this.startNewTurn();
            }
            return;
        }

        state.timesRemaining -= 1;

        let actionDice;
        if (this.hero.isPressured) {
            actionDice = 1;
            this.hero.overrideDice = null;
            this.hero.isPressured = false;
            this.appendLog(`😱 【威壓】效果發動，攻擊骰被強制鎖定為 1 點！`, 'system');
        } else {
            actionDice = this.hero.overrideDice !== null ? this.hero.overrideDice : Phaser.Math.Between(1, 6);
            this.hero.overrideDice = null;
        }
        this.lastActionDice = actionDice;

        const skill = this.hero.diceSkills[actionDice];
        const scope = (skill && skill.scope) || 'SINGLE_ENEMY';
        const aliveEnemies = this.enemies.filter(e => e.hp > 0);

        // 🟢 單體招式且場上有 2 隻以上存活敵人 -> 暫停結算，跳出目標選擇 UI
        if (scope === 'SINGLE_ENEMY' && aliveEnemies.length > 1) {
            this.showEnemyTargetPicker(aliveEnemies, (target) => {
                this.executeAttackPhaseAction(actionDice, scope, target);
            });
            return;
        }

        // 只剩 1 隻存活敵人 -> 不用多點一次，直接視為目標
        const target = aliveEnemies.length > 0 ? aliveEnemies[0] : null;
        this.executeAttackPhaseAction(actionDice, scope, target);
    }

    // 依 scope 分流結算玩家招式，敵人各自的行動邏輯維持原樣（不受玩家只打一隻敵人影響）
    executeAttackPhaseAction(actionDice, scope, chosenTarget) {
        let repeatCount = this.hero.doubleNextAction ? 2 : 1;
        if (this.hero.doubleNextAction) {
            this.appendLog(`⚡ 連打算計生效：[${actionDice}點] 連發 2 次！`, 'player');
            this.hero.doubleNextAction = false;
        }

        if (scope === 'SELF') {
            // 純自身效果：玩家招式只需執行一次，跟敵人數量無關
            for (let r = 0; r < repeatCount; r++) {
                if (this.hero.hp <= 0) break;
                this.executePlayerDiceAction(actionDice, null);
            }
            // 每隻存活敵人各自照常行動
            this.enemies.forEach(enemy => {
                if (enemy.hp > 0 && this.hero.hp > 0) this.executeEnemyAction(enemy);
            });

        } else if (scope === 'ALL_ENEMIES') {
            // 全體招式：維持原本「對每隻敵人各自比較速度骰、各自結算」的行為
            this.enemies.forEach(enemy => {
                this.resolvePlayerVsEnemy(enemy, actionDice, repeatCount);
            });

        } else {
            // SINGLE_ENEMY：只對選定目標做完整的速度骰互動，其他敵人單純各自行動
            this.enemies.forEach(enemy => {
                if (enemy.hp <= 0 || this.hero.hp <= 0) return;

                if (chosenTarget && enemy === chosenTarget) {
                    this.resolvePlayerVsEnemy(enemy, actionDice, repeatCount);
                } else {
                    this.executeEnemyAction(enemy);
                }
            });
        }

        this.updateUI();
        this.runAttackPhaseStep();
    }

    // 玩家招式 vs 單一敵人的速度骰互動（先手/後手/同時），從原本 resolveAttackPhase 內的邏輯抽出
    resolvePlayerVsEnemy(enemy, actionDice, repeatCount) {
        if (enemy.hp <= 0 || this.hero.hp <= 0) return;

        if (this.playerSpeedDice > enemy.speedDice) {
            for (let r = 0; r < repeatCount; r++) {
                if (this.hero.hp > 0 && enemy.hp > 0) this.executePlayerDiceAction(actionDice, enemy);
            }
            if (enemy.hp > 0) this.executeEnemyAction(enemy);
        } 
        else if (this.playerSpeedDice < enemy.speedDice) {
            this.executeEnemyAction(enemy);
            if (this.hero.hp > 0 && enemy.hp > 0) {
                for (let r = 0; r < repeatCount; r++) {
                    if (this.hero.hp > 0 && enemy.hp > 0) this.executePlayerDiceAction(actionDice, enemy);
                }
            }
        } 
        else {
            let pActionLog = [];
            let eActionLog = [];

            const ATTACK_DICE_IDS = [1, 3, 4, 6];
            if (enemy.isFlying && ATTACK_DICE_IDS.includes(actionDice)) {
                pActionLog.push(`💨 ${enemy.name} 處於【飛翔】狀態，攻擊骰完全打不中！`);
            } else {
                const pSkill = this.hero.diceSkills[actionDice];
                if (pSkill) pSkill.execute(this.hero, enemy, CombatSystem, (m) => pActionLog.push(m));
            }
            enemy.executeAction(enemy, enemy.currentIntent, this.hero, CombatSystem, (m) => eActionLog.push(m), this.enemies);
            this.tickPoison(this.hero, (m) => pActionLog.push(m));

            this.appendLog(pActionLog.join(' '), 'simultaneous', eActionLog.join(' '));
        }
    }

    // targetEnemy 為 null 時代表純自身效果技能，跳過飛行閃避判定
    executePlayerDiceAction(dice, targetEnemy) {
        const skill = this.hero.diceSkills[dice];
        if (!skill) return;

        if (targetEnemy) {
            const ATTACK_DICE_IDS = [1, 3, 4, 6];
            if (targetEnemy.isFlying && ATTACK_DICE_IDS.includes(dice)) {
                this.appendLog(`💨 ${targetEnemy.name} 處於【飛翔】狀態，攻擊骰完全打不中！`, 'player');
                this.tickPoison(this.hero, (m) => this.appendLog(m, 'player'));
                return;
            }
        }

        skill.execute(this.hero, targetEnemy, CombatSystem, (m) => this.appendLog(m, 'player'));
        this.tickPoison(this.hero, (m) => this.appendLog(m, 'player'));
    }

    executeEnemyAction(enemy) {
        
        if (enemy && enemy.hp > 0) {
            enemy.executeAction(
                enemy, 
                enemy.currentIntent, 
                this.hero, 
                CombatSystem, 
                (m) => this.appendLog(m, 'enemy'),
                this.enemies
            );
        }
    }

    checkBattleEnd() {
        const allDead = this.enemies.every(e => e.hp <= 0);
        if (allDead) {
            this.appendLog(`🎉 區域內所有敵人已被全數擊敗！戰鬥獲勝！`, 'system');

            this.hero.block = 0;
            this.hero.stigma = 0;
            this.hero.battleCritBonus = 0;   // 🟢 新增：戰鬥內臨時爆擊增益歸零
            this.hero.battleHealBonus = 0;   // 🟢 新增：戰鬥內臨時回復加成歸零

            if (this.handContainer) this.handContainer.destroy();
            if (this.actionBtn) this.actionBtn.destroy();
            if (this.skillBtn) this.skillBtn.destroy();

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
        let lastDiceText = this.lastActionDice !== null ? `上次攻擊骰: [ ${this.lastActionDice} ]` : '攻擊骰: 未擲骰';
        
        this.diceBoardText.setText(
            `【第 ${this.turnCount} 回合】\n` +
            `🎲 速度骰：玩家 [ ${this.playerSpeedDice} ]\n` +
            `${lastDiceText} ${overrideText}`
        );

        let passivesText = this.hero.startBlock ? ` | 開局格擋: +${this.hero.startBlock}` : '';
        let statusText = '';
        if (this.hero.poisonTurns > 0) statusText += ` 🤢[劇毒x${this.hero.poisonTurns}]`;
        if (this.hero.isPressured) statusText += ` 😱[威壓中]`;
        if (this.hero.stigma > 0) statusText += ` 🔱[聖痕x${this.hero.stigma}]`; // 🟢 新增

        this.heroText.setText(
            `[ 🛡️ ${this.hero.name} ]  💰 金幣: ${this.hero.gold || 0}${passivesText}${statusText}\n` +
            `HP: ${this.hero.hp}/${this.hero.maxHp} | 格擋: ${this.hero.block} | 閃避: ${this.hero.dodgeCount || 0} 次\n` +
            `魔力: ${this.hero.mana}/${this.hero.maxMana} | 基礎攻擊力: ${this.hero.atk}\n` +
            `爆擊增益: +${this.hero.critBonus + this.hero.battleCritBonus} | 回復比值: x${this.hero.healRatio + this.hero.battleHealBonus}\n` +  // 🟢 顯示總和
            `護甲受擊: ${this.hero.armorHits}/${this.hero.armorMax} ${this.hero.isVulnerable ? '⚠️(破防中!)' : ''}\n` +
            `主動技能 CD: ${this.hero.cdActiveSkill} 回合`
        );

        // 🟢 改為渲染每隻敵人各自獨立可互動的物件，而非單一整塊文字
        this.renderEnemyUI();
    }
}