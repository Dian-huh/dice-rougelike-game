import { NODE_TYPES } from '../data/mapData.js';
import { gameState } from '../data/gameState.js';
import { EVENT_DATABASE } from '../data/eventData.js';
import { getAllCharacterIds, getCharacterData } from '../characters/characterRegistry.js';   // 🟢 這行要存在

export class MapScene extends Phaser.Scene {
    constructor() { 
        super({ key: 'MapScene' }); 
    }

    create() {
        if (!gameState.mapData) {
            const loaded = gameState.tryLoadSave();
            if (!loaded) {
                this.showCharacterSelectUI();   // 🔴 改動：不再直接 initNewGame()，先跳選角
                return;
            }
        }
        this.renderMapUI();
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
        this.renderMapUI();
    }

    renderMapUI() {
        const startY = 500;
        const floorGapY = 90;

        gameState.mapData.forEach((floorNodes, floorIdx) => {
            const floorNumber = floorIdx + 1;
            const y = startY - (floorIdx * floorGapY);
            const isCurrentFloor = (floorNumber === gameState.currentFloor);

            const totalNodes = floorNodes.length;
            floorNodes.forEach((node, nodeIdx) => {
                const x = 400 + (nodeIdx - (totalNodes - 1) / 2) * 160;
                const typeConfig = NODE_TYPES[node.type] || NODE_TYPES.BATTLE;
                const isClickable = isCurrentFloor && !node.visited;

                const btnBg = this.add.rectangle(x, y, 130, 50, isClickable ? 0x333355 : 0x111122)
                    .setStrokeStyle(2, isClickable ? 0x00ffff : 0x555555);

                this.add.text(x, y, typeConfig.name, {
                    fontSize: '13px',
                    fill: isClickable ? '#ffffff' : '#888888'
                }).setOrigin(0.5);

                if (isClickable) {
                    btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
                        node.visited = true;
                        this.enterNode(node);
                    });
                }
            });
        });
    }

    enterNode(node) {
        if (node.type === 'REST') {
            gameState.hero.hp = Math.min(gameState.hero.maxHp, gameState.hero.hp + 15);
            alert(`🔥 在營火旁休息，恢復了 15 點生命值！`);
            gameState.nextFloor();
            this.scene.restart();
        } 
        else if (node.type === 'EVENT') {
            this.showEventUI();   // 🟢 改為跳出互動事件 UI，取代原本寫死的 +20 金幣
        } 
        else {
            this.scene.start('BattleScene', { node });
        }
    }

    // ============================================================
    // 🟢 EVENT 節點：從 EVENT_DATABASE 隨機抽一個事件，跳出選項 UI
    // ============================================================
    showEventUI() {
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
              gameState.nextFloor();
              this.scene.restart();
          });

        container.add([resultBg, resultText, continueBtn]);
    }
}