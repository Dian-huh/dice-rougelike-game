// js/systems/PauseMenu.js
// 通用暫停選單：場景只需要傳入 items，選單負責畫面、二次確認、關閉
// items: [{ label, onClick, color?, confirm? }]（有 confirm 文字的項目會先跳確認）
import { fullOverlay, CX, Y, S, px } from '../config/layout.js';

export class PauseMenu {
    static isOpen(scene) {
        return !!scene._pauseMenuContainer;
    }

    static close(scene) {
        if (scene._pauseMenuContainer) {
            scene._pauseMenuContainer.destroy();
            scene._pauseMenuContainer = null;
        }
    }

    static open(scene, items) {
        this.close(scene);
        const container = scene.add.container(0, 0).setDepth(2500);
        const overlay = fullOverlay(scene, 0.92);
        const body = scene.add.container(0, 0);
        container.add([overlay, body]);
        scene._pauseMenuContainer = container;

        const makeBtn = (y, label, color, onClick) =>
            scene.add.text(CX, Y(y), label, {
                fontSize: px(16), fill: color, backgroundColor: '#222', padding: { x: S(14), y: S(8) }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);

        const showConfirm = (item) => {
            body.removeAll(true);
            body.add(scene.add.text(CX, Y(160), item.confirm, {
                fontSize: px(15), fill: '#ffffff', align: 'center', wordWrap: { width: S(480) }, lineSpacing: S(6)
            }).setOrigin(0.5));
            body.add(makeBtn(260, '[ 確定 ]', '#ff6666', () => { this.close(scene); item.onClick(); }));
            body.add(makeBtn(310, '[ 返回 ]', '#66ccff', showList));
        };

        // 傳入的 y 都是舊版座標（內部統一由 makeBtn 轉換）
        const showList = () => {
            body.removeAll(true);
            body.add(scene.add.text(CX, Y(50), '⏸ 暫停選單', { fontSize: px(22), fill: '#ffcc00' }).setOrigin(0.5));
            items.forEach((item, idx) => {
                body.add(makeBtn(110 + idx * 48, item.label, item.color || '#00ffaa', () => {
                    if (item.confirm) { showConfirm(item); return; }
                    this.close(scene);
                    item.onClick();
                }));
            });
            body.add(makeBtn(110 + items.length * 48 + 16, '[ ▶ 繼續遊戲 ]', '#66ccff', () => this.close(scene)));
        };

        showList();
    }
}