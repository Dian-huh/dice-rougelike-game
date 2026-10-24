/**
 * UIInteractionSystem.js
 * 
 * 职责：处理 UI 交互流程（与用户输入和屏幕显示相关）
 * - 目标选择 UI 的显示/隐藏/交互
 * - 重骰确认框的显示/交互
 * - 骰子选择器的打开/交互
 * 
 * 不处理：业务逻辑决策（交给 CardPlaySystem/BattleFlowSystem）
 * 
 * 设计理念：
 * UIInteractionSystem 返回一个"UI 会话"对象，包含：
 * - show() 方法显示 UI
 * - 用户交互后自动调用回调函数
 * - 自动管理 UI 状态（创建/销毁）
 *
 * 🟢 版面（1920x1080）：全螢幕選單類（選卡器、棄牌選擇）用 X/Y/S/px 換算；
 *    疊在戰鬥畫面上的小視窗（重骰確認框、骰子選擇器）固定放在左欄的
 *    「勇者狀態/骰子面板」上方區域 (中心約 x=450, y=375)，
 *    不遮住下方的操作按鈕與右欄的敵人資訊。
 */
import { fullOverlay, CX, X, Y, S, px } from '../config/layout.js';

export class UIInteractionSystem {
    /**
     * 创建一个目标选择 UI 会话
     * 返回会话对象，调用 session.show() 来显示
     */
    static createTargetPickerSession(scene, enemies, aliveEnemies, onTargetChosen) {
        return {
            enemies: enemies,
            aliveEnemies: aliveEnemies,
            onTargetChosen: onTargetChosen,
            isActive: false,

            // 🔧 改為操作 scene.enemyDisplays（BattleScene 的持久清單），
            // 不再自行渲染一份獨立副本，避免畫面上出現重複的敵人資訊
            show() {
                // 🟢 每次都依「當下的 enemies」重建顯示，不信任可能過期的 enemyDisplays
                //    （召喚、死亡後畫面可能還沒刷新）
                scene.isPickingTarget = false;
                scene.renderEnemyUI();

                this.isActive = true;
                scene.isPickingTarget = true;   // renderEnemyUI() 的防呆：選目標期間不重繪
                scene.appendLog(`🎯 請點選要攻擊的敵人目標...`, 'system');

                let enabled = 0;
                scene.enemyDisplays.forEach(display => {
                    if (display.enemy.hp > 0 && this.aliveEnemies.includes(display.enemy)) {
                        display.bg.setFillStyle(0x333355, 0.35).setStrokeStyle(S(2), 0xffff00);
                        display.bg.setInteractive({ useHandCursor: true });
                        display.bg.on('pointerdown', () => this._onTargetChosen(display.enemy));
                        enabled += 1;
                    }
                });

                // 🟢 保險：理論上不會發生；萬一沒有任何可點的目標，自動選第一個候選，避免整個流程卡死
                if (enabled === 0 && this.aliveEnemies.length > 0) {
                    scene.appendLog(`⚠️ 找不到可點選的目標，自動選定第一個候選`, 'system');
                    this._onTargetChosen(this.aliveEnemies[0]);
                }
            },

            hide() {
                if (!this.isActive || !scene.enemyDisplays) return;

                scene.enemyDisplays.forEach(display => {
                    display.bg.removeAllListeners('pointerdown');
                    display.bg.disableInteractive();
                    display.bg.setFillStyle(0x000000, 0).setStrokeStyle(0);
                });

                this.isActive = false;
                scene.isPickingTarget = false;   // 🟢 新增：解除防呆，恢復正常重繪
            },

            // 🔧 不再銷毀 enemyDisplays，那是 scene 的持久狀態，session 只負責解除互動
            destroy() {
                this.hide();
            },

            _onTargetChosen(enemy) {
                this.hide();
                scene.appendLog(`🎯 選定目標：${enemy.name}`, 'system');
                this.onTargetChosen(enemy);
            }
        };
    }

