import { NODE_TYPES } from '../data/mapData.js';
import { gameState } from '../data/gameState.js';
import { EVENT_DATABASE } from '../data/eventData.js';
import { getAllCharacterIds, getCharacterData } from '../characters/characterRegistry.js';
import { getRegionData } from '../data/regionRegistry.js';
import { PauseMenu } from '../systems/PauseMenu.js';
import { TutorialSystem } from '../systems/TutorialSystem.js';
import { ShopSystem } from '../systems/ShopSystem.js';
import { ENEMY_DATABASE } from '../data/enemyData.js';
import { fullOverlay, CX, GAME_W, GAME_H, X, Y, S, px } from '../config/layout.js';

const enemyName = (id) => (ENEMY_DATABASE[id] && ENEMY_DATABASE[id].name) || id;
const regionEnemyDisplayName = (regionDef, enemyKey, displayNameKey) =>
    regionDef[displayNameKey] || (Array.isArray(regionDef[enemyKey])
        ? regionDef[enemyKey].map(enemyName).join('、')
        : enemyName(regionDef[enemyKey]));

// 🟢 縱向可捲動地圖的版面參數（1920x1080）：調整地圖外觀只改這張表
const MAP = {
    view: { y: 100, h: GAME_H - 100 },   // 可捲動區域（上方 100px 留給標題列）
    nodeW: 220, nodeH: 80,
    nodeSpacingX: 400,                    // 同一層節點的水平間距
    floorGapY: 300,                       // 樓層間距（越大爬塔感越強、越需要捲動）
    padTop: 120, padBottom: 140,
    focusRatio: 0.6                       // 「接下來要選的那一層」放在可視範圍由上往下 60% 處
};

// 🟢 版面（步驟2-B）：選角、區域選擇、事件畫面已改用 X/Y/S/px 換算成 1920x1080。
//    renderRegionMapUI()（地圖節點圖）仍是舊座標，會在步驟4 改成可捲動的縱向地圖。
export class MapScene extends Phaser.Scene {
    constructor() { 
        super({ key: 'MapScene' }); 
    }

