// tools/migrate-step1.mjs
//
// 步驟1：機械式替換（零行為變化，因為 layout.js 目前仍是 850x550）
//   1. this/scene.add.rectangle(425, 275, 850, 550, 0x000000, A)  ->  fullOverlay(this/scene, A)
//   2. this/scene.add.text|rectangle(425, ...                     ->  ...(CX, ...
//   3. 425 - totalWidth                                           ->  CX - totalWidth
//   並自動補上 import { ... } from '<相對路徑>/config/layout.js'
//
// 刻意「不」做全域 425 -> CX：有些 425 其實是 y 座標
// （例如 RewardSystem 的跳過按鈕、ShopSystem 的 addButton(scene, container, 425, ...)）。
//
// 用法（在專案根目錄，放著 js/ 資料夾的地方）：
//   node tools/migrate-step1.mjs --dry    只預覽，不寫檔
//   node tools/migrate-step1.mjs          實際寫檔
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('js');
const LAYOUT = path.join(ROOT, 'config', 'layout.js');
const DRY = process.argv.includes('--dry');

if (!fs.existsSync(LAYOUT)) {
    console.error('找不到 js/config/layout.js，請先完成步驟0（把 layout.js 放進去）。');
    process.exit(1);
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

const OVERLAY_RE = /\b(this|scene)\.add\.rectangle\(\s*425,\s*275,\s*850,\s*550,\s*0x000000,\s*([\d.]+)\s*\)/g;
const X_RE = /\b(this|scene)\.add\.(text|rectangle)\(\s*425,/g;
const START_X_RE = /\b425(\s*-\s*totalWidth)/g;
const IMPORT_RE = /^import[\s\S]*?from\s*['"][^'"]+['"];?/gm;

const changed = [];
const skipped = [];
const leftovers = [];

function scan(text, rel) {
    text.split(/\r?\n/).forEach((line, i) => {
        if (/\b(425|275|850|550)\b/.test(line)) {
            leftovers.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
        }
    });
}

for (const file of walk(ROOT)) {
    if (path.resolve(file) === LAYOUT) continue;
    const rel = path.relative(process.cwd(), file);
    const src = fs.readFileSync(file, 'utf8');

    if (src.includes('config/layout.js')) {
        skipped.push(rel);
        scan(src, rel);
    } else {
        const counts = { overlay: 0, x: 0, start: 0 };
        let out = src
            .replace(OVERLAY_RE, (_, who, alpha) => { counts.overlay++; return `fullOverlay(${who}, ${alpha})`; })
            .replace(X_RE, (_, who, kind) => { counts.x++; return `${who}.add.${kind}(CX,`; })
            .replace(START_X_RE, (_, rest) => { counts.start++; return `CX${rest}`; });

        if (out !== src) {
            const names = [];
            if (counts.overlay > 0) names.push('fullOverlay');
            if (counts.x + counts.start > 0) names.push('CX');

            const eol = src.includes('\r\n') ? '\r\n' : '\n';
            let spec = path.relative(path.dirname(file), LAYOUT).split(path.sep).join('/');
            if (!spec.startsWith('.')) spec = './' + spec;
            const importLine = `import { ${names.join(', ')} } from '${spec}';`;

            let lastEnd = -1;
            for (const m of out.matchAll(IMPORT_RE)) lastEnd = m.index + m[0].length;
            if (lastEnd === -1) {
                out = importLine + eol + out;
            } else {
                const nl = out.indexOf('\n', lastEnd);
                const at = nl === -1 ? out.length : nl;
                const before = out.slice(0, at).replace(/\r$/, '');
                out = before + eol + importLine + out.slice(at);
            }

            if (!DRY) fs.writeFileSync(file, out, 'utf8');
            changed.push(`${rel}  (遮罩 ${counts.overlay} / 置中x ${counts.x} / startX ${counts.start})`);
        }

        // 掃描仍殘留的寫死座標，留給步驟2人工處理
        scan(out, rel);
    }
}

console.log(`${DRY ? '[預覽] ' : ''}已處理檔案：`);
changed.forEach(l => console.log('  ✔ ' + l));
if (skipped.length) {
    console.log('已含 layout.js import，略過（重複執行時正常）：');
    skipped.forEach(l => console.log('  - ' + l));
}
console.log(`\n仍殘留 425/275/850/550 的行（${leftovers.length} 行，步驟2再人工處理）：`);
leftovers.forEach(l => console.log('  ' + l));
