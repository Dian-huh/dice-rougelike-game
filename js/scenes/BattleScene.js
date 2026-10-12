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
import { PauseMenu } from '../systems/PauseMenu.js';
import { EFFECT_REGISTRY } from '../data/effectRegistry.js';
import { fullOverlay, CX, X, Y, S, px } from '../config/layout.js';

// ============================================================
// 🟢 戰報逐行播放：遊戲邏輯仍是「一瞬間結算完」，但訊息會排隊、一句一句慢慢顯示。
//   播放期間：畫面數字（血量/手牌/敵人資訊）先不刷新、玩家操作先鎖住，播完再一次刷新；
//   玩家操作觸發的結算序列會自動展開戰報面板，播完自動收起；可按「⏩ 跳過」或空白鍵略過。
//   之後做攻擊動畫時，每則訊息被「顯示」的瞬間（_revealLog）就是掛動畫的位置。
// ============================================================
const LOG_SPEED_KEY = 'dice_roguelike_log_speed';
const LOG_SPEEDS = {
    normal: { label: '逐行', mult: 1 },
    fast:   { label: '快速', mult: 0.4 },
    instant:{ label: '即時', mult: 0 }
};
function loadLogSpeed() {
    try {
        const v = localStorage.getItem(LOG_SPEED_KEY);
        return LOG_SPEEDS[v] ? v : 'normal';
    } catch (e) { return 'normal'; }
}

