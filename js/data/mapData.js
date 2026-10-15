// 地圖節點類型定義
export const NODE_TYPES = {
    BATTLE: {
        id: 'BATTLE', name: '⚔️ 一般戰鬥', color: '#ff6666',
        onEnter: (scene, node) => scene.scene.start('BattleScene', { node })
    },
    EVENT: {
        id: 'EVENT', name: '❓ 隨機事件', color: '#ffff66',
        onEnter: (scene, node) => scene.showEventUI(node)
    },
    REST: {
        id: 'REST', name: '🔥 營火休息', color: '#66ff66',
        onEnter: (scene, node, gameState) => scene.openRestArea(node, gameState)
    },
    // 區域最終層固定使用的節點類型；出現菁英還是壓軸首領由 stageData 依 isFinalOfRun 決定
    BATTLE_FINAL: {
        id: 'BATTLE_FINAL', name: '👑 區域最終戰', color: '#ff00ff',
        onEnter: (scene, node) => scene.scene.start('BattleScene', { node })
    }
};