    create() {
        this._pauseBtn = null;
        this._pauseMenuContainer = null;
        this._regionMapContainer = null;
        this._mapScroll = undefined;      // 地圖捲動位置（重新進入場景時重置，由自動定位決定）
        this._mapTween = null;
        this._mapMaskGfx = null;
        this._mapHitSet = null;
        this._mapDrag = null;
        this._mapInputBound = false;      // 場景重新開始後 input 監聽已被清除，需要重新綁定
        if (!gameState.hero) {
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
        const overlay = fullOverlay(this, 0.95);
        const title = this.add.text(CX, Y(45), '⚔️ 請選擇你的冒險者', { fontSize: px(22), fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const ids = getAllCharacterIds();
        const cardWidth = 220, cardHeight = 380, gap = 30;   // 舊版尺寸
        const totalWidth = ids.length * cardWidth + (ids.length - 1) * gap;
        const startX = 425 - totalWidth / 2 + cardWidth / 2;  // 舊版座標
        const y = 290;

        ids.forEach((id, idx) => {
            const data = getCharacterData(id);
            const x = X(startX + idx * (cardWidth + gap));

            const cardBg = this.add.rectangle(x, Y(y), S(cardWidth), S(cardHeight), 0x222233)
                .setStrokeStyle(S(2), 0x00ffff)
                .setInteractive({ useHandCursor: true });

            const nameText = this.add.text(x, Y(y - 160), data.name, { fontSize: px(19), fill: '#ffffff' }).setOrigin(0.5);

            const statsText = this.add.text(x, Y(y - 60),
                `HP: ${data.maxHp}\n攻擊力: ${data.atk}\n魔力: ${data.maxMana}\n爆擊增益: +${data.critBonus || 0}\n速度加值: +${data.speedBonus || 0}\n攻擊次數: ${data.atkCount || 1}`,
                { fontSize: px(13), fill: '#aaddff', align: 'center', lineSpacing: S(6) }
            ).setOrigin(0.5);

            const descText = this.add.text(x, Y(y + 100), data.description || '', {
                fontSize: px(12), fill: '#cccccc', align: 'center',
                wordWrap: { width: S(cardWidth - 30), useAdvancedWrap: true }, lineSpacing: S(4)
            }).setOrigin(0.5);

            const selectBtn = this.add.text(x, Y(y + 165), '[ 選擇此角色 ]', {
                fontSize: px(14), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(10), y: S(6) }
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
            this._pauseBtn = this.add.text(X(720), Y(10), '[ ⏸ 選單 ]', {
                fontSize: px(15), fill: '#00ffff', backgroundColor: '#222'
            }).setDepth(500).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openPauseMenu());
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
        this._destroyMapUI();
        this._mapScroll = undefined;   // 換區域後地圖高度不同，下次畫地圖時直接定位，不做捲動動畫
        const container = this.add.container(0, 0).setDepth(2000);
        const overlay = fullOverlay(this, 0.95);
        const isFinal = gameState.isFinalRegionSelection();
        const title = this.add.text(CX, Y(50), isFinal ? '👑 選擇本輪最終區域' : '🗺️ 選擇下一個區域', { fontSize: px(20), fill: '#ffcc00' }).setOrigin(0.5);
        container.add([overlay, title]);

        const choices = gameState.pendingRegionChoices;
        const cardWidth = 220, cardHeight = 300, gap = 30;   // 舊版尺寸
        const totalWidth = choices.length * cardWidth + (choices.length - 1) * gap;
        const startX = 425 - totalWidth / 2 + cardWidth / 2;  // 舊版座標
        const y = 290;

        choices.forEach((regionId, idx) => {
            const regionDef = getRegionData(regionId);
            const x = X(startX + idx * (cardWidth + gap));

            const cardBg = this.add.rectangle(x, Y(y), S(cardWidth), S(cardHeight), 0x222233)
                .setStrokeStyle(S(2), 0x00ffff)
                .setInteractive({ useHandCursor: true });

            const nameText = this.add.text(x, Y(y - 110), regionDef.name, { fontSize: px(17), fill: '#ffffff', wordWrap: { width: S(cardWidth - 20) } }).setOrigin(0.5);
            const floorText = this.add.text(x, Y(y - 60), `樓層數: ${regionDef.floorRange[0]}~${regionDef.floorRange[1]}`, { fontSize: px(13), fill: '#aaddff' }).setOrigin(0.5);
            const finalLabel = isFinal
                ? `👑 最終樓層：${regionEnemyDisplayName(regionDef, 'regionBoss', 'regionBossDisplayName')}`
                : `⚔️ 最終樓層菁英：${regionEnemyDisplayName(regionDef, 'eliteEnemy', 'eliteEnemyDisplayName')}`;
            const bossText = this.add.text(x, Y(y - 20), finalLabel, { fontSize: px(12), fill: '#ffaaff', wordWrap: { width: S(cardWidth - 20) } }).setOrigin(0.5);

            // 🔧 原本這個標籤沒有加進 container（深度比遮罩低，實際上被蓋住看不到），現在一併加入
            const selectLabel = this.add.text(x, Y(y + 120), '[ 選擇此區域 ]', {
                fontSize: px(14), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(10), y: S(6) }
            }).setOrigin(0.5);

            cardBg.on('pointerdown', () => {
                gameState.chooseRegion(regionId);
                container.destroy();
                this.renderRegionMapUI();
            });

            container.add([cardBg, nameText, floorText, bossText, selectLabel]);
        });
    }

    // ============================================================
    // 🟢 縱向可捲動地圖（1920x1080）
    //   - 1 樓在最下方、往上爬；內容比畫面高時可用滾輪 / 拖曳 / ▲▼ 捲動
    //   - 進入或回到地圖時，自動捲到「接下來要選的那一層」
    //   - 節點點擊改用 pointerup + 位移判斷，避免拖曳捲動時誤觸
    //   - 可點擊範圍仍限制在 currentNodeId 的 connectsTo
    // ============================================================
    renderRegionMapUI() {
        const prevScroll = this._mapScroll;
        this._destroyMapUI();

        const graph = gameState.currentRegionGraph;
        const regionDef = getRegionData(gameState.currentRegionId);
        const hero = gameState.hero;
        const V = MAP.view;

        const container = this.add.container(0, 0);
        this._regionMapContainer = container;
        const hitSet = new Set();   // 屬於地圖本身的可互動物件：用來判斷拖曳/滾輪是不是點在地圖上（而不是浮層）
        this._mapHitSet = hitSet;

        // ---- 標題列：區域名稱、進度、血量與金幣 ----
        const title = this.add.text(40, 16, `${regionDef ? regionDef.name : '區域'}　區域 ${gameState.regionsCompleted + 1}/${gameState.regionsPerRun}${gameState.currentRegionIsFinal ? '　👑 本輪壓軸' : ''}`, {
            fontSize: px(15), fill: '#ffcc00'
        });
        const stats = this.add.text(40, 58, `❤️ HP ${hero.hp}/${hero.maxHp}　💰 金幣 ${hero.gold || 0}`, {
            fontSize: px(13), fill: '#4efa7b'
        });
        container.add([title, stats]);

        // ---- 幾何：內容座標 0 在最頂端，1 樓在最下方 ----
        const floorCount = graph.floors.length;
        const H = MAP.padTop + MAP.padBottom + (floorCount - 1) * MAP.floorGapY + MAP.nodeH;
        const floorY = (f) => H - MAP.padBottom - MAP.nodeH / 2 - f * MAP.floorGapY;
        const nodeX = (idx, total) => CX + (idx - (total - 1) / 2) * MAP.nodeSpacingX;
        const maxScroll = Math.max(0, H - V.h);
        // 內容比可視範圍矮時貼齊下緣（1 樓在畫面底部，維持往上爬的感覺）
        this._mapGeom = { H, maxScroll, top: V.y + Math.max(0, V.h - H) };

        let clickableIds;
        let currentNode = null;
        if (gameState.currentNodeId === null) {
            clickableIds = new Set(graph.entryNodeIds);
        } else {
            currentNode = graph.floors.flat().find(n => n.id === gameState.currentNodeId) || null;
            clickableIds = new Set(currentNode ? currentNode.connectsTo : []);
        }

        // ---- 捲動內容（遮罩只顯示可視範圍）----
        const content = this.add.container(0, 0);
        this._mapContent = content;
        container.add(content);

        const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
        maskGfx.fillStyle(0xffffff);
        maskGfx.fillRect(0, V.y, GAME_W, V.h);
        content.setMask(maskGfx.createGeometryMask());
        this._mapMaskGfx = maskGfx;

        // 連線：已走過的路徑＝金色、目前可選的路＝青色、其餘＝暗灰
        const lines = this.add.graphics();
        content.add(lines);
        graph.floors.forEach((floorNodes, f) => {
            if (f >= floorCount - 1) return;
            const nextNodes = graph.floors[f + 1];
            floorNodes.forEach((node, i) => {
                node.connectsTo.forEach(targetId => {
                    const j = nextNodes.findIndex(n => n.id === targetId);
                    if (j === -1) return;
                    const target = nextNodes[j];
                    if (node.visited && target.visited) lines.lineStyle(S(2.5), 0xffcc00, 0.9);
                    else if (currentNode && node.id === currentNode.id && clickableIds.has(target.id)) lines.lineStyle(S(2.5), 0x00ffff, 0.9);
                    else lines.lineStyle(S(1.5), 0x445566, 0.55);
                    lines.lineBetween(nodeX(i, floorNodes.length), floorY(f), nodeX(j, nextNodes.length), floorY(f + 1));
                });
            });
        });

        // 節點
        graph.floors.forEach((floorNodes, f) => {
            const y = floorY(f);
            content.add(this.add.text(60, y, `第 ${f + 1} 層`, { fontSize: px(11), fill: '#667788' }).setOrigin(0, 0.5));

            floorNodes.forEach((node, i) => {
                const x = nodeX(i, floorNodes.length);
                const typeConfig = NODE_TYPES[node.type] || NODE_TYPES.BATTLE;
                const isClickable = !node.visited && clickableIds.has(node.id);
                const isCurrent = !!currentNode && node.id === currentNode.id;
                const typeColor = parseInt((typeConfig.color || '#00ffff').slice(1), 16);

                const fill = isClickable ? 0x333355 : (node.visited ? 0x182418 : 0x111122);
                const stroke = isCurrent ? 0xffcc00 : (isClickable ? typeColor : (node.visited ? 0x558855 : 0x444444));
                const btnBg = this.add.rectangle(x, y, MAP.nodeW, MAP.nodeH, fill)
                    .setStrokeStyle(isClickable || isCurrent ? S(2.5) : S(1.5), stroke);

                const labelText = `${node.visited ? '✔ ' : ''}${node.label || typeConfig.name}`;
                const label = this.add.text(x, y, labelText, {
                    fontSize: px(13),
                    fill: isClickable ? '#ffffff' : (node.visited ? '#88aa88' : '#777777'),
                    align: 'center', wordWrap: { width: MAP.nodeW - 20 }
                }).setOrigin(0.5);

                content.add([btnBg, label]);

                if (isClickable) {
                    hitSet.add(btnBg);
                    btnBg.setInteractive({ useHandCursor: true }).on('pointerup', (pointer) => {
                        if (pointer.getDistance() > 10) return;   // 拖曳捲動後放開：不算點擊
                        if (pointer.y < V.y) return;              // 被標題列蓋住（遮罩外）的節點不可點
                        node.visited = true;
                        this.enterNode(node);
                    });
                }
            });
        });

        if (gameState.currentNodeId === null) {
            content.add(this.add.text(CX, floorY(0) + MAP.nodeH / 2 + 50, '🚪 區域入口：選擇一條路開始', {
                fontSize: px(11), fill: '#667788'
            }).setOrigin(0.5));
        }

        // ---- 捲動按鈕（內容比畫面高時才出現）----
        const focusFloor = currentNode
            ? Math.min(floorCount - 1, graph.floors.findIndex(fl => fl.some(n => n.id === currentNode.id)) + 1)
            : 0;
        this._mapFocusScroll = Phaser.Math.Clamp(floorY(focusFloor) - V.h * MAP.focusRatio, 0, maxScroll);

        if (maxScroll > 0) {
            const mkBtn = (x, y, label, onClick) => {
                const b = this.add.text(x, y, label, {
                    fontSize: px(18), fill: '#66ccff', backgroundColor: '#222', padding: { x: S(8), y: S(5) }
                }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
                hitSet.add(b);
                container.add(b);
            };
            mkBtn(GAME_W - 60, V.y + 70, '▲', () => this._scrollMapTo(this._mapScroll - 360, true));
            mkBtn(GAME_W - 60, V.y + 150, '▼', () => this._scrollMapTo(this._mapScroll + 360, true));
            mkBtn(GAME_W - 60, V.y + 230, '📍', () => this._scrollMapTo(this._mapFocusScroll, true));
        }

        // ---- 自動定位：同一個場景內重畫（事件/休息結束）用動畫捲過去，剛進場景直接定位 ----
        this._bindMapInput();
        if (prevScroll === undefined) {
            this._setMapScroll(this._mapFocusScroll);
        } else {
            this._setMapScroll(prevScroll);
            this._scrollMapTo(this._mapFocusScroll, true);
        }
    }

    _destroyMapUI() {
        if (this._mapTween) { this._mapTween.stop(); this._mapTween = null; }
        if (this._regionMapContainer) { this._regionMapContainer.destroy(); this._regionMapContainer = null; }
        if (this._mapMaskGfx) { this._mapMaskGfx.destroy(); this._mapMaskGfx = null; }
        this._mapContent = null;
        this._mapHitSet = null;
        this._mapDrag = null;
    }

    _setMapScroll(v) {
        if (!this._mapContent || !this._mapGeom) return;
        this._mapScroll = Phaser.Math.Clamp(v, 0, this._mapGeom.maxScroll);
        this._mapContent.y = this._mapGeom.top - this._mapScroll;
    }

    _scrollMapTo(target, animate) {
        if (!this._mapGeom) return;
        if (this._mapTween) { this._mapTween.stop(); this._mapTween = null; }
        target = Phaser.Math.Clamp(target, 0, this._mapGeom.maxScroll);
        if (!animate || Math.abs(target - this._mapScroll) < 4) { this._setMapScroll(target); return; }
        this._mapTween = this.tweens.addCounter({
            from: this._mapScroll, to: target, duration: 450, ease: 'Sine.easeInOut',
            onUpdate: (tw) => this._setMapScroll(tw.getValue()),
            onComplete: () => { this._mapTween = null; }
        });
    }

    // 拖曳 / 滾輪捲動：只在「點在地圖上」時生效（點到事件、商店、暫停選單等浮層時不捲動）
    _bindMapInput() {
        if (this._mapInputBound) return;
        this._mapInputBound = true;

        const onMapOnly = (over) => !over || over.every(o => this._mapHitSet && this._mapHitSet.has(o));
        const inView = (pointer) => pointer.y >= MAP.view.y;

        this.input.on('pointerdown', (pointer, over) => {
            if (!this._regionMapContainer || !inView(pointer) || !onMapOnly(over)) return;
            this._mapDrag = { y: pointer.y, scroll: this._mapScroll, active: false };
        });
        this.input.on('pointermove', (pointer) => {
            const d = this._mapDrag;
            if (!d || !pointer.isDown) return;
            const dy = pointer.y - d.y;
            if (!d.active && Math.abs(dy) < 6) return;   // 小幅晃動不算拖曳，避免點節點時畫面抖動
            d.active = true;
            if (this._mapTween) { this._mapTween.stop(); this._mapTween = null; }
            this._setMapScroll(d.scroll - dy);
        });
        const endDrag = () => { this._mapDrag = null; };
        this.input.on('pointerup', endDrag);
        this.input.on('pointerupoutside', endDrag);

        this.input.on('wheel', (pointer, over, dx, dy) => {
            if (!this._regionMapContainer || !inView(pointer) || !onMapOnly(over)) return;
            if (this._mapTween) { this._mapTween.stop(); this._mapTween = null; }
            this._setMapScroll(this._mapScroll + dy * 0.8);
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

    openRestArea(node, state) {
        ShopSystem.enterRest(this, node, state);
    }

    // ============================================================
    // 🟢 EVENT 節點：從 EVENT_DATABASE 隨機抽一個事件，跳出選項 UI
    // ============================================================
        // 依 condition 過濾可用事件；全部被過濾掉時退回完整清單，避免抽不到事件
    // 除錯：在 console 設定 DEBUG.forceEventId = 'fallen_monk' 可強制指定事件
    pickEvent() {
        const forcedId = window.DEBUG && window.DEBUG.forceEventId;
        if (forcedId) {
            const forced = EVENT_DATABASE.find(e => e.id === forcedId);
            if (forced) return forced;
        }
        const available = EVENT_DATABASE.filter(e =>
            typeof e.condition !== 'function' || e.condition(gameState.hero, gameState)
        );
        return Phaser.Utils.Array.GetRandom(available.length > 0 ? available : EVENT_DATABASE);
    }

    showEventUI(node) {
        this._pendingEventNode = node;
        const eventDef = this.pickEvent();
        gameState.recordSeenEvent(eventDef.id);   // 🟢 記錄遇過的事件，供日後連貫事件使用
        const ctx = { scene: this, gameState, deckSys: gameState.deckSys };

        const container = this.add.container(0, 0).setDepth(2000);
        const overlay = fullOverlay(this, 0.92);
        const title = this.add.text(CX, Y(60), eventDef.title, { fontSize: px(20), fill: '#ffcc00' }).setOrigin(0.5);
        const desc = this.add.text(CX, Y(130), eventDef.desc, {
            fontSize: px(14), fill: '#eeeeee', align: 'center', wordWrap: { width: S(650) }, lineSpacing: S(6)
        }).setOrigin(0.5);

        container.add([overlay, title, desc]);

        const optionTexts = [];
        eventDef.options.forEach((option, idx) => {
            const y = 220 + idx * 60;   // 舊版座標
            const btn = this.add.text(CX, Y(y), option.text, {
                fontSize: px(15), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(12), y: S(8) },
                wordWrap: { width: S(600) }, align: 'center'
            }).setOrigin(0.5)
              .setInteractive({ useHandCursor: true })
              .on('pointerdown', () => {
                  // 選完之後所有選項按鈕失效，避免連點觸發多次效果
                  optionTexts.forEach(t => { t.disableInteractive(); });

                  // action 可回傳字串或 Promise（需要玩家額外操作的事件，例如選卡）
                  Promise.resolve(option.action(gameState.hero, () => {}, ctx))
                      .then(resultMsg => this.showEventResult(container, resultMsg))
                      .catch(err => {
                          console.error(`⚠️ 事件 [${eventDef.id}] 執行錯誤：`, err);
                          this.showEventResult(container, '事件發生了意外，你繼續前進。');
                      });
              });

            container.add(btn);
            optionTexts.push(btn);
        });
    }

    // 顯示事件結果訊息，並提供「繼續」按鈕收尾（推進樓層、重整地圖）
    showEventResult(container, resultMsg) {
        const resultBg = this.add.rectangle(CX, Y(430), S(700), S(70), 0x111122).setStrokeStyle(S(2), 0x00ffff);
        const resultText = this.add.text(CX, Y(430), resultMsg || '事件結束。', {
            fontSize: px(14), fill: '#ffffff', align: 'center', wordWrap: { width: S(650) }
        }).setOrigin(0.5);

        const continueBtn = this.add.text(CX, Y(480), '[ 繼續前進 ]', {
            fontSize: px(15), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(12), y: S(6) }
        }).setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
                  container.destroy();
                  this.afterNodeCompleted(this._pendingEventNode);
              });

        container.add([resultBg, resultText, continueBtn]);
    }
}