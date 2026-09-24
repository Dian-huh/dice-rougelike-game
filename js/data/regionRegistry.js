// js/data/regionRegistry.js
//
// 🟢 區域登記表：比照 characterRegistry.js 模式，統一管理「有哪些區域」
// 之後新增區域只需要在這裡新增一筆設定，不需要動 generateRegionGraph() 或 MapScene 的邏輯
//
// eliteEnemy / regionBoss：非最終選擇時最終樓層固定出現 eliteEnemy；
// 若本區域被選為本輪壓軸(isFinalSelection)，則固定出現 regionBoss（Step3會接上判斷邏輯）

export const REGION_REGISTRY = {
    region_forest: {
        id: 'region_forest',
        name: '🌲 哥布林森林',
        floorRange: [4, 6],
        nodeCountRange: [1, 4],
        nodeTypeWeights: { BATTLE: 2, EVENT: 1, REST: 1 },
        enemyPool: { theme: ['goblin', 'goblin_shaman'] },
        eliteEnemy: 'goblin_shaman',   // 🟢 暫定用現有薩滿當菁英，之後想換更強變體再調整這一行即可
        regionBoss: 'black_dragon'
    },
    region_boundary: {
        id: 'region_boundary',
        name: '⚔️ 門衛邊境',
        floorRange: [4, 6],
        nodeCountRange: [1, 4],
        nodeTypeWeights: { BATTLE: 2, EVENT: 1, REST: 1 },
        enemyPool: { theme: ['shield_guardian', 'sword_guardian', 'staff_guardian', 'crossbow_guardian'] },
        eliteEnemy: 'sword_guardian',  // 🟢 暫定四天王之一當菁英，可改成隨機抽或指定其他隻
        regionBoss: 'boundary_guardian',
        finalRunPenultimate: {
            label: '👥 四天王齊上',
            forceEnemies: ['shield_guardian', 'sword_guardian', 'staff_guardian', 'crossbow_guardian']
        }
    },
    region_bandit: {
        id: 'region_bandit',
        name: '🏴 盜賊城寨',
        floorRange: [4, 6],
        nodeCountRange: [1, 4],
        nodeTypeWeights: { BATTLE: 2, EVENT: 1, REST: 1 },
        enemyPool: { theme: ['bandit', 'wanted_criminal'] },
        eliteEnemy: 'bandit_chief',
        regionBoss: 'boundary_guardian'   // 佔位
    }
    // region_xxx: { ... }  // 之後新增區域只需要在這裡加一筆
};

export function getRegionData(regionId) {
    return REGION_REGISTRY[regionId] || null;
}

export function getAllRegionIds() {
    return Object.keys(REGION_REGISTRY);
}

// ====================================================================
// 節點圖生成（殺戮尖塔簡化版分支路線）
// 全數透過 Phaser.Math.Between / Phaser.Utils.Array.GetRandom 取隨機值，
// 沿用 mapData.js 既有慣例，也方便之後用固定佇列 mock 寫決定性測試
// ====================================================================

function pickWeightedNodeType(nodeTypeWeights) {
    const entries = Object.entries(nodeTypeWeights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = Phaser.Math.Between(1, totalWeight);
    for (const [type, weight] of entries) {
        r -= weight;
        if (r <= 0) return type;
    }
    return entries[entries.length - 1][0];
}

// 決定某節點要連到下一層的 1~2 個 index，優先連「欄位相近」的節點
function pickNextFloorIndices(fromIndex, fromCount, toCount) {
    if (toCount === 1) return [0];

    const ratio = fromCount > 1 ? fromIndex / (fromCount - 1) : 0;
    const primary = Math.round(ratio * (toCount - 1));
    const indices = new Set([primary]);

    // 約1/3機率額外多連一條到鄰近節點，讓路線圖有分支感，不是每條路都一對一直線對應
    if (Phaser.Math.Between(1, 3) === 1) {
        const offset = Phaser.Utils.Array.GetRandom([-1, 1]);
        const neighbor = primary + offset;
        if (neighbor >= 0 && neighbor < toCount) indices.add(neighbor);
    }

    return Array.from(indices);
}

/**
 * 依區域設定生成本次的樓層節點圖
 * @param {object} regionDef 來自 REGION_REGISTRY 的區域設定
 * @returns {{ floors: Array<Array<object>>, entryNodeIds: string[] }}
 */
export function generateRegionGraph(regionDef, options = {}) {
    const floorCount = Phaser.Math.Between(regionDef.floorRange[0], regionDef.floorRange[1]);
    const floors = [];

    for (let f = 0; f < floorCount; f++) {
        const isFinalFloor = (f === floorCount - 1);
        const isPenultimateSpecial = !!(options.isFinalOfRun && regionDef.finalRunPenultimate && f === floorCount - 2);
        const floorNodes = [];

        if (isFinalFloor) {
            // 🟢 最終層固定收斂成單一節點。這裡的 type 先用通用佔位值 'BATTLE_FINAL'，
            // 究竟出現 eliteEnemy 還是 regionBoss，由 Step3 在玩家「選擇本區域」當下才判斷(isFinalSelection)
            // ⚠️ 依賴：Step2 幫 NODE_TYPES 加上這個新類型的顯示/handler設定
            floorNodes.push({
                id: `${regionDef.id}_${f}_1`,
                floor: f + 1,
                type: 'BATTLE_FINAL',
                difficulty: floorCount,
                visited: false,
                connectsTo: []
            });
        } else if (isPenultimateSpecial) {
            const p = regionDef.finalRunPenultimate;
            floorNodes.push({
                id: `${regionDef.id}_${f}_1`,
                floor: f + 1,
                type: 'BATTLE',
                difficulty: f + 1,
                visited: false,
                connectsTo: [],
                label: p.label,
                forceEnemies: [...p.forceEnemies]
            });
        } else {
            const nodeCount = Phaser.Math.Between(regionDef.nodeCountRange[0], regionDef.nodeCountRange[1]);
            for (let i = 0; i < nodeCount; i++) {
                floorNodes.push({
                    id: `${regionDef.id}_${f}_${i + 1}`,
                    floor: f + 1,
                    type: pickWeightedNodeType(regionDef.nodeTypeWeights),
                    difficulty: f + 1,
                    visited: false,
                    connectsTo: []
                });
            }
        }

        floors.push(floorNodes);
    }

    // 分支連線：每個節點連到下一層 1~2 個「欄位相近」的節點
    for (let f = 0; f < floors.length - 1; f++) {
        const currentFloor = floors[f];
        const nextFloor = floors[f + 1];

        currentFloor.forEach((node, idx) => {
            const targetIndices = pickNextFloorIndices(idx, currentFloor.length, nextFloor.length);
            node.connectsTo = targetIndices.map(i => nextFloor[i].id);
        });

        // 防呆：下一層若有節點完全沒被任何連線指到，從這層隨機挑一個節點補連線
        nextFloor.forEach(nextNode => {
            const hasIncoming = currentFloor.some(node => node.connectsTo.includes(nextNode.id));
            if (!hasIncoming) {
                const randomSource = Phaser.Utils.Array.GetRandom(currentFloor);
                randomSource.connectsTo.push(nextNode.id);
            }
        });
    }

    return {
        floors,
        entryNodeIds: floors[0].map(n => n.id)
    };
}