// ============================================================
// 🟢 戰鬥畫面版面（1920x1080）：所有位置集中在這裡，之後調版面只改這張表
//
//   左欄 (x 40~860)：勇者狀態 → 骰子面板 → 操作按鈕
//   右欄 (x 880~1840)：敵人資訊（由上往下堆疊，過高時等比例縮小）
//   下方 (y 738~998)：手牌一排（張數多時自動重疊，滑鼠移上去會放大並浮到最上層）
//   最下面一條：戰報收合列（點擊展開成向上的捲動面板）
// ============================================================
const L = {
    heroPanel: { x: 0, y: 30, w: 820, h: 270 },
    diceBoard: { x: 40, y: 320 },
    skillBtn: { x: 40, y: 650 },
    actionBtn: { x: 480, y: 650 },
    speedRerollBtn: { x: 40, y: 550 },
    pauseBtn: { x: 1700, y: 20 },
    enemyCol: { x: 1100, y: 80, w: 960, maxH: 650, minPanelH: 120, gap: 10 },
    hand: { centerY: 868, cardW: 220, cardH: 260, step: 240, areaW: 1840 },
    log: { barY: 1044, barH: 48, barW: 1840, panelX: 1060, panelY: 500, panelW: 820, panelH: 500 }
};

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
        this.currentNode = (data && data.node) ? data.node : null;   // 🟢 階段5：記錄本場戰鬥對應的地圖節點
        
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
            log: (m, sender, rightMsg) => this.appendLog(m, sender, rightMsg)
        };
        CombatSystem.setBattleLog(this.battleCtx.log);
        // 🟢 新增：目標選擇 / 攻擊骰結算狀態機相關旗標
        this.isPickingTarget = false;
        this._attackFlowRunning = false;
        this.enemyDisplays = null;
        this._logEntries = [];   // 🟢 戰報歷史（已顯示的訊息）：每場戰鬥重置
        this._logQueue = [];     // 🟢 尚未顯示的訊息佇列
        this._logPlaying = false;
        this._logTimer = null;
        this._idleCbs = [];      // 等戰報播完才執行的動作（選目標、重骰確認、結算畫面…）
        this._uiDirty = false;   // 播放期間有人要求刷新畫面 → 播完補刷
        this._battleOver = false;
        this._sequenceActive = false;
        this._logAutoOpened = false;
        this._logSpeed = loadLogSpeed();

        // UI 區塊
        this.heroText = this.add.text(L.heroPanel.x, L.heroPanel.y, '', { fontSize: px(14), fill: '#4efa7b', lineSpacing: S(4) });
        this.diceBoardText = this.add.text(L.diceBoard.x, L.diceBoard.y, '', {
            fontSize: px(14), fill: '#00ffff', align: 'center', backgroundColor: '#222', padding: { x: S(10), y: S(8) }
        });
        this.heroStatusZone = this.add.rectangle(L.heroPanel.x, L.heroPanel.y, L.heroPanel.w, L.heroPanel.h, 0x000000, 0)
            .setOrigin(0, 0)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.toggleStatusPanel());
        this.createChatLogUI();
         // 按鈕區
        this.actionBtn = this.createButton(L.actionBtn.x, L.actionBtn.y, '🎲 擲攻擊骰並結算', () => this.resolveAttackPhase());
        this.skillBtn = this.createButton(L.skillBtn.x, L.skillBtn.y, '✨ 主動技能 (定骰)', () => this.toggleSkillPicker());

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

        this._pauseMenuContainer = null;   // Scene 實例會被重複使用，進場時要重置
        this.pauseBtn = this.createButton(L.pauseBtn.x, L.pauseBtn.y, '⏸ 選單', () => this.openPauseMenu());
        this.blessingPanelContainer = null;
        this.deckPanelContainer = null;
        this.statusPanelContainer = null;

        this.appendLog(`⚔️ 進入關卡【${this.currentStage.name}】！遇到 ${this.enemies.length} 個敵人！`, 'system');

        // 🟢 第一次進入戰鬥才自動彈出教學；看完（或跳過）後才顯示戰報列、開始回合
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

    openPauseMenu() {
        if (PauseMenu.isOpen(this)) { PauseMenu.close(this); return; }
        if (this.isPickingTarget || this.rerollPromptContainer) return;

        PauseMenu.open(this, [
            { label: '[ 📖 教學 ]', onClick: () => this.openTutorial() },
            { label: '[ 🔱 查看加護 ]', onClick: () => this.toggleBlessingPanel() },
            { label: '[ 🎴 查看牌組 ]', onClick: () => this.toggleDeckPanel() },
            { label: `[ 📜 戰報播放：${LOG_SPEEDS[this._logSpeed].label} ]`, onClick: () => this._cycleLogSpeed() },
            { label: '[ 🏠 回主選單 ]', color: '#ffcc66',
              confirm: '確定要回到主選單嗎？\n目前戰鬥進度不會保留，之後按「繼續」會回到進入此節點前的狀態。',
              onClick: () => this._leaveToMainMenu(false) },
            { label: '[ 🗑️ 放棄本輪 ]', color: '#ff6666',
              confirm: '放棄本輪會刪除存檔並結束這次冒險，確定嗎？',
              onClick: () => this._leaveToMainMenu(true) }
        ]);
    }

    // resetRun=true：放棄本輪（清存檔）；false：只離開，保留存檔供「繼續」使用
    _leaveToMainMenu(resetRun) {
        this.closeDeckPanel();
        this.removeChatLogUI();
        if (resetRun) gameState.resetToCharacterSelect();
        else gameState.unloadRun();
        this.scene.start('MainMenuScene');
        this.scene.stop('BattleScene');
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
        const overlay = fullOverlay(this, 0.9);
        const title = this.add.text(CX, Y(50), '🔱 目前持有的加護 / 被動', { fontSize: px(18), fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        if (effects.length === 0) {
            const emptyText = this.add.text(CX, Y(150), '目前沒有任何加護或被動效果。', { fontSize: px(14), fill: '#aaaaaa' }).setOrigin(0.5);
            container.add(emptyText);
        } else {
            effects.forEach((e, idx) => {
                const y = 100 + idx * 36;   // 舊版座標
                const line = this.add.text(X(150), Y(y), `• ${e.statusText}`, { fontSize: px(14), fill: '#eeeeee', wordWrap: { width: S(550) } });
                container.add(line);
            });
        }

        const closeBtn = this.add.text(CX, Y(480), '[ 關閉 ]', {
            fontSize: px(15), fill: '#ff6666', backgroundColor: '#222', padding: { x: S(12), y: S(6) }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
              container.destroy();
              this.blessingPanelContainer = null;
          });
        container.add(closeBtn);

        this.blessingPanelContainer = container;
    }

    // 收集玩家身上目前所有狀態，回傳可直接顯示的文字陣列
    collectHeroStatuses() {
        const h = this.hero;
        const list = [];
        const add = (icon, name, detail) => list.push(`${icon} ${name}：${detail}`);

        if (h.poisonTurns > 0) add('🤢', '劇毒', `剩餘 ${h.poisonTurns} 次，每次行動受 1 點傷害`);
        if (h.bleedStacks > 0) add('🩸', '流血', `${h.bleedStacks} 層，每次行動受 ${h.bleedStacks} 點傷害，之後 -1 層`);
        if (h.isPressured) add('😱', '威壓', '下次攻擊骰鎖定為 1，本回合無法使用主動技能');
        if (h.isVulnerable) add('⚠️', '破防', '受到的傷害 +2');
        if (h.stigma > 0) add('🔱', '聖痕', `敵方身上 ${h.stigma} 層（聖痕卡片與技能3依層數強化）`);
        if (h.stance !== undefined) {
            if (h.stance === 'DRAWN') add('🗡️', '拔刀', '攻擊骰造成傷害時，對隨機敵人追加 2 次 1 點傷害');
            else add('🛡️', '收刀', '閃避成功時，對隨機敵人反擊 5 點傷害並回復 3 點HP');
        }
        if (h.swordIntent > 0) add('💠', '劍意', `${h.swordIntent} 層（上限10；每5層使普攻/爆擊追加 1 點傷害）`);
        if (h.insightStacks > 0) add('👁️', '慧眼', '下一次造成的傷害 +3');
        if (h.forceCritThisTurn) add('🌸', '必定爆擊', '本回合攻擊必定觸發爆擊加成');
        if (h.doubleNextAction) add('⚡', '連打', '下一次攻擊骰行動執行 2 次');
        if (h.turnSpeedBonus > 0) add('💨', '速度加成', `本回合速度 +${h.turnSpeedBonus}`);
        if (h.nextStigmaCardDiscount > 0) add('🎴', '借用神力', `下一張聖痕卡費用 -${h.nextStigmaCardDiscount}`);
        if (h.freeGoldCardsThisTurn) add('💰', '利滾利', '本回合金幣卡 0 費，每使用一張 +20 金幣');

        (h.activeEffects || []).forEach(entry => {
            const def = EFFECT_REGISTRY[entry.id];
            if (!def || !def.displayName || typeof def.getStatusText !== 'function') return;
            if (def.category !== 'DEBUFF_LIKE' && def.category !== 'CARD_EFFECT') return;
            list.push(`• ${def.getStatusText(entry)}`);
        });
        return list;
    }

    toggleStatusPanel() {
        if (this.statusPanelContainer) { this.closeStatusPanel(); return; }
        if (this.isPickingTarget || this.rerollPromptContainer) return;

        const lines = this.collectHeroStatuses();
        const body = lines.length > 0 ? lines.join('\n') : '目前沒有任何狀態效果。';

        const container = this.add.container(0, 0).setDepth(1800);
        // 全螢幕點擊層：點任何地方關閉，同時避免點穿到底下的按鈕/手牌
        const catcher = fullOverlay(this, 0.35).on('pointerdown', () => this.closeStatusPanel());

        const x = L.heroPanel.x, y = L.heroPanel.y + L.heroPanel.h + 10, w = L.heroPanel.w, pad = 24;
        const title = this.add.text(0, 0, `📋 ${this.hero.name} 目前狀態`, { fontSize: px(15), fill: '#ffcc00' });
        const text = this.add.text(0, 0, body, {
            fontSize: px(13), fill: '#eeeeee', wordWrap: { width: w - pad * 2 }, lineSpacing: S(6)
        });
        const hint = this.add.text(0, 0, '（點擊任意處關閉）', { fontSize: px(11), fill: '#888888' });

        const h = pad * 2 + title.height + 20 + text.height + 20 + hint.height;
        const bg = this.add.rectangle(x, y, w, h, 0x111122, 0.97).setOrigin(0, 0).setStrokeStyle(S(2), 0x00ffff);
        title.setPosition(x + pad, y + pad);
        text.setPosition(x + pad, y + pad + title.height + 20);
        hint.setPosition(x + pad, y + h - pad - hint.height);

        container.add([catcher, bg, title, text, hint]);
        this.statusPanelContainer = container;
    }

    closeStatusPanel() {
        if (this.statusPanelContainer) {
            this.statusPanelContainer.destroy();
            this.statusPanelContainer = null;
        }
    }

    toggleDeckPanel() {
        if (this.deckPanelContainer) {
            this.closeDeckPanel();
            return;
        }
        if (this.isPickingTarget || this.rerollPromptContainer || this.blessingPanelContainer) return;

        const groups = this.deckSys.getCollectionSummary();
        const container = this.add.container(0, 0).setDepth(1800);
        const overlay = fullOverlay(this, 0.9);
        const title = this.add.text(CX, 50, `🎴 目前牌組收藏 (${this.deckSys.originalDeck.length}/${this.hero.deckCapacity || '∞'})`, { fontSize: px(16), fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        // 🟢 可捲動區域：卡片群組全部放進 gridContainer，viewport 外的部分靠遮罩隱藏
        const viewportX = 40, viewportY = 110, viewportW = 1840, viewportH = 800;
        const gridContainer = this.add.container(0, 0);
        container.add(gridContainer);

        const perRow = 8, cardW = 210, cardH = 200, stepX = 225, stepY = 215;
        const startX = CX - ((perRow - 1) * stepX) / 2;
        groups.forEach((g, idx) => {
            const col = idx % perRow;
            const row = Math.floor(idx / perRow);
            const x = startX + col * stepX;
            const y = viewportY + cardH / 2 + 10 + row * stepY;
            const left = x - cardW / 2 + 10, top = y - cardH / 2;

            const { cost } = CombatSystem.getDisplayCost(g.card, this.hero, this.battleCtx);
            const costLabel = (typeof g.card.getCost === 'function') ? `${cost}費(浮動)` : `${cost}費`;
            const countLabel = g.count > 1 ? ` x${g.count}` : '';

            const cardBg = this.add.rectangle(x, y, cardW, cardH, 0x222233).setStrokeStyle(S(2), 0x00ffff);
            const nameText = this.add.text(left, top + 8, `${g.card.name}${countLabel}`, { fontSize: px(12), fill: '#fff', wordWrap: { width: cardW - 20 } });
            const costText = this.add.text(left, top + 52, costLabel, { fontSize: px(10), fill: '#66ccff' });
            const descText = this.add.text(left, top + 80, g.card.desc, { fontSize: px(9), fill: '#aaaaaa', wordWrap: { width: cardW - 20, useAdvancedWrap: true } });

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
        const totalContentHeight = totalRows * stepY + 20;
        const maxScroll = Math.max(0, totalContentHeight - viewportH);

        // delta > 0：往下看（內容上移）
        const scrollBy = (delta) => {
            gridContainer.y = Phaser.Math.Clamp(gridContainer.y - delta, -maxScroll, 0);
        };

        // 滑鼠滾輪（桌面）：向下滾 = 往後看
        this._deckWheelHandler = (pointer, objs, dx, dy) => scrollBy(dy * 0.5);
        this.input.on('wheel', this._deckWheelHandler);

        // 上下按鈕（觸控/手機）
        if (maxScroll > 0) {
            const upBtn = this.add.text(1850, viewportY + 30, '▲', { fontSize: px(20), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(6), y: S(4) } })
                .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => scrollBy(-215));
            const downBtn = this.add.text(1850, viewportY + viewportH - 30, '▼', { fontSize: px(20), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(6), y: S(4) } })
                .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => scrollBy(215));
            container.add([upBtn, downBtn]);
        }

        const closeBtn = this.add.text(CX, 1000, '[ 關閉 ]', {
            fontSize: px(15), fill: '#ff6666', backgroundColor: '#222', padding: { x: S(12), y: S(6) }
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

    // ============================================================
    // 🟢 戰報（可收合，Phaser 內建版）
    //   收合：最下面一條，顯示最新一句 + 未讀數；點擊展開
    //   展開：向上的捲動面板（滑鼠滾輪／拖曳／▲▼），再點收合列即可收起
    //   對外介面與舊 DOM 版相同：appendLog(msg, sender, rightMsg)、
    //   createChatLogUI / showChatLogUI / removeChatLogUI
    // ============================================================
    createChatLogUI() {
        const cfg = L.log;
        this._logExpanded = false;
        this._logUnread = 0;
        this._logPanel = null;
        this._logContent = null;

        const bar = this.add.container(0, 0).setDepth(1200).setVisible(false);   // 教學結束後才顯示
        const barBg = this.add.rectangle(CX, cfg.barY, cfg.barW, cfg.barH, 0x0f0f14, 0.92)
            .setStrokeStyle(S(1), 0x444455)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.toggleLogPanel());
        const left = CX - cfg.barW / 2 + 16;
        this._logBarLabel = this.add.text(left, cfg.barY, '', { fontSize: px(12), fill: '#ffcc00', padding: { x: 0, y: 2 } }).setOrigin(0, 0.5);
        this._logBarText = this.add.text(left + 230, cfg.barY, '', {
            fontSize: px(12), fill: '#cccccc', wordWrap: { width: cfg.barW - 420 }, maxLines: 1, padding: { x: 0, y: 2 }
        }).setOrigin(0, 0.5);
        this._skipBtn = this.add.text(CX + cfg.barW / 2 - 16, cfg.barY, '⏩ 跳過', {
            fontSize: px(12), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(6), y: S(3) }
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this._skipLogPlayback())
          .setVisible(false);
        bar.add([barBg, this._logBarLabel, this._logBarText, this._skipBtn]);
        if (this.input.keyboard) {
            this._skipKeyHandler = () => this._skipLogPlayback();
            this.input.keyboard.on('keydown-SPACE', this._skipKeyHandler);
        }

        this.logContainer = bar;   // 沿用舊欄位名稱：appendLog 以它判斷 UI 是否已建立
        this._refreshLogBarLabel();
    }

    // 🟢 顯示戰報列（在教學結束或確認已看過教學後呼叫）
    showChatLogUI() {
        if (this.logContainer) this.logContainer.setVisible(true);
    }

    _refreshLogBarLabel() {
        if (!this._logBarLabel) return;
        const unread = (!this._logExpanded && this._logUnread > 0) ? `  ●${this._logUnread}` : '';
        this._logBarLabel.setText(`📜 戰報 ${this._logExpanded ? '▼' : '▲'}${unread}`);
    }

    // 🟢 對外介面不變：appendLog(msg, sender, rightMsg)。訊息先進佇列，由 _pumpLog 一句一句放出
    appendLog(msg, sender = 'player', rightMsg = null) {
        if (sender !== 'simultaneous' && (msg === undefined || msg === null || msg === '')) return;
        const entry = { msg: String(msg ?? ''), sender, rightMsg: rightMsg == null ? '' : String(rightMsg) };
        if (!this.logContainer) { this._revealLog(entry); return; }   // 戰報 UI 尚未建立/已移除：只記錄，不排隊
        // 🟢 只有「攻擊骰結算序列」的訊息才排隊慢慢播；出牌、技能、提示等其他訊息即時顯示
        if (!this._sequenceActive && !this._logBusy()) { this._revealLog(entry); return; }

        // 玩家操作觸發的結算序列：播放期間自動展開戰報面板（播完由 _onLogIdle 收起）
        if (this._sequenceActive && !this._logExpanded && this._logSpeed !== 'instant') {
            this._openLogPanel();
            this._logAutoOpened = true;
        }
        this._logQueue.push(entry);
        this._updateSkipBtn();
        this._pumpLog();
    }

    // 訊息「真正被看見」的瞬間：寫入歷史、更新收合列/面板。之後的攻擊動畫可以掛在這裡
    _revealLog(entry) {
        if (!this._logEntries) this._logEntries = [];
        this._logEntries.push(entry);
        if (this._logEntries.length > 200) this._logEntries.shift();
        if (!this.logContainer) return;

        // 收合列：顯示最新一句
        const colors = { player: '#4efa7b', enemy: '#ff8888', simultaneous: '#ffffff', system: '#ffcc00' };
        const line = entry.sender === 'simultaneous' ? `⚡ ${entry.msg} ｜ ${entry.rightMsg}` : entry.msg;
        if (this._logBarText) this._logBarText.setText(line.replace(/\s*\n\s*/g, ' ')).setColor(colors[entry.sender] || '#cccccc');

        if (this._logExpanded && this._logContent) {
            const wasAtBottom = this._logScroll >= this._logMaxScroll() - 4;
            this._appendLogBubble(entry);
            if (wasAtBottom) this._setLogScroll(this._logMaxScroll());
        } else {
            this._logUnread += 1;
            this._refreshLogBarLabel();
        }
    }

    // 每則訊息顯示後停留的時間（毫秒）：依字數與播放速度設定決定
    _logDelay(entry) {
        const mult = LOG_SPEEDS[this._logSpeed].mult;
        if (!mult) return 0;
        const len = entry.msg.length + entry.rightMsg.length;
        const base = entry.sender === 'system' ? 160 : 280;
        return Math.min(700, base + len * 5) * mult;
    }

    _pumpLog() {
        while (!this._logPlaying) {
            const entry = this._logQueue.shift();
            if (!entry) {
                this._updateSkipBtn();
                this._onLogIdle();
                return;
            }
            this._revealLog(entry);
            const delay = this._logDelay(entry);
            if (delay > 0) {
                this._logPlaying = true;
                this._updateSkipBtn();
                this._logTimer = this.time.delayedCall(delay, () => {
                    this._logTimer = null;
                    this._logPlaying = false;
                    this._pumpLog();
                });
            }
        }
    }

    _logBusy() {
        return !!this._logPlaying || (!!this._logQueue && this._logQueue.length > 0);
    }

    // 戰報全部播完：補刷畫面 → 收起自動展開的面板 → 執行等待中的動作
    _onLogIdle() {
        this._sequenceActive = false;
        this._flushUI();
        if (this._logAutoOpened) {
            this._logAutoOpened = false;
            if (this._logExpanded) this._closeLogPanel();
        }
        const cbs = this._idleCbs.splice(0);
        cbs.forEach(cb => cb());
    }

    // 戰報還在播放就先等；已播完就立刻執行
    whenLogIdle(cb) {
        if (!this._logBusy()) cb();
        else this._idleCbs.push(cb);
    }

    // 標記「接下來的訊息屬於玩家剛觸發的結算序列」：播放時會自動展開戰報面板
    _beginSequence() {
        this._sequenceActive = true;
    }

    // 略過播放：剩下的訊息立刻全部顯示
    _skipLogPlayback() {
        if (!this._logBusy()) return;
        if (this._logTimer) { this._logTimer.remove(false); this._logTimer = null; }
        this._logPlaying = false;
        while (this._logQueue.length) this._revealLog(this._logQueue.shift());
        this._updateSkipBtn();
        this._onLogIdle();
    }

    _updateSkipBtn() {
        if (this._skipBtn) this._skipBtn.setVisible(this._logBusy());
    }

    _cycleLogSpeed() {
        const order = ['normal', 'fast', 'instant'];
        this._logSpeed = order[(order.indexOf(this._logSpeed) + 1) % order.length];
        try { localStorage.setItem(LOG_SPEED_KEY, this._logSpeed); } catch (e) { /* 無痕模式等情況存不了就算了 */ }
        this.appendLog(`📜 戰報播放：${LOG_SPEEDS[this._logSpeed].label}`, 'system');
    }

    // 播放期間被要求刷新的畫面，播完才一次補刷（戰鬥已結束時只刷新數字，不重畫手牌與按鈕）
    _flushUI() {
        if (!this._uiDirty) return;
        this._uiDirty = false;
        if (this._battleOver) { this._drawUI(); return; }
        this._drawHandUI();
        this._drawSpeedRerollButton();
        this._drawUI();
    }

    toggleLogPanel() {
        this._logAutoOpened = false;   // 玩家手動操作後，不再由程式自動收起
        if (this._logExpanded) this._closeLogPanel();
        else this._openLogPanel();
    }

    _openLogPanel() {
        const cfg = L.log;
        this._logExpanded = true;
        this._logUnread = 0;
        this._refreshLogBarLabel();

        const panel = this.add.container(0, 0).setDepth(1300);
        const bg = this.add.rectangle(cfg.panelX, cfg.panelY, cfg.panelW, cfg.panelH, 0x0f0f14, 0.95)
            .setOrigin(0, 0).setStrokeStyle(S(1), 0x444455).setInteractive();
        bg.on('pointerdown', (p) => { this._logDrag = { y: p.y, scroll: this._logScroll }; });
        panel.add(bg);

        const pad = 16;
        this._logView = { x: cfg.panelX + pad, y: cfg.panelY + pad, w: cfg.panelW - pad * 2 - 56, h: cfg.panelH - pad * 2 };
        const content = this.add.container(this._logView.x, this._logView.y);
        panel.add(content);

        const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
        maskGfx.fillStyle(0xffffff);
        maskGfx.fillRect(this._logView.x, this._logView.y, this._logView.w, this._logView.h);
        content.setMask(maskGfx.createGeometryMask());
        this._logMaskGfx = maskGfx;

        const btnX = cfg.panelX + cfg.panelW - 32;
        const upBtn = this.add.text(btnX, cfg.panelY + 40, '▲', { fontSize: px(20), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(6), y: S(4) } })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this._setLogScroll(this._logScroll - 120));
        const downBtn = this.add.text(btnX, cfg.panelY + cfg.panelH - 40, '▼', { fontSize: px(20), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(6), y: S(4) } })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this._setLogScroll(this._logScroll + 120));
        panel.add([upBtn, downBtn]);

        this._logPanel = panel;
        this._logContent = content;
        this._logContentH = 0;
        this._logScroll = 0;
        this._logDrag = null;

        // 只重建最近 60 則；之後新訊息用「追加」方式，避免每則訊息都重建整個面板
        this._logEntries.slice(-60).forEach(e => this._appendLogBubble(e));
        this._setLogScroll(this._logMaxScroll());

        this._logWheelHandler = (pointer, objs, dx, dy) => {
            if (this.deckPanelContainer || !this._logPanel) return;
            if (pointer.x < cfg.panelX || pointer.x > cfg.panelX + cfg.panelW ||
                pointer.y < cfg.panelY || pointer.y > cfg.panelY + cfg.panelH) return;
            this._setLogScroll(this._logScroll + dy * 0.6);
        };
        this._logMoveHandler = (p) => {
            if (this._logDrag && p.isDown) this._setLogScroll(this._logDrag.scroll - (p.y - this._logDrag.y));
        };
        this._logUpHandler = () => { this._logDrag = null; };
        this.input.on('wheel', this._logWheelHandler);
        this.input.on('pointermove', this._logMoveHandler);
        this.input.on('pointerup', this._logUpHandler);
        this.input.on('pointerupoutside', this._logUpHandler);
    }

    _closeLogPanel() {
        this._logExpanded = false;
        if (this._logWheelHandler) { this.input.off('wheel', this._logWheelHandler); this._logWheelHandler = null; }
        if (this._logMoveHandler) { this.input.off('pointermove', this._logMoveHandler); this._logMoveHandler = null; }
        if (this._logUpHandler) {
            this.input.off('pointerup', this._logUpHandler);
            this.input.off('pointerupoutside', this._logUpHandler);
            this._logUpHandler = null;
        }
        if (this._logPanel) { this._logPanel.destroy(); this._logPanel = null; }
        if (this._logMaskGfx) { this._logMaskGfx.destroy(); this._logMaskGfx = null; }
        this._logContent = null;
        this._logDrag = null;
        this._refreshLogBarLabel();
    }

    _logMaxScroll() {
        if (!this._logView) return 0;
        return Math.max(0, (this._logContentH || 0) - this._logView.h);
    }

    _setLogScroll(v) {
        if (!this._logContent) return;
        this._logScroll = Phaser.Math.Clamp(v, 0, this._logMaxScroll());
        this._logContent.y = this._logView.y - this._logScroll;
    }

    // 在面板底部追加一則訊息（氣泡樣式與舊 DOM 版相同：玩家靠左綠、敵人靠右紅、系統置中黃、同時行動左右各半）
    _appendLogBubble(entry) {
        const content = this._logContent;
        if (!content) return;
        const W = this._logView.w;
        const y0 = this._logContentH;

        const makeBubble = (text, wrapW, fill, bgColor, stroke) => {
            const t = this.add.text(12, 6, text, {
                fontSize: px(11), fill, wordWrap: { width: wrapW - 24 }, padding: { x: 0, y: 2 }
            });
            const w = Math.min(wrapW, Math.ceil(t.width) + 24);
            const h = Math.ceil(t.height) + 12;
            const bg = this.add.rectangle(0, 0, w, h, bgColor, 1).setOrigin(0, 0).setStrokeStyle(S(1), stroke);
            const g = this.add.container(0, y0);
            g.add([bg, t]);
            content.add(g);
            return { g, w, h };
        };

        let rowH = 0;
        if (entry.sender === 'enemy') {
            const b = makeBubble(entry.msg, W * 0.75, '#ff6666', 0x3d1c1c, 0xff4444);
            b.g.x = W - b.w; rowH = b.h;
        } else if (entry.sender === 'simultaneous') {
            const p = makeBubble(`⚡ 玩家: ${entry.msg}`, W * 0.48, '#4efa7b', 0x1a382b, 0x00ffaa);
            const e = makeBubble(`⚡ 敵人: ${entry.rightMsg}`, W * 0.48, '#ff6666', 0x3d1c1c, 0xff4444);
            e.g.x = W - e.w; rowH = Math.max(p.h, e.h);
        } else if (entry.sender === 'system') {
            const b = makeBubble(entry.msg, W * 0.9, '#ffcc00', 0x2a2610, 0x6b5a00);
            b.g.x = (W - b.w) / 2; rowH = b.h;
        } else {
            const b = makeBubble(entry.msg, W * 0.75, '#4efa7b', 0x1a382b, 0x00ffaa);
            rowH = b.h;
        }
        this._logContentH = y0 + rowH + 8;
    }

    // 🟢 清除戰報 UI，避免切換場景後殘留
    removeChatLogUI() {
        if (this._logTimer) { this._logTimer.remove(false); this._logTimer = null; }
        this._logPlaying = false;
        this._logQueue = [];
        this._idleCbs = [];
        if (this._skipKeyHandler && this.input.keyboard) {
            this.input.keyboard.off('keydown-SPACE', this._skipKeyHandler);
            this._skipKeyHandler = null;
        }
        this._closeLogPanel();
        if (this.logContainer) { this.logContainer.destroy(); this.logContainer = null; }
        this._logBarLabel = null;
        this._logBarText = null;
        this._skipBtn = null;
    }

    createButton(x, y, text, callback) {
        return this.add.text(x, y, `[ ${text} ]`, {
            fontSize: px(15), fill: '#00ffff', backgroundColor: '#222', padding: { x: S(6), y: S(4) }
        }).setInteractive({ useHandCursor: true }).on('pointerdown', callback);
    }

    openDicePicker(title, onChosen) {
        this._dicePickerOnChosen = onChosen;
        this.dicePickerSession.setTitle(title);
        this.dicePickerSession.show();
    }

    toggleSkillPicker() {
        if (this.isPickingTarget || this.rerollPromptContainer || this._logBusy()) return;

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
        if (this.turnCount === 1) this._skipLogPlayback();   // 開場訊息直接顯示，不讓玩家一進戰鬥就乾等
        if (this.checkBattleEnd()) return;
        // 更新 UI
        this.renderHandUI();
        this.renderSpeedRerollButton();
        this.updateUI();
    }

    // 🟢 戰報逐行播放期間，畫面數字（血量/手牌/敵人資訊/按鈕）先不更新，播完由 _flushUI 一次補刷，
    // 避免「血量已經扣了，戰報還在講上一句」的不同步。下面三個是對外入口，真正繪製在 _draw* 內
    updateUI() {
        if (this._logBusy()) { this._uiDirty = true; return; }
        this._drawUI();
    }

    renderHandUI() {
        if (this._logBusy()) { this._uiDirty = true; return; }
        this._drawHandUI();
    }

    renderSpeedRerollButton() {
        if (this._logBusy()) { this._uiDirty = true; return; }
        this._drawSpeedRerollButton();
    }

    _drawSpeedRerollButton() {
        if (this.speedRerollBtn) { this.speedRerollBtn.destroy(); this.speedRerollBtn = null; }
        if (this._battleOver) return;

        // 使用 BattleFlowSystem 获取剩余重骰次数
        const rerollsLeft = BattleFlowSystem.getSpeedRerollsRemaining(this.hero);
        if (rerollsLeft <= 0) return;

        this.speedRerollBtn = this.add.text(L.speedRerollBtn.x, L.speedRerollBtn.y, `[ 🔄 重骰速度骰 (剩餘${rerollsLeft}次) ]`, {
            fontSize: px(12), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(6), y: S(4) }
        }).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            if (this.isPickingTarget || this.rerollPromptContainer || this._logBusy()) return;
            BattleFlowSystem.consumeSpeedReroll(this.hero);
            this.battleCtx.playerSpeedDice = Phaser.Math.Between(1, 6) + CombatSystem.getEffectiveSpeedBonus(this.hero);
            this.appendLog(`🔄 重骰速度骰：新結果 [ ${this.battleCtx.playerSpeedDice} ]`, 'system');
            this.renderSpeedRerollButton();
            this.updateUI();
        });
    }

    // 🟢 手牌：每張卡一個小容器；張數多時自動縮小間距（重疊），滑鼠移上去放大並浮到最上層
    _drawHandUI() {
        if (this._battleOver) return;
        if (this.handContainer) this.handContainer.destroy();
        this.handContainer = this.add.container(0, 0);

        const hand = this.deckSys.hand;
        const n = hand.length;
        if (n === 0) return;

        const { cardW, cardH, step, areaW, centerY } = L.hand;
        const actualStep = n > 1 ? Math.min(step, (areaW - cardW) / (n - 1)) : 0;
        const totalW = cardW + (n - 1) * actualStep;
        const startX = 150;

        hand.forEach((card, index) => {
            const { cost: effCost, isFreeFirstCard } = CombatSystem.getDisplayCost(card, this.hero, this.battleCtx);
            const cardContainer = this.add.container(startX + index * actualStep, centerY);

            const bg = this.add.rectangle(0, 0, cardW, cardH, 0x333333)
                .setStrokeStyle(S(2), 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.playCard(index))
                .on('pointerover', () => { cardContainer.setScale(1.08); this.handContainer.bringToTop(cardContainer); })
                .on('pointerout', () => { cardContainer.setScale(1); });

            const title = this.add.text(-cardW / 2 + 12, -cardH / 2 + 12, `${card.name} (${effCost}費${isFreeFirstCard ? '🏅' : ''})`, {
                fontSize: px(12), fill: '#fff', wordWrap: { width: cardW - 24 }
            });
            const desc = this.add.text(-cardW / 2 + 12, -cardH / 2 + 82, card.desc, {
                fontSize: px(10), fill: '#aaa', wordWrap: { width: cardW - 24, useAdvancedWrap: true }
            });

            cardContainer.add([bg, title, desc]);
            this.handContainer.add(cardContainer);
        });
    }

    // ============================================================
    // 🟢 敵人資訊（維持文字版）：右欄由上往下堆疊，每格高度依實際文字高度決定；
    // 總高超過可用空間時整組等比例縮小，避免壓到下方手牌
    // ============================================================

    renderEnemyUI() {
        if (this.isPickingTarget) return;
        if (this.enemyDisplays) {
            this.enemyDisplays.forEach(d => d.container.destroy());
        }
        this.enemyDisplays = [];

        // 🟢 只顯示存活的敵人，死亡的直接消失、不佔版面
        const aliveEnemies = this.enemies.filter(e => e.hp > 0);
        const { x: colX, y: colY, w, maxH, minPanelH, gap } = L.enemyCol;

        let cursorY = 0;
        aliveEnemies.forEach((enemy, idx) => {
            const container = this.add.container(colX, colY + cursorY);

            const status = `HP: ${enemy.hp}/${enemy.maxHp}`;   // 存活才會被列進來，不用再判斷已擊倒
            const extraStatusLine = enemy.getStatusLine ? enemy.getStatusLine() : '';
            const text = this.add.text(14, 8,
                `[ 😈 ${enemy.name} #${idx + 1} ] (${status})\n` +
                `  格擋: ${enemy.block || 0} | 攻: ${enemy.atk} | ${extraStatusLine}\n` +
                `  速度: [ ${enemy.speedDice || 0} ] | 預告意圖: ${CombatSystem.getIntentDisplayDesc(enemy)}`,
                { fontSize: px(12), fill: '#ff5555', lineSpacing: S(4), wordWrap: { width: w - 28 } }
            );

            const panelH = Math.max(minPanelH, Math.ceil(text.height) + 16);
            const bg = this.add.rectangle(0, 0, w, panelH, 0x000000, 0).setOrigin(0, 0).setStrokeStyle(0);

            container.add([bg, text]);
            this.enemyDisplays.push({ enemy, container, bg, text });
            cursorY += panelH + gap;
        });

        const totalH = cursorY - gap;
        if (totalH > maxH) {
            const s = maxH / totalH;
            this.enemyDisplays.forEach(d => {
                d.container.setScale(s);
                d.container.y = colY + (d.container.y - colY) * s;
            });
        }
    }

    // ============================================================
    // 🟢 卡牌使用：委托给 CardPlaySystem 处理业务逻辑，
    // BattleScene 只负责显示目标选择 UI 并触发最终结算
    // ============================================================

    playCard(index) {
        if (this.isPickingTarget || this.rerollPromptContainer || this._logBusy()) return;
        this._sequenceActive = false;

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
        this._beginSequence();
        this.runSoloStep(AttackFlowSystem.beginSolo(this.battleCtx));
        
    }

        // 🟢 共用：主攻擊流程與偷打流程的 step 狀態機都靠這個推進，
    // 差異只有 resumeFn（resume/resumeSolo）與 onDone（收尾邏輯），由呼叫端傳入
    _runAttackStep(step, resumeFn, onDone) {
        if (step.type === 'NEED_TARGET') {
            // 等戰報播完、畫面刷新後才跳出選目標（否則敵人清單可能還是舊的，新召喚的敵人會點不到）
            this.whenLogIdle(() => {
                const session = UIInteractionSystem.createTargetPickerSession(
                    this, this.enemies, step.candidates,
                    (target) => { this._beginSequence(); this._runAttackStep(resumeFn({ target }), resumeFn, onDone); }
                );
                session.show();
            });
        } else if (step.type === 'NEED_REROLL_CONFIRM') {
            this.whenLogIdle(() => {
                this.promptAttackDiceReroll(step.actionDice, step.rerollsLeft, (payload) => {
                    this._beginSequence();
                    this._runAttackStep(resumeFn(payload), resumeFn, onDone);
                });
            });
        } else if (step.type === 'ACTION_UPDATE') {
            this.updateUI();
            this._runAttackStep(resumeFn(), resumeFn, onDone);
        } else { // 'DONE'
            onDone();
        }
    }

    runSoloStep(step) {
        this._runAttackStep(
            step,
            (payload) => AttackFlowSystem.resumeSolo(this.battleCtx, payload),
            () => { this.updateUI(); this.checkBattleEnd(); }
        );
    }

    resolveAttackPhase() {
        if (this.isPickingTarget || this._attackFlowRunning || this.rerollPromptContainer || this._logBusy()) return;
        this._attackFlowRunning = true;
        this._beginSequence();   // 攻擊結算的訊息會逐行播放
        this.runFlowStep(AttackFlowSystem.begin(this.battleCtx));
    }

    runFlowStep(step) {
        this._runAttackStep(
            step,
            (payload) => AttackFlowSystem.resume(this.battleCtx, payload),
            () => {
                this._attackFlowRunning = false;
                if (!this.checkBattleEnd()) {
                    this.startNewTurn();
                }
            }
        );
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
        if (this._battleOver) return true;   // 已經結算過：避免重複排程獎勵/結算畫面
        // 使用 BattleFlowSystem 检查战斗状态
        const status = BattleFlowSystem.checkBattleStatus(this.hero, this.enemies);

        if (status.status === 'victory') {
            this._battleOver = true;
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
            this.closeStatusPanel();
            if (this.heroStatusZone) this.heroStatusZone.disableInteractive();
            // 分流：最終樓層 Boss 戰勝利 → 遊戲通關結算；一般戰鬥勝利 → 獎勵選擇
            // 🟢 等最後幾句戰報播完才進結算畫面
            this.whenLogIdle(() => {
                if (this.isFinalBoss) {
                    this.time.delayedCall(600, () => {
                        this.showVictoryUI();
                    });
                } else {
                    this.time.delayedCall(600, () => {
                        RewardSystem.showRewardUI(this, this.currentStage);
                    });
                }
            });
            return true;
        }

        if (status.status === 'defeat') {
            this._battleOver = true;
            this.appendLog(`💀 勇者倒下了... 遊戲結束！`, 'system');
            this.whenLogIdle(() => {
                this.time.delayedCall(600, () => {
                    this.showGameOverUI();
                });
            });
            return true;
        }

        return false;
    }

    // 🟢 死亡結算畫面
    showGameOverUI() {
        if (this.pauseBtn) this.pauseBtn.destroy();
        // 摧毀底下仍可互動的元素，避免玩家對著覆蓋層背後繼續操作
        if (this.handContainer) this.handContainer.destroy();
        if (this.actionBtn) this.actionBtn.destroy();
        if (this.skillBtn) this.skillBtn.destroy();
        if (this.dicePickerSession) this.dicePickerSession.hide();

        fullOverlay(this, 0.92).setDepth(3000);
        this.add.text(CX, Y(220), '💀 遊戲結束', { fontSize: px(32), fill: '#ff4444' }).setOrigin(0.5).setDepth(3001);
        this.add.text(CX, Y(270), `勇者倒下於第 ${gameState.currentFloor} 層...`, { fontSize: px(16), fill: '#cccccc' }).setOrigin(0.5).setDepth(3001);

        this.add.text(CX, Y(340), '[ 🏠 回主畫面 ]', {
            fontSize: px(18), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(14), y: S(8) }
        }).setOrigin(0.5).setDepth(3001)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.returnToMainMenuAfterDeath());
    }

    // 🟢 全破結算畫面（僅在打贏最終樓層 Boss 時觸發）
    showVictoryUI() {
        if (this.pauseBtn) this.pauseBtn.destroy();
        fullOverlay(this, 0.92).setDepth(3000);
        this.add.text(CX, Y(200), '🏆 恭喜通關！', { fontSize: px(32), fill: '#ffcc00' }).setOrigin(0.5).setDepth(3001);
        const bossName = (this.enemies && this.enemies[0] && this.enemies[0].name) || '最終首領';
        this.add.text(CX, Y(250), `你成功擊敗了${bossName}，拯救了世界！`, { fontSize: px(16), fill: '#cccccc' }).setOrigin(0.5).setDepth(3001);
        this.add.text(CX, Y(290), `💰 最終金幣：${this.hero.gold || 0}　❤️ 剩餘 HP：${this.hero.hp}/${this.hero.maxHp}`, { fontSize: px(14), fill: '#4efa7b' }).setOrigin(0.5).setDepth(3001);

        this.add.text(CX, Y(360), '[ 🔄 開始新的旅程 ]', {
            fontSize: px(18), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(14), y: S(8) }
        }).setOrigin(0.5).setDepth(3001)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.restartGame());
    }

    // 🟢 死亡後清除本輪進度並返回主畫面，避免直接進入選角畫面
    returnToMainMenuAfterDeath() {
        this.removeChatLogUI();
        gameState.resetToCharacterSelect();
        this.scene.start('MainMenuScene');
        this.scene.stop('BattleScene');
    }

    // 🟢 統一的「重新開始」邏輯：清空戰報、重置全域狀態、回到地圖場景讓玩家重新選角
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
            this.removeChatLogUI();
            if (gameState.currentRegionGraph && this.currentNode) {
                const result = gameState.advanceAfterNode(this.currentNode);
                if (result && result.runComplete) {
                    this.showVictoryUI();
                    return;
                }
            } else {
                gameState.nextFloor();   // 🟢 舊系統相容路徑
            }
            this.scene.start('MapScene');
            this.scene.stop('BattleScene');
        });
    }

    _drawUI() {
        let overrideText = this.hero.overrideDice !== null ? `(預定: ${this.hero.overrideDice})` : '';
        let lastDiceText = this.battleCtx.lastActionDice !== null ? `上次攻擊骰: [ ${this.battleCtx.lastActionDice} ]` : '攻擊骰: 未擲骰';
        
        this.diceBoardText.setText(
            `【第 ${this.turnCount} 回合】\n` +
            `🎲 速度骰：玩家 [ ${this.battleCtx.playerSpeedDice} ]\n` +
            `${lastDiceText} ${overrideText}`
        );

        let passivesText = this.hero.startBlock ? ` | 開局格擋: +${this.hero.startBlock}` : '';
        const statusCount = this.collectHeroStatuses().length;
        const statusText = statusCount > 0 ? ` 📋[狀態x${statusCount}]` : '';

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