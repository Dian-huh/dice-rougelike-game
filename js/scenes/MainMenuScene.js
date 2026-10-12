// js/scenes/MainMenuScene.js
import { gameState } from '../data/gameState.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { DeckSystem } from '../systems/DeckSystem.js';
import { getAllCharacterIds, getCharacterData, getCharacterDeck } from '../characters/characterRegistry.js';
import { fullOverlay, CX, X, Y, S, px } from '../config/layout.js';

export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainMenuScene' });
    }

    create() {
        this.renderMainMenu();
    }

    renderMainMenu() {
        const container = this.add.container(0, 0);

        const title = this.add.text(CX, Y(110), '🎲 骰子地牢', { fontSize: px(32), fill: '#ffcc00' }).setOrigin(0.5);
        container.add(title);

        const hasSave = SaveSystem.hasSave();
        const buttons = [
            { label: '[ 🆕 開始新遊戲 ]', onClick: () => this.onNewGameClicked() }
        ];
        if (hasSave) {
            buttons.push({ label: '[ ▶️ 繼續 ]', onClick: () => this.scene.start('MapScene') });
        }
        buttons.push({ label: '[ 🎴 查看牌組圖鑑 ]', onClick: () => this.toggleCodexPanel() });
        buttons.push({ label: '[ ⚙️ 設定 ]', onClick: () => this.toggleSettingsPanel() });

        const startY = 230;
        buttons.forEach((btn, idx) => {
            const y = Y(startY + idx * 55);
            const btnText = this.add.text(CX, y, btn.label, {
                fontSize: px(18), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(16), y: S(10) }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', btn.onClick);
            container.add(btnText);
        });
    }

    // ============================================================
    // 🟢 開始新遊戲：偵測到存檔時跳確認提示（會覆蓋舊存檔）
    // ============================================================
    onNewGameClicked() {
        if (SaveSystem.hasSave()) {
            this.showConfirmDialog(
                '⚠️ 已偵測到存檔，開始新遊戲將會覆蓋現有進度，確定要繼續嗎？',
                () => {
                    gameState.resetToCharacterSelect();
                    this.scene.start('MapScene');
                }
            );
        } else {
            this.scene.start('MapScene');
        }
    }

    showConfirmDialog(message, onConfirm) {
        const container = this.add.container(0, 0).setDepth(2000);
        const overlay = fullOverlay(this, 0.92);
        const bg = this.add.rectangle(CX, Y(260), S(500), S(160), 0x111122).setStrokeStyle(S(2), 0xff6666);
        const text = this.add.text(CX, Y(220), message, {
            fontSize: px(14), fill: '#ffffff', align: 'center', wordWrap: { width: S(440) }
        }).setOrigin(0.5);

        const confirmBtn = this.add.text(X(340), Y(300), '[ 確定覆蓋 ]', {
            fontSize: px(15), fill: '#ff6666', backgroundColor: '#222', padding: { x: S(10), y: S(6) }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { container.destroy(); onConfirm(); });

        const cancelBtn = this.add.text(X(510), Y(300), '[ 取消 ]', {
            fontSize: px(15), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(10), y: S(6) }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => container.destroy());

        container.add([overlay, bg, text, confirmBtn, cancelBtn]);
    }

    // ============================================================
    // 🟢 牌組圖鑑：未開局狀態，顯示各角色完整起始牌組（靜態資料，不需存檔）
    // 用臨時 DeckSystem 實例取得統計資料，重用 getCollectionSummary()，不重寫分組邏輯
    // ============================================================
    toggleCodexPanel() {
        if (this._codexContainer) { this._codexContainer.destroy(); this._codexContainer = null; return; }
        this._codexCharIds = getAllCharacterIds();
        this._codexCharIndex = 0;
        this.renderCodexPanel();
    }

    renderCodexPanel() {
        if (this._codexContainer) this._codexContainer.destroy();
        const container = this.add.container(0, 0).setDepth(1800);
        this._codexContainer = container;

        const ids = this._codexCharIds;
        const charId = ids[this._codexCharIndex];
        const charData = getCharacterData(charId);
        const tempDeckSys = new DeckSystem(getCharacterDeck(charId));

        const overlay = fullOverlay(this, 0.94);
        const title = this.add.text(CX, Y(30), `🎴 ${charData.name} - 起始牌組`, { fontSize: px(18), fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const groups = tempDeckSys.getCollectionSummary();
        const perRow = 5;
        groups.forEach((g, idx) => {
            const col = idx % perRow, row = Math.floor(idx / perRow);
            const x = X(90 + col * 140), y = Y(90 + row * 95);
            const countLabel = g.count > 1 ? ` x${g.count}` : '';
            const costLabel = (typeof g.card.getCost === 'function') ? `${g.card.cost}費(浮動)` : `${g.card.cost}費`;

            const cardBg = this.add.rectangle(x, y, S(120), S(78), 0x222233).setStrokeStyle(S(2), 0x00ffff);
            const nameText = this.add.text(x - S(55), y - S(33), `${g.card.name}${countLabel}`, { fontSize: px(12), fill: '#fff', wordWrap: { width: S(110) } });
            const costText = this.add.text(x - S(55), y - S(14), costLabel, { fontSize: px(10), fill: '#66ccff' });
            const descText = this.add.text(x - S(55), y + S(2), g.card.desc, { fontSize: px(9), fill: '#aaaaaa', wordWrap: { width: S(110), useAdvancedWrap: true } });
            container.add([cardBg, nameText, costText, descText]);
        });

        if (ids.length > 1) {
            const prevBtn = this.add.text(X(60), Y(275), '◀', { fontSize: px(24), fill: '#66ccff' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this._codexCharIndex = (this._codexCharIndex - 1 + ids.length) % ids.length;
                    this.renderCodexPanel();
                });
            const nextBtn = this.add.text(X(790), Y(275), '▶', { fontSize: px(24), fill: '#66ccff' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this._codexCharIndex = (this._codexCharIndex + 1) % ids.length;
                    this.renderCodexPanel();
                });
            container.add([prevBtn, nextBtn]);
        }

        const closeBtn = this.add.text(CX, Y(510), '[ 關閉 ]', {
            fontSize: px(15), fill: '#ff6666', backgroundColor: '#222', padding: { x: S(12), y: S(6) }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { container.destroy(); this._codexContainer = null; });
        container.add(closeBtn);
    }

    // ============================================================
    // 🟢 設定選單：目前只有「重看教學」一項，直接重用 TutorialSystem.showTutorialUI()
    // ============================================================
    toggleSettingsPanel() {
        if (this._settingsContainer) { this._settingsContainer.destroy(); this._settingsContainer = null; return; }

        const container = this.add.container(0, 0).setDepth(1800);
        this._settingsContainer = container;

        const overlay = fullOverlay(this, 0.94);
        const title = this.add.text(CX, Y(100), '⚙️ 設定', { fontSize: px(20), fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const tutorialBtn = this.add.text(CX, Y(200), '[ 📖 重看教學 ]', {
            fontSize: px(16), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(12), y: S(8) }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => TutorialSystem.showTutorialUI(this, () => {}));
        container.add(tutorialBtn);

        const closeBtn = this.add.text(CX, Y(480), '[ 關閉 ]', {
            fontSize: px(15), fill: '#ff6666', backgroundColor: '#222', padding: { x: S(12), y: S(6) }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { container.destroy(); this._settingsContainer = null; });
        container.add(closeBtn);
    }
}