    /**
     * 创建一个重骰确认框 UI 会话
     */
    static createRerollConfirmSession(scene, actionDice, rerollsLeft, onResolved) {
        return {
            actionDice: actionDice,
            rerollsLeft: rerollsLeft,
            onResolved: onResolved,
            container: null,

            show() {
                if (this.container) this.container.destroy();

                this.container = scene.add.container(0, 0).setDepth(1500);
                const bg = scene.add.rectangle(450, 375, 700, 180, 0x000000, 0.95).setStrokeStyle(S(2), 0x66ccff);
                const text = scene.add.text(450, 330, `🎲 攻擊骰結果：[ ${this.actionDice} ] 點`, { fontSize: px(15), fill: '#ffffff' })
                    .setOrigin(0.5);
                const confirmBtn = scene.add.text(450, 378, '[ ✅ 確定使用 ]', { fontSize: px(14), fill: '#00ffaa' })
                    .setOrigin(0.5).setInteractive({ useHandCursor: true });
                const rerollBtn = scene.add.text(450, 424, `[ 🔄 重骰 (剩餘${this.rerollsLeft}次) ]`, { fontSize: px(14), fill: '#66ccff' })
                    .setOrigin(0.5).setInteractive({ useHandCursor: true });

                this.container.add([bg, text, confirmBtn, rerollBtn]);

                confirmBtn.on('pointerdown', () => {
                    this.hide();
                    this.onResolved({ reroll: false });
                });

                rerollBtn.on('pointerdown', () => {
                    this.hide();
                    this.onResolved({ reroll: true });
                });
            },

            hide() {
                if (this.container) {
                    this.container.destroy();
                    this.container = null;
                }
            }
        };
    }

    /**
     * 通用「從牌組選一張」選卡器
     * deck：要顯示的卡片陣列；onPick(idx, card)：選定；onCancel()：按取消
     * 版面每列 6 張（舊版座標），約 30 張以內不會超出畫面
     */
    static createDeckPickerSession(scene, deck, title, onPick, onCancel, cancelLabel = '[ 🚫 取消 ]') {
        return {
            container: null,

            show() {
                this.destroy();
                const container = scene.add.container(0, 0).setDepth(2200);
                this.container = container;

                const overlay = fullOverlay(scene, 0.94);
                const titleText = scene.add.text(CX, Y(30), title, {
                    fontSize: px(14), fill: '#ffcc00', align: 'center', wordWrap: { width: S(760) }
                }).setOrigin(0.5);
                container.add([overlay, titleText]);

                const perRow = 6;
                deck.forEach((card, idx) => {
                    const col = idx % perRow, row = Math.floor(idx / perRow);
                    const x = 85 + col * 136, y = 100 + row * 82;   // 舊版座標

                    const bg = scene.add.rectangle(X(x), Y(y), S(124), S(70), 0x222233)
                        .setStrokeStyle(S(2), 0x00ffff)
                        .setInteractive({ useHandCursor: true });
                    const nameText = scene.add.text(X(x - 57), Y(y - 30), card.name, {
                        fontSize: px(12), fill: '#fff', wordWrap: { width: S(114) }
                    });
                    const descText = scene.add.text(X(x - 57), Y(y - 10), card.desc || '', {
                        fontSize: px(9), fill: '#aaaaaa', wordWrap: { width: S(114), useAdvancedWrap: true }
                    });

                    bg.on('pointerdown', () => { this.destroy(); onPick(idx, card); });
                    container.add([bg, nameText, descText]);
                });

                const cancelBtn = scene.add.text(CX, Y(510), cancelLabel, {
                    fontSize: px(13), fill: '#ff6666', backgroundColor: '#222', padding: { x: S(10), y: S(5) }
                }).setOrigin(0.5).setInteractive({ useHandCursor: true })
                  .on('pointerdown', () => { this.destroy(); if (onCancel) onCancel(); });
                container.add(cancelBtn);
            },

            destroy() {
                if (this.container) { this.container.destroy(); this.container = null; }
            }
        };
    }

