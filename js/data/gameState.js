// js/data/gameState.js
import { generateProceduralMap } from './mapData.js';
import { getCharacterData, getCharacterDeck } from '../characters/characterRegistry.js';
import { getRegionData, getAllRegionIds, generateRegionGraph } from './regionRegistry.js';
import { DeckSystem } from '../systems/DeckSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';

export const gameState = {
    hero: null,
    deckSys: null,
    mapData: null,
    currentFloor: 1,

    // 🟢 階段5新增：區域制狀態。與上面 mapData/currentFloor 暫時並存，
    // 切換到「以此為準」的時機點在 Step4(MapScene渲染改造)，屆時舊欄位會逐步棄用
    regionsPerRun: 3,
    regionsCompleted: 0,
    currentRegionId: null,
    currentRegionGraph: null,   // { floors, entryNodeIds }
    currentNodeId: null,        // null = 尚未踏入，站在區域入口
    currentRegionIsFinal: false,// 本次所在區域是否為本輪壓軸（決定最終層出 regionBoss 還是 eliteEnemy）
    pendingRegionChoices: null, // 區域選擇畫面用的候選清單

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
        this.regionsCompleted = 0;
        this.currentRegionId = null;
        this.currentRegionGraph = null;
        this.currentNodeId = null;
        this.currentRegionIsFinal = false;
        this.pendingRegionChoices = null;
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
        this.regionsCompleted = 0;
        this.currentRegionId = null;
        this.currentRegionGraph = null;
        this.currentNodeId = null;
        this.currentRegionIsFinal = false;
        this.pendingRegionChoices = null;
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

        // 🟢 階段5新增：還原區域制狀態
        this.regionsCompleted = saved.regionsCompleted;
        this.currentRegionId = saved.currentRegionId;
        this.currentRegionGraph = saved.currentRegionGraph;
        this.currentNodeId = saved.currentNodeId;
        this.currentRegionIsFinal = saved.currentRegionIsFinal;
        this.pendingRegionChoices = null;   // 🟢 候選清單不存檔，讀檔時一律視為「尚未產生候選」

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

        // ============================================================
    // 🟢 階段5新增：區域制 Run 層級規則
    // ============================================================

    // 隨機抽 2~3 個候選區域，允許重複主題（規格明確表示不額外限制機率）
    generateRegionChoices() {
        const allIds = getAllRegionIds();
        const count = Math.min(allIds.length, Phaser.Math.Between(2, 3));
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(Phaser.Utils.Array.GetRandom(allIds));
        }
        this.pendingRegionChoices = result;
        return result;
    },

    // 判斷「如果玩家現在選一個區域進入，這會不會是本輪最後一個區域」
    // 必須在 regionsCompleted 尚未因這次選擇而遞增前呼叫
    isFinalRegionSelection() {
        return this.regionsCompleted === this.regionsPerRun - 1;
    },

    // 玩家從候選清單中選定一個區域，正式生成節點圖並進入
    chooseRegion(regionId) {
        const regionDef = getRegionData(regionId);
        if (!regionDef) {
            console.error(`⚠️ 找不到區域資料 id=${regionId}`);
            return;
        }

        this.currentRegionIsFinal = this.isFinalRegionSelection();   // 🟢 鎖存判定結果，供 Step6 stageData banking 查詢
        this.currentRegionId = regionId;
        this.currentRegionGraph = generateRegionGraph(regionDef);
        this.currentNodeId = null;
        this.pendingRegionChoices = null;

        SaveSystem.save(this);
        console.log(`🗺️ 進入區域【${regionDef.name}】${this.currentRegionIsFinal ? '(本輪壓軸！)' : ''}`);
    },

        // ============================================================
    // 🟢 節點結算後的統一入口：供 MapScene(REST/EVENT) 與 BattleScene(BATTLE/BATTLE_FINAL) 共用，
    // 取代舊的 nextFloor()（nextFloor() 本身保留不刪，作為舊系統相容路徑）
    // ============================================================
    advanceAfterNode(node) {
        if (!node) {
            console.error('⚠️ advanceAfterNode 缺少 node 參數');
            return { runComplete: false, choices: null };
        }

        if (node.type === 'BATTLE_FINAL') {
            return this.completeCurrentRegion();
        }

        this.currentNodeId = node.id;
        SaveSystem.save(this);
        return { runComplete: false, choices: null };
    },

    // 玩家走完當前區域最終層節點後呼叫
    // 回傳 { runComplete: true } 代表整輪遊戲通關；否則回傳下一批候選區域
    completeCurrentRegion() {
        this.regionsCompleted += 1;

        if (this.regionsCompleted >= this.regionsPerRun) {
            return { runComplete: true };
        }

        // 🔧 修正：清空已完成的區域狀態，否則 MapScene.enterRegionFlow()
        // 會因為 currentRegionGraph 仍非 null 而繼續渲染舊地圖，跳不出選擇畫面
        this.currentRegionId = null;
        this.currentRegionGraph = null;
        this.currentNodeId = null;
        this.currentRegionIsFinal = false;

        const choices = this.generateRegionChoices();
        SaveSystem.save(this);
        return { runComplete: false, choices };
    },

    nextFloor() {
        this.currentFloor += 1;
        SaveSystem.save(this);
        console.log(`🗺️ 全域樓層推進至第 ${this.currentFloor} 層`);
    }
};