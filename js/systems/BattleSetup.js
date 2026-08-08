import { HERO_DATA } from '../characters/hero/heroData.js';
import { HERO_DECK } from '../characters/hero/heroCards.js';
import { DeckSystem } from './DeckSystem.js';
import { getStageData } from '../data/stageData.js';

export class BattleSetup {
    static resolve(data, gameState) {
        const currentFloor = (gameState && gameState.currentFloor) ? gameState.currentFloor : 1;
        const currentStageId = `1-${currentFloor}`;
        const nodeType = (data && data.node && data.node.type) ? data.node.type : 'BATTLE';
        const totalFloors = (gameState && gameState.mapData) ? gameState.mapData.length : 5;
        const isFinalBoss = (nodeType === 'BOSS' && currentFloor === totalFloors);

        const stageInfo = getStageData ? getStageData(currentStageId, nodeType) : null;
        const currentStage = stageInfo || { name: '冒險關卡', enemies: [] };
        const enemies = currentStage.enemies || [];

        let hero, deckSys;
        if (data && data.hero) {
            hero = data.hero;
            deckSys = data.deckSys;
        } else if (gameState && gameState.hero) {
            hero = gameState.hero;
            deckSys = gameState.deckSys;
        } else {
            hero = JSON.parse(JSON.stringify(HERO_DATA));
            hero.diceSkills = HERO_DATA.diceSkills;
            deckSys = new DeckSystem(HERO_DECK);
        }

        return { hero, deckSys, currentStage, enemies, isFinalBoss };
    }
}