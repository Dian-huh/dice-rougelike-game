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
 */

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
                if (!scene.enemyDisplays || scene.enemyDisplays.length === 0) {
                    scene.renderEnemyUI();
                }

                this.isActive = true;
                scene.isPickingTarget = true;   // 🟢 新增：讓 renderEnemyUI() 的防呆真正生效
                scene.appendLog(`🎯 請點選要攻擊的敵人目標...`, 'system');

                scene.enemyDisplays.forEach(display => {
                    if (display.enemy.hp > 0 && this.aliveEnemies.includes(display.enemy)) {
                        display.bg.setFillStyle(0x333355, 0.35).setStrokeStyle(2, 0xffff00);
                        display.bg.setInteractive({ useHandCursor: true });
                        display.bg.on('pointerdown', () => this._onTargetChosen(display.enemy));
                    }
                });
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
                const bg = scene.add.rectangle(620, 200, 260, 90, 0x000000, 0.95).setStrokeStyle(2, 0x66ccff);
                const text = scene.add.text(500, 165, `🎲 攻擊骰結果：[ ${this.actionDice} ] 點`, { fontSize: '15px', fill: '#ffffff' });
                const confirmBtn = scene.add.text(500, 200, '[ ✅ 確定使用 ]', { fontSize: '14px', fill: '#00ffaa' })
                    .setInteractive({ useHandCursor: true });
                const rerollBtn = scene.add.text(500, 230, `[ 🔄 重骰 (剩餘${this.rerollsLeft}次) ]`, { fontSize: '14px', fill: '#66ccff' })
                    .setInteractive({ useHandCursor: true });

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

                this.container = scene.add.container(200, 160);
                let bg = scene.add.rectangle(180, 40, 420, 90, 0x000000, 0.95).setStrokeStyle(2, 0xffcc00);
                this.pickerTitleText = scene.add.text(10, 5, this.title, { fontSize: '14px', fill: '#ffcc00' });
                this.container.add([bg, this.pickerTitleText]);

                for (let i = 1; i <= 6; i++) {
                    let btn = scene.add.text((i - 1) * 65 + 15, 35, `[ ${i} ]`, { fontSize: '20px', fill: '#ffffff', backgroundColor: '#333' })
                        .setInteractive({ useHandCursor: true })
                        .on('pointerdown', () => {
                            this.hide();
                            this.onChosen(i);
                        });
                    this.container.add(btn);
                }

                this.container.setDepth(100);
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
