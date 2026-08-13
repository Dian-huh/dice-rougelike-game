// js/data/gameState.js
import { generateProceduralMap } from './mapData.js';
import { getCharacterData, getCharacterDeck } from '../characters/characterRegistry.js';
import { DeckSystem } from '../systems/DeckSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';

export const gameState = {
    hero: null,
    deckSys: null,
    mapData: null,
    currentFloor: 1,

    // 🟢 新增 characterId 參數，預設 'hero' 保持向下相容（現有呼叫端不用馬上全部改）
    initNewGame(characterId = 'hero') {
        const charData = getCharacterData(characterId);
        const charDeck = getCharacterDeck(characterId);

        if (!charData || !charDeck) {
            console.error(`⚠️ 找不到角色資料 id=${characterId}，改用預設角色 'hero'`);
            return this.initNewGame('hero');
        }

        this.hero = JSON.parse(JSON.stringify(charData));
        this.hero.diceSkills = charData.diceSkills;
        this.deckSys = new DeckSystem(charDeck);
        this.mapData = generateProceduralMap(5);
        this.currentFloor = 1;
        SaveSystem.clearSave();
        console.log(`🎮 全域存檔初始化成功！(角色: ${characterId})`);
    },

    // 讀取存檔並還原狀態，成功回傳 true，無存檔/存檔失效回傳 false
    tryLoadSave() {
        const saved = SaveSystem.load();
        if (!saved) return false;

        const characterId = saved.hero.id;
        const charData = getCharacterData(characterId);

        if (!charData) {
            console.warn(`⚠️ 存檔角色 id=${characterId} 已不存在於角色登記表，無法還原`);
            return false;
        }

        this.hero = JSON.parse(JSON.stringify(charData)); // 先建立完整預設結構（含未存檔的 diceSkills 等欄位）
        Object.assign(this.hero, saved.hero);               // 再覆蓋回存檔中的永久欄位
        this.hero.diceSkills = charData.diceSkills;

        this.deckSys = new DeckSystem(saved.deck.length > 0 ? saved.deck : getCharacterDeck(characterId));
        this.mapData = saved.mapData;
        this.currentFloor = saved.currentFloor;

        console.log(`💾 存檔讀取成功！(角色: ${characterId})`);
        return true;
    },

    nextFloor() {
        this.currentFloor += 1;
        SaveSystem.save(this);
        console.log(`🗺️ 全域樓層推進至第 ${this.currentFloor} 層`);
    }
};