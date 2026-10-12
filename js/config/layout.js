// js/config/layout.js
//
// 畫面尺寸與版面共用常數（步驟2起：1920x1080）。
//
// 選單類畫面（主選單、暫停、教學、獎勵、商店、選卡器…）沿用舊版 850x550 的版面設計，
// 用下面的 X / Y / S / px 以「畫面中心為基準放大 2 倍」換算，不必逐一重新設計座標：
//   X(x)   舊版 x 座標  -> 新版 x（舊 425 即 CX，左右各留約 110px 邊距）
//   Y(y)   舊版 y 座標  -> 新版 y（舊 275 即 CY；舊版 y 在 5~545 之間都落在畫面內）
//   S(n)   舊版寬高、間距、內距、換行寬度 -> 新版尺寸
//   px(n)  舊版字級 -> 新版字級字串
// 戰鬥畫面與地圖不用這套換算，會在步驟3、4依 1920x1080 真正重排。

export const GAME_W = 1920;
export const GAME_H = 1080;
export const CX = GAME_W / 2;
export const CY = GAME_H / 2;

export const UNIT = 2;
export const FONT_SCALE = UNIT;

export const X = (x) => CX + (x - 425) * UNIT;
export const Y = (y) => CY + (y - 275) * UNIT;
export const S = (n) => n * UNIT;
export const px = (n) => `${Math.round(n * FONT_SCALE)}px`;

// 全螢幕遮罩：一律可互動，避免點穿到底下的按鈕/手牌
export function fullOverlay(scene, alpha = 0.92) {
    return scene.add.rectangle(CX, CY, GAME_W, GAME_H, 0x000000, alpha).setInteractive();
}
// 全域補上文字上下內距，避免 emoji / 中文大字級的上緣被裁掉
// 已自行設定 padding 的文字（例如按鈕）不受影響
export function patchTextPadding() {
    const proto = Phaser.GameObjects.GameObjectFactory.prototype;
    const original = proto.text;
    proto.text = function (x, y, text, style = {}) {
        if (style.padding === undefined) {
            const size = parseFloat(style.fontSize) || 16;
            const pad = Math.ceil(size * 0.2);
            style = { ...style, padding: { top: pad, bottom: pad } };
        }
        return original.call(this, x, y, text, style);
    };
}