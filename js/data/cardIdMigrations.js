// js/data/cardIdMigrations.js
//
// 卡片 id 更名對照表。分兩張表：
// - REWARD_CARD_ID_MIGRATIONS：REWARD_CARD_POOL 是跨角色共用的獎池，只需要一張全域表
// - STARTER_CARD_ID_MIGRATIONS：起始牌組依角色各自獨立，不同角色可能各自用到重複的 id
//   （例如兩個角色都有一張 id 叫 1 的卡），所以依 characterId 分開登記，避免互相干擾
//
// 支援連鎖改名（A -> B -> C 會自動追蹤到最終有效的 id），
// 保留完整改名歷史即可，不需要手動整理成單一對應。

export const REWARD_CARD_ID_MIGRATIONS = {
    // 'old_reward_card_id': 'new_reward_card_id',
};

export const STARTER_CARD_ID_MIGRATIONS = {
    hero: {
        // 'old_id': 'new_id',
    },
    // mage: {
    //     'old_id': 'new_id',
    // },
};