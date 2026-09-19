import { NODE_TYPES } from '../data/mapData.js';
import { gameState } from '../data/gameState.js';
import { EVENT_DATABASE } from '../data/eventData.js';
import { getAllCharacterIds, getCharacterData } from '../characters/characterRegistry.js';   // 🟢 這行要存在
import { getRegionData } from '../data/regionRegistry.js';
import { PauseMenu } from '../systems/PauseMenu.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';

export class MapScene extends Phaser.Scene {
    constructor() { 
        super({ key: 'MapScene' }); 
    }

    create() {
        this._pauseBtn = null;
        this._pauseMenuContainer = null;
        if (!gameState.mapData) {
            const loaded = gameState.tryLoadSave();
            if (!loaded) {
                this.showCharacterSelectUI();   // 🔴 改動：不再直接 initNewGame()，先跳選角
                return;
            }
        }
        this.enterRegionFlow();
    }

    // ============================================================
    // 🟢 新增：選角UI —— 動態依 characterRegistry 產生卡片，未來加角色不用改這裡
    // ============================================================
    showCharacterSelectUI() {
        const container = this.add.container(0, 0).setDepth(2000);
        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.95);
        const title = this.add.text(425, 45, '⚔️ 請選擇你的冒險者', { fontSize: '22px', fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const ids = getAllCharacterIds();
        const cardWidth = 220, cardHeight = 380, gap = 30;
        const totalWidth = ids.length * cardWidth + (ids.length - 1) * gap;
        const startX = 425 - totalWidth / 2 + cardWidth / 2;
        const y = 290;

        ids.forEach((id, idx) => {
            const data = getCharacterData(id);
            const x = startX + idx * (cardWidth + gap);

            const cardBg = this.add.rectangle(x, y, cardWidth, cardHeight, 0x222233)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true });

            const nameText = this.add.text(x, y - 160, data.name, { fontSize: '19px', fill: '#ffffff' }).setOrigin(0.5);

            const statsText = this.add.text(x, y - 60,
                `HP: ${data.maxHp}\n攻擊力: ${data.atk}\n魔力: ${data.maxMana}\n爆擊增益: +${data.critBonus || 0}\n速度加值: +${data.speedBonus || 0}\n攻擊次數: ${data.atkCount || 1}`,
                { fontSize: '13px', fill: '#aaddff', align: 'center', lineSpacing: 6 }
            ).setOrigin(0.5);

            const descText = this.add.text(x, y + 100, data.description || '', {
                fontSize: '12px', fill: '#cccccc', align: 'center',
                wordWrap: { width: cardWidth - 30 , useAdvancedWrap: true }, lineSpacing: 4
            }).setOrigin(0.5);

            const selectBtn = this.add.text(x, y + 165, '[ 選擇此角色 ]', {
                fontSize: '14px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 10, y: 6 }
            }).setOrigin(0.5);

            cardBg.on('pointerdown', () => this.onCharacterChosen(id, container));
            container.add([cardBg, nameText, statsText, descText, selectBtn]);
        });
    }

    onCharacterChosen(characterId, container) {
        gameState.initNewGame(characterId);
        container.destroy();
        this.enterRegionFlow();
    }

    // ============================================================
    // 🟢 階段5新增：區域制主流程入口
    // ============================================================
    enterRegionFlow() {
        if (!this._pauseBtn) {
            this._pauseBtn = this.add.text(720, 10, '[ ⏸ 選單 ]', {
                fontSize: '15px', fill: '#00ffff', backgroundColor: '#222'
            }).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openPauseMenu());
        }
        if (gameState.currentRegionGraph) {
            this.renderRegionMapUI();
            return;
        }
        if (!gameState.pendingRegionChoices) {
            gameState.generateRegionChoices();
        }
        this.showRegionChoiceUI();
    }

    showRegionChoiceUI() {
        const container = this.add.container(0, 0).setDepth(2000);
        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.95);
        const isFinal = gameState.isFinalRegionSelection();
        const title = this.add.text(425, 50, isFinal ? '👑 選擇本輪最終區域' : '🗺️ 選擇下一個區域', { fontSize: '20px', fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const choices = gameState.pendingRegionChoices;
        const cardWidth = 220, cardHeight = 300, gap = 30;
        const totalWidth = choices.length * cardWidth + (choices.length - 1) * gap;
        const startX = 425 - totalWidth / 2 + cardWidth / 2;
        const y = 290;

        choices.forEach((regionId, idx) => {
            const regionDef = getRegionData(regionId);
            const x = startX + idx * (cardWidth + gap);

            const cardBg = this.add.rectangle(x, y, cardWidth, cardHeight, 0x222233)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true });

            const nameText = this.add.text(x, y - 110, regionDef.name, { fontSize: '17px', fill: '#ffffff', wordWrap: { width: cardWidth - 20 } }).setOrigin(0.5);
            const floorText = this.add.text(x, y - 60, `樓層數: ${regionDef.floorRange[0]}~${regionDef.floorRange[1]}`, { fontSize: '13px', fill: '#aaddff' }).setOrigin(0.5);
            const finalLabel = isFinal ? `👑 最終樓層：${regionDef.regionBoss}` : `⚔️ 最終樓層菁英：${regionDef.eliteEnemy}`;
            const bossText = this.add.text(x, y - 20, finalLabel, { fontSize: '12px', fill: '#ffaaff', wordWrap: { width: cardWidth - 20 } }).setOrigin(0.5);

            this.add.text(x, y + 120, '[ 選擇此區域 ]', {
                fontSize: '14px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 10, y: 6 }
            }).setOrigin(0.5);

            cardBg.on('pointerdown', () => {
                gameState.chooseRegion(regionId);
                container.destroy();
                this.renderRegionMapUI();
            });

            container.add([cardBg, nameText, floorText, bossText]);
        });
    }

    // 🟢 讀取 currentRegionGraph 畫出全區域樓層+連線，可點擊範圍限制在 currentNodeId 的 connectsTo
    renderRegionMapUI() {
        if (this._regionMapContainer) { this._regionMapContainer.destroy(); this._regionMapContainer = null; }
        const container = this.add.container(0, 0);
        this._regionMapContainer = container;

        const graph = gameState.currentRegionGraph;
        const startY = 500;
        const floorGapY = 90;

        let clickableIds;
        if (gameState.currentNodeId === null) {
            clickableIds = new Set(graph.entryNodeIds);
        } else {
            const currentNode = graph.floors.flat().find(n => n.id === gameState.currentNodeId);
            clickableIds = new Set(currentNode ? currentNode.connectsTo : []);
        }

        // 連線（畫在節點下方）
        const lineGraphics = this.add.graphics();
        lineGraphics.lineStyle(2, 0x445566, 0.6);
        graph.floors.forEach((floorNodes, floorIdx) => {
            if (floorIdx >= graph.floors.length - 1) return;
            const y = startY - (floorIdx * floorGapY);
            const nextY = startY - ((floorIdx + 1) * floorGapY);
            const totalNodes = floorNodes.length;
            const nextTotalNodes = graph.floors[floorIdx + 1].length;

            floorNodes.forEach((node, nodeIdx) => {
                const x = 400 + (nodeIdx - (totalNodes - 1) / 2) * 160;
                node.connectsTo.forEach(targetId => {
                    const targetIdx = graph.floors[floorIdx + 1].findIndex(n => n.id === targetId);
                    if (targetIdx === -1) return;
                    const targetX = 400 + (targetIdx - (nextTotalNodes - 1) / 2) * 160;
                    lineGraphics.lineBetween(x, y, targetX, nextY);
                });
            });
        });
        container.add(lineGraphics);

        graph.floors.forEach((floorNodes, floorIdx) => {
            const y = startY - (floorIdx * floorGapY);
            const totalNodes = floorNodes.length;

            floorNodes.forEach((node, nodeIdx) => {
                const x = 400 + (nodeIdx - (totalNodes - 1) / 2) * 160;
                const typeConfig = NODE_TYPES[node.type] || NODE_TYPES.BATTLE;
                const isClickable = !node.visited && clickableIds.has(node.id);

                const btnBg = this.add.rectangle(x, y, 130, 50, isClickable ? 0x333355 : 0x111122)
                    .setStrokeStyle(2, isClickable ? 0x00ffff : 0x555555);

                const label = this.add.text(x, y, typeConfig.name, {
                    fontSize: '13px',
                    fill: isClickable ? '#ffffff' : '#888888'
                }).setOrigin(0.5);

                container.add([btnBg, label]);

                if (isClickable) {
                    btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                        node.visited = true;
                        this.enterNode(node);
                    });
                }
            });
        });
    }

    // 🟢 REST/EVENT 結算後的共用收尾：更新節點狀態，並依 advanceAfterNode() 結果決定要重繪地圖還是跳區域選擇
    afterNodeCompleted(node) {
        const result = gameState.advanceAfterNode(node);
        if (result && result.runComplete) {
            console.warn('⚠️ 非戰鬥節點觸發了 runComplete，理論上不應發生（最終層固定是 BATTLE_FINAL）');
            return;
        }
        if (result && result.choices) {
            this.showRegionChoiceUI();
        } else {
            this.renderRegionMapUI();
        }
    }

    // 🟢 開啟暫停選單
    openPauseMenu() {
        if (PauseMenu.isOpen(this)) { PauseMenu.close(this); return; }
        PauseMenu.open(this, [
            { label: '[ 📖 教學 ]', onClick: () => TutorialSystem.showTutorialUI(this, () => {}) },
            { label: '[ 🏠 回主選單 ]', color: '#ffcc66', onClick: () => this._leaveToMainMenu(false) },  // 地圖上已自動存檔，不用確認
            { label: '[ 🗑️ 放棄本輪 ]', color: '#ff6666',
              confirm: '放棄本輪會刪除存檔並結束這次冒險，確定嗎？',
              onClick: () => this._leaveToMainMenu(true) }
        ]);
    }

    _leaveToMainMenu(resetRun) {
        if (resetRun) gameState.resetToCharacterSelect();
        else gameState.unloadRun();
        this.scene.start('MainMenuScene');
    }

    enterNode(node) {
        const typeConfig = NODE_TYPES[node.type];
        if (!typeConfig || typeof typeConfig.onEnter !== 'function') {
            console.error(`⚠️ 未知節點類型或缺少 onEnter handler: ${node.type}`);
            return;
        }
        typeConfig.onEnter(this, node, gameState);
    }

    // ============================================================
    // 🟢 EVENT 節點：從 EVENT_DATABASE 隨機抽一個事件，跳出選項 UI
    // ============================================================
    showEventUI(node) {
        this._pendingEventNode = node;
        const eventDef = Phaser.Utils.Array.GetRandom(EVENT_DATABASE);

        const container = this.add.container(0, 0).setDepth(2000);
        const overlay = this.add.rectangle(425, 275, 850, 550, 0x000000, 0.92);
        const title = this.add.text(425, 60, eventDef.title, { fontSize: '20px', fill: '#ffcc00' }).setOrigin(0.5);
        const desc = this.add.text(425, 130, eventDef.desc, {
            fontSize: '14px', fill: '#eeeeee', align: 'center', wordWrap: { width: 650 }, lineSpacing: 6
        }).setOrigin(0.5);

        container.add([overlay, title, desc]);

        const optionTexts = [];
        eventDef.options.forEach((option, idx) => {
            const y = 220 + idx * 60;
            const btn = this.add.text(425, y, option.text, {
                fontSize: '15px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 12, y: 8 },
                wordWrap: { width: 600 }, align: 'center'
            }).setOrigin(0.5)
              .setInteractive({ useHandCursor: true })
              .on('pointerdown', () => {
                  // 選完之後所有選項按鈕失效，避免連點觸發多次效果
                  optionTexts.forEach(t => { t.disableInteractive(); });

                  const resultMsg = option.action(gameState.hero, () => {});
                  this.showEventResult(container, resultMsg);
              });

            container.add(btn);
            optionTexts.push(btn);
        });
    }

    // 顯示事件結果訊息，並提供「繼續」按鈕收尾（推進樓層、重整地圖）
    showEventResult(container, resultMsg) {
        const resultBg = this.add.rectangle(425, 430, 700, 70, 0x111122).setStrokeStyle(2, 0x00ffff);
        const resultText = this.add.text(425, 430, resultMsg || '事件結束。', {
            fontSize: '14px', fill: '#ffffff', align: 'center', wordWrap: { width: 650 }
        }).setOrigin(0.5);

        const continueBtn = this.add.text(425, 480, '[ 繼續前進 ]', {
            fontSize: '15px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 12, y: 6 }
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
                  container.destroy();
                  this.afterNodeCompleted(this._pendingEventNode);
              });

        container.add([resultBg, resultText, continueBtn]);
    }
}