    /**
     * 🟢 階段4新增：法典專用的棄牌選擇會話
     * 點一張立刻棄置，達 minCount 後可按「完成」，達 maxCount 自動結束
     */
    static createDiscardPickerSession(scene, deckSys, minCount, maxCount, onComplete) {
        return {
            discardedCount: 0,
            container: null,

            show() {
                this.render();
            },

            render() {
                if (this.container) this.container.destroy();
                this.container = scene.add.container(0, 0).setDepth(1900);
                const overlay = fullOverlay(scene, 0.92);
                const title = scene.add.text(CX, Y(40),
                    `🗑️ 法典：請選擇要棄置的卡片 (已棄 ${this.discardedCount}/${maxCount}，至少 ${minCount} 張)`,
                    { fontSize: px(15), fill: '#ffcc00' }).setOrigin(0.5);
                this.container.add([overlay, title]);

                deckSys.hand.forEach((card, idx) => {
                    const col = idx % 5, row = Math.floor(idx / 5);
                    const x = 90 + col * 150, y = 100 + row * 90;   // 舊版座標
                    const cardBg = scene.add.rectangle(X(x), Y(y), S(130), S(70), 0x222233)
                        .setStrokeStyle(S(2), 0xff6666)
                        .setInteractive({ useHandCursor: true });
                    const nameText = scene.add.text(X(x - 60), Y(y - 30), card.name, {
                        fontSize: px(12), fill: '#fff', wordWrap: { width: S(120) }
                    });
                    cardBg.on('pointerdown', () => this._onDiscard(idx));
                    this.container.add([cardBg, nameText]);
                });

                if (this.discardedCount >= minCount) {
                    const doneBtn = scene.add.text(CX, Y(480), '[ ✅ 完成選擇 ]', {
                        fontSize: px(15), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(12), y: S(6) }
                    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
                      .on('pointerdown', () => this._finish());
                    this.container.add(doneBtn);
                }
            },

            _onDiscard(idx) {
                const [card] = deckSys.hand.splice(idx, 1);
                deckSys.discardPile.push(card);
                this.discardedCount += 1;
                scene.appendLog(`🗑️ 棄置了 [${card.name}]`, 'system');
                if (this.discardedCount >= maxCount) {
                    this._finish();
                } else {
                    this.render();
                }
            },

            _finish() {
                if (this.container) { this.container.destroy(); this.container = null; }
                onComplete(this.discardedCount);
            },

            destroy() {
                if (this.container) { this.container.destroy(); this.container = null; }
            }
        };
    }

    /**
     * 创建一个骰子选择器 UI 会话
     */
    static createDicePickerSession(scene, title, onChosen) {
        return {
            title: title,
            onChosen: onChosen,
            container: null,
            pickerTitleText: null,

            show() {
                if (this.container) {
                    this.container.setVisible(true);
                    return;
                }

                this.container = scene.add.container(0, 0);
                let bg = scene.add.rectangle(450, 375, 800, 180, 0x000000, 0.95).setStrokeStyle(S(2), 0xffcc00);
                this.pickerTitleText = scene.add.text(450, 325, this.title, { fontSize: px(14), fill: '#ffcc00' }).setOrigin(0.5);
                this.container.add([bg, this.pickerTitleText]);

                for (let i = 1; i <= 6; i++) {
                    let btn = scene.add.text(450 + (i - 3.5) * 120, 392, `[ ${i} ]`, {
                        fontSize: px(20), fill: '#ffffff', backgroundColor: '#333', padding: { x: S(6), y: S(4) }
                    })
                        .setOrigin(0.5)
                        .setInteractive({ useHandCursor: true })
                        .on('pointerdown', () => {
                            this.hide();
                            this.onChosen(i);
                        });
                    this.container.add(btn);
                }

                this.container.setDepth(1400);
            },

            hide() {
                if (this.container) {
                    this.container.setVisible(false);
                }
            },

            destroy() {
                if (this.container) {
                    this.container.destroy();
                    this.container = null;
                }
            },

            setTitle(newTitle) {
                this.title = newTitle;
                if (this.pickerTitleText) {
                    this.pickerTitleText.setText(newTitle);
                }
            }
        };
    }
}