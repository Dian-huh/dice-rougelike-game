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
    initNewGame(characterId) {
        if (!characterId) {
            console.error('⚠️ initNewGame 需要指定 characterId，未提供則無法建立新遊戲');
            return;
        }

        const charData = getCharacterData(characterId);
        const charDeck = getCharacterDeck(characterId);
        if (!charData || !charDeck) {
            console.error(`⚠️ 找不到角色資料 id=${characterId}`);
            return;
        }

        this.hero = JSON.parse(JSON.stringify(charData));
        this._restoreFunctionFields(this.hero, charData);   // 🟢 取代原本只救 diceSkills 那行
        this.deckSys = new DeckSystem(charDeck);
        this.mapData = generateProceduralMap(5);
        this.currentFloor = 1;
        SaveSystem.clearSave();
        console.log(`🎮 全域存檔初始化成功！(角色: ${characterId})`);
    },

    // 🟢 新增：清空當前狀態，回到「尚未選角」狀態，交給 MapScene 顯示選角UI
    // 用途：重新開始遊戲（死亡/通關後），跟第一次進遊戲走同一套選角流程
    resetToCharacterSelect() {
        this.hero = null;
        this.deckSys = null;
        this.mapData = null;
        this.currentFloor = 1;
        SaveSystem.clearSave();
    },

    tryLoadSave() {
        const saved = SaveSystem.load();
        if (!saved) return false;

        const characterId = saved.hero.id;
        const charData = getCharacterData(characterId);
        if (!charData) {
            console.warn(`⚠️ 存檔角色 id=${characterId} 已不存在於角色登記表，無法還原`);
            return false;
        }

        this.hero = JSON.parse(JSON.stringify(charData));
        this._restoreFunctionFields(this.hero, charData);   // 🟢 同上
        Object.assign(this.hero, saved.hero);

        this.deckSys = new DeckSystem(saved.deck.length > 0 ? saved.deck : getCharacterDeck(characterId));
        this.mapData = saved.mapData;
        this.currentFloor = saved.currentFloor;

        console.log(`💾 存檔讀取成功！(角色: ${characterId})`);
        return true;
    },

    // 🟢 新增：遞迴走訪 charData，把任何找到的 function（含 diceSkills[n].execute 這種巢狀函式）
    // 補回 hero 對應路徑。未來角色新增任何專屬方法(useActiveSkill/onDodgeSuccess/...)都不用再回來改這裡
    _restoreFunctionFields(target, source) {
        Object.keys(source).forEach(key => {
            const val = source[key];
            if (typeof val === 'function') {
                target[key] = val;
            } else if (val && typeof val === 'object' && !Array.isArray(val)) {
                if (!target[key]) target[key] = {};
                this._restoreFunctionFields(target[key], val);
            }
        });
    },

    nextFloor() {
        this.currentFloor += 1;
        SaveSystem.save(this);
        console.log(`🗺️ 全域樓層推進至第 ${this.currentFloor} 層`);
    }
};