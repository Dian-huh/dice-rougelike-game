// 地圖節點類型定義
export const NODE_TYPES = {
    BATTLE: { id: 'BATTLE', name: '⚔️ 一般戰鬥', color: '#ff6666' },
    EVENT:  { id: 'EVENT',  name: '❓ 隨機事件', color: '#ffff66' },
    REST:   { id: 'REST',   name: '🔥 營火休息', color: '#66ff66' },
    BOSS:   { id: 'BOSS',   name: '👹 頭目戰',   color: '#ff0000' }
};

/**
 * 隨機生成包含多個樓層地圖結構的函式
 * @param {number} totalFloors 總樓層數 (例如 5)
 */
export function generateProceduralMap(totalFloors = 5) {
    const mapNodes = [];

    for (let floor = 1; floor <= totalFloors; floor++) {
        const floorNodes = [];

        // 最後一層固定為 BOSS 房
        if (floor === totalFloors) {
            floorNodes.push({
                id: `node_${floor}_1`,
                floor: floor,
                type: NODE_TYPES.BOSS.id,
                difficulty: floor,
                visited: false
            });
        } 
        // 第一層固定為一般戰鬥，讓玩家暖身
        else if (floor === 1) {
            floorNodes.push({
                id: `node_${floor}_1`,
                floor: floor,
                type: NODE_TYPES.BATTLE.id,
                difficulty: 1,
                visited: false
            });
        } 
        // 中間樓層：隨機生成 2~3 個分叉節點
        else {
            const nodeCount = Phaser.Math.Between(2, 3);
            const pool = [NODE_TYPES.BATTLE.id, NODE_TYPES.BATTLE.id, NODE_TYPES.EVENT.id, NODE_TYPES.REST.id];

            for (let i = 0; i < nodeCount; i++) {
                const randomType = Phaser.Utils.Array.GetRandom(pool);
                floorNodes.push({
                    id: `node_${floor}_${i + 1}`,
                    floor: floor,
                    type: randomType,
                    difficulty: floor,
                    visited: false
                });
            }
        }

        mapNodes.push(floorNodes);
    }

    return mapNodes;
}