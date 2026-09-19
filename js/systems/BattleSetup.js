import { getCharacterData, getCharacterDeck } from '../characters/characterRegistry.js';
import { DeckSystem } from './DeckSystem.js';
import { getStageData } from '../data/stageData.js';
import { EffectEngine } from './EffectEngine.js';
import { CombatSystem } from './CombatSystem.js';

export class BattleSetup {
    static resolve(data, gameState) {

        // 🟢 測試關卡：完全跳過樓層/地圖判斷，敵人直接用 debug 指定的清單
        if (data && data.__debugOverride) {
            const hero = data.hero;
            const deckSys = data.deckSys;
            CombatSystem.setActiveHero(hero);
            return {
                hero,
                deckSys,
                currentStage: { name: '🧪 測試關卡', enemies: data.__debugOverride.enemies, rewardConfig: { baseGold: 0 } },
                enemies: data.__debugOverride.enemies,
                isFinalBoss: false
            };
        }

        const node = (data && data.node) ? data.node : { type: 'BATTLE', difficulty: 1 };
        const nodeType = node.type || 'BATTLE';

        // 🟢 階段5：區域制最終戰判定
        const regionId = gameState && gameState.currentRegionId;
        const isFinalOfRun = !!(gameState && gameState.currentRegionIsFinal);
        const isRegionFinalBoss = (nodeType === 'BATTLE_FINAL' && isFinalOfRun);

        // 🟢 舊系統相容：mapData.js 固定5層，最後一層BOSS才算全破
        const legacyTotalFloors = (gameState && gameState.mapData) ? gameState.mapData.length : 5;
        const legacyCurrentFloor = (gameState && gameState.currentFloor) ? gameState.currentFloor : 1;
        const isLegacyFinalBoss = (nodeType === 'BOSS' && legacyCurrentFloor === legacyTotalFloors);

        const isFinalBoss = isRegionFinalBoss || isLegacyFinalBoss;

        let hero, deckSys;
        if (data && data.hero) {
            hero = data.hero;
            deckSys = data.deckSys;
        } else if (gameState && gameState.hero) {
            hero = gameState.hero;
            deckSys = gameState.deckSys;
        } else {
            const charData = getCharacterData('hero');   // 防呆 fallback，理論上不會走到這裡
            hero = JSON.parse(JSON.stringify(charData));
            gameState._restoreFunctionFields(hero, charData);   // 🟢 統一走跟 initNewGame/tryLoadSave 一致的函式還原邏輯
            deckSys = new DeckSystem(getCharacterDeck('hero'));
        }

        // 🟢 取代：原本 hero.limitedEnemyBattlesRemaining 的直接判斷，
        //    改成呼叫 onStageQuery，由 ctx.limitedToOne 帶回決定結果
        const queryCtx = { nodeType, limitedToOne: false };
        EffectEngine.runHook('onStageQuery', hero, queryCtx);

                // 🟢 敵人成長等級：區域制下依已完成區域數；無區域上下文（舊系統/debug）維持 0
        const scaleTier = regionId ? (gameState.regionsCompleted || 0) : 0;
        const stageInfo = getStageData(node, { regionId, isFinalOfRun, limitedToOne: queryCtx.limitedToOne, scaleTier });
        const currentStage = stageInfo || { name: '冒險關卡', enemies: [] };
        const enemies = currentStage.enemies || [];

        // 🟢 取代：原本 hero.nextBattleEnemyHpHalved 的直接判斷，
        //    改成呼叫 onEnemiesGenerated，效果內部會自行檢查 nodeType 與消耗充能
        EffectEngine.runHook('onEnemiesGenerated', hero, { nodeType, enemies });

        CombatSystem.setActiveHero(hero);   // 🟢 懸賞機制：登記本場戰鬥的 hero 參照
        
        return { hero, deckSys, currentStage, enemies, isFinalBoss };
    }
}