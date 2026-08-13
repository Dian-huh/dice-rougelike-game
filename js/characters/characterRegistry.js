// js/characters/characterRegistry.js
//
// 🟢 角色登記表：統一管理「有哪些角色」以及「各角色的資料/起始牌組在哪裡」
// 之後新增角色時，只需要在對應資料夾建立 xxxData.js / xxxCards.js，
// 並在這裡註冊一行，不需要動 gameState.js 或 SaveSystem.js 的邏輯

import { HERO_DATA } from './hero/heroData.js';
import { HERO_DECK } from './hero/heroCards.js';
// import { MAGE_DATA } from './mage/mageData.js';
// import { MAGE_DECK } from './mage/mageCards.js';

export const CHARACTER_REGISTRY = {
    hero: { data: HERO_DATA, deck: HERO_DECK },
    // mage: { data: MAGE_DATA, deck: MAGE_DECK },
};

export function getCharacterData(characterId) {
    const entry = CHARACTER_REGISTRY[characterId];
    return entry ? entry.data : null;
}

export function getCharacterDeck(characterId) {
    const entry = CHARACTER_REGISTRY[characterId];
    return entry ? entry.deck : null;
}

export function getAllCharacterIds() {
    return Object.keys(CHARACTER_REGISTRY);
}