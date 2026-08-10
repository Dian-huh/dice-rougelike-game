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

        // 🟢 hero/deckSys 解析提前，因為下面要讀 hero 身上的速通旗標
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

        const isLimitedBattle = nodeType === 'BATTLE' && (hero.limitedEnemyBattlesRemaining || 0) > 0;
        const stageInfo = getStageData ? getStageData(currentStageId, nodeType, { limitedToOne: isLimitedBattle }) : null;
        const currentStage = stageInfo || { name: '冒險關卡', enemies: [] };
        const enemies = currentStage.enemies || [];

        // 🟢 消耗「各個擊破」次數（只在一般戰鬥消耗，Boss戰不消耗）
        if (nodeType === 'BATTLE' && (hero.limitedEnemyBattlesRemaining || 0) > 0) {
            hero.limitedEnemyBattlesRemaining -= 1;
        }

        // 🟢 消耗「敵陣削弱」一次性效果（下次一般戰鬥敵人血量減半）
        if (nodeType === 'BATTLE' && hero.nextBattleEnemyHpHalved) {
            enemies.forEach(e => {
                e.maxHp = Math.max(1, Math.floor(e.maxHp / 2));
                e.hp = e.maxHp;
            });
            hero.nextBattleEnemyHpHalved = false;
        }

        return { hero, deckSys, currentStage, enemies, isFinalBoss };
    }
}