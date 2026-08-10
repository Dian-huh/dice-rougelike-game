import { HERO_DATA } from '../characters/hero/heroData.js';
import { HERO_DECK } from '../characters/hero/heroCards.js';
import { DeckSystem } from './DeckSystem.js';
import { getStageData } from '../data/stageData.js';
import { EffectEngine } from './EffectEngine.js';   // 新增

export class BattleSetup {
    static resolve(data, gameState) {
        const currentFloor = (gameState && gameState.currentFloor) ? gameState.currentFloor : 1;
        const currentStageId = `1-${currentFloor}`;
        const nodeType = (data && data.node && data.node.type) ? data.node.type : 'BATTLE';
        const totalFloors = (gameState && gameState.mapData) ? gameState.mapData.length : 5;
        const isFinalBoss = (nodeType === 'BOSS' && currentFloor === totalFloors);

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

        // 🟢 取代：原本 hero.limitedEnemyBattlesRemaining 的直接判斷，
        //    改成呼叫 onStageQuery，由 ctx.limitedToOne 帶回決定結果
        const queryCtx = { nodeType, limitedToOne: false };
        EffectEngine.runHook('onStageQuery', hero, queryCtx);

        const stageInfo = getStageData ? getStageData(currentStageId, nodeType, { limitedToOne: queryCtx.limitedToOne }) : null;
        const currentStage = stageInfo || { name: '冒險關卡', enemies: [] };
        const enemies = currentStage.enemies || [];

        // 🟢 取代：原本 hero.nextBattleEnemyHpHalved 的直接判斷，
        //    改成呼叫 onEnemiesGenerated，效果內部會自行檢查 nodeType 與消耗充能
        EffectEngine.runHook('onEnemiesGenerated', hero, { nodeType, enemies });

        return { hero, deckSys, currentStage, enemies, isFinalBoss };
    }
}