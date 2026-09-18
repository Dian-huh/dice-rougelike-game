// js/scenes/MainMenuScene.js
import { gameState } from '../data/gameState.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { DeckSystem } from '../systems/DeckSystem.js';
import { getAllCharacterIds, getCharacterData, getCharacterDeck } from '../characters/characterRegistry.js';

export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainMenuScene' });
    }

    create() {
        this.renderMainMenu();
    }

    renderMainMenu() {
        const container = this.add.container(0, 0);

        const title = this.add.text(425, 110, '🎲 骰子地牢', { fontSize: '32px', fill: '#ffcc00' }).setOrigin(0.5);
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
            const y = startY + idx * 55;
            const btnText = this.add.text(425, y, btn.label, {
                fontSize: '18px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 16, y: 10 }
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
        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.92).setInteractive();
        const bg = this.add.rectangle(425, 260, 500, 160, 0x111122).setStrokeStyle(2, 0xff6666);
        const text = this.add.text(425, 220, message, {
            fontSize: '14px', fill: '#ffffff', align: 'center', wordWrap: { width: 440 }
        }).setOrigin(0.5);

        const confirmBtn = this.add.text(340, 300, '[ 確定覆蓋 ]', {
            fontSize: '15px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 10, y: 6 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { container.destroy(); onConfirm(); });

        const cancelBtn = this.add.text(510, 300, '[ 取消 ]', {
            fontSize: '15px', fill: '#66ccff', backgroundColor: '#222', padding: { x: 10, y: 6 }
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

        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.94).setInteractive();
        const title = this.add.text(425, 30, `🎴 ${charData.name} - 起始牌組`, { fontSize: '18px', fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const groups = tempDeckSys.getCollectionSummary();
        const perRow = 5;
        groups.forEach((g, idx) => {
            const col = idx % perRow, row = Math.floor(idx / perRow);
            const x = 90 + col * 140, y = 90 + row * 95;
            const countLabel = g.count > 1 ? ` x${g.count}` : '';
            const costLabel = (typeof g.card.getCost === 'function') ? `${g.card.cost}費(浮動)` : `${g.card.cost}費`;

            const cardBg = this.add.rectangle(x, y, 120, 78, 0x222233).setStrokeStyle(2, 0x00ffff);
            const nameText = this.add.text(x - 55, y - 33, `${g.card.name}${countLabel}`, { fontSize: '12px', fill: '#fff', wordWrap: { width: 110 } });
            const costText = this.add.text(x - 55, y - 14, costLabel, { fontSize: '10px', fill: '#66ccff' });
            const descText = this.add.text(x - 55, y + 2, g.card.desc, { fontSize: '9px', fill: '#aaaaaa', wordWrap: { width: 110, useAdvancedWrap: true } });
            container.add([cardBg, nameText, costText, descText]);
        });

        if (ids.length > 1) {
            const prevBtn = this.add.text(60, 275, '◀', { fontSize: '24px', fill: '#66ccff' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this._codexCharIndex = (this._codexCharIndex - 1 + ids.length) % ids.length;
                    this.renderCodexPanel();
                });
            const nextBtn = this.add.text(790, 275, '▶', { fontSize: '24px', fill: '#66ccff' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this._codexCharIndex = (this._codexCharIndex + 1) % ids.length;
                    this.renderCodexPanel();
                });
            container.add([prevBtn, nextBtn]);
        }

        const closeBtn = this.add.text(425, 510, '[ 關閉 ]', {
            fontSize: '15px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 12, y: 6 }
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

        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.94).setInteractive();
        const title = this.add.text(425, 100, '⚙️ 設定', { fontSize: '20px', fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const tutorialBtn = this.add.text(425, 200, '[ 📖 重看教學 ]', {
            fontSize: '16px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 12, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => TutorialSystem.showTutorialUI(this, () => {}));
        container.add(tutorialBtn);

        const closeBtn = this.add.text(425, 480, '[ 關閉 ]', {
            fontSize: '15px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 12, y: 6 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { container.destroy(); this._settingsContainer = null; });
        container.add(closeBtn);
    }
}