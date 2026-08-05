// js/data/gameState.js
import { generateProceduralMap } from './mapData.js';
import { HERO_DATA } from '../characters/hero/heroData.js';
import { HERO_DECK } from '../characters/hero/heroCards.js';
import { DeckSystem } from '../systems/DeckSystem.js';

export const gameState = {
    hero: null,
    deckSys: null,
    mapData: null,
    currentFloor: 1,

    initNewGame() {
        this.hero = JSON.parse(JSON.stringify(HERO_DATA));
        this.hero.diceSkills = HERO_DATA.diceSkills;
        this.deckSys = new DeckSystem(HERO_DECK);
        this.mapData = generateProceduralMap(5);
        this.currentFloor = 1;
        console.log("🎮 全域存檔初始化成功！");
    },

    nextFloor() {
        this.currentFloor += 1;
        console.log(`🗺️ 全域樓層推進至第 ${this.currentFloor} 層`);
    }
};