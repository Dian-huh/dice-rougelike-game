import { gameState } from '../data/gameState.js';
import { createEnemyInstance, ENEMY_DATABASE } from '../data/enemyData.js';
import { getCharacterData, getCharacterDeck, getAllCharacterIds } from '../characters/characterRegistry.js';
import { DeckSystem } from './DeckSystem.js';
import { REWARD_CARD_POOL } from '../data/rewardPoolData.js';

export const DebugSystem = {
    _game: null,
    init(game) { this._game = game; },

    listEnemies() {
        console.log('可用敵人 id：', Object.keys(ENEMY_DATABASE).concat(['black_dragon']));
    },

    listCharacters() {
        console.log('可用角色 id：', getAllCharacterIds());
    },

    // 🟢 新增：查詢可用卡片（含起始牌組+獎池，因為 REWARD_CARD_POOL 已涵蓋所有帶 theme 的角色卡）
    listCards() {
        console.table(REWARD_CARD_POOL.map(c => ({
            id: c.id, name: c.name, theme: c.theme || '(base)', cost: c.cost, implemented: c.implemented !== false
        })));
    },

    /**
     * 啟動測試戰鬥
     */
    startTestBattle(opts = {}) {
        if (!this._game) { console.error('⚠️ DebugSystem 尚未初始化'); return; }

        const characterId = opts.characterId || 'hero';
        const enemyIds = opts.enemies && opts.enemies.length > 0 ? opts.enemies : ['goblin'];

        const charData = getCharacterData(characterId);
        const charDeck = getCharacterDeck(characterId);
        if (!charData || !charDeck) {
            console.error(`⚠️ 找不到角色 id=${characterId}，可用角色:`, getAllCharacterIds());
            return;
        }

        const hero = JSON.parse(JSON.stringify(charData));
        gameState._restoreFunctionFields(hero, charData);

        if (opts.maxHp != null) hero.maxHp = opts.maxHp;
        hero.hp = opts.hp != null ? opts.hp : hero.maxHp;
        if (opts.maxMana != null) hero.maxMana = opts.maxMana;
        if (opts.mana != null) hero.mana = opts.mana;
        if (opts.atk != null) hero.atk = opts.atk;
        if (opts.critBonus != null) hero.critBonus = opts.critBonus;
        if (opts.speedBonus != null) hero.speedBonus = opts.speedBonus;
        if (opts.atkCount != null) hero.atkCount = opts.atkCount;
        if (opts.armorMax != null) hero.armorMax = opts.armorMax;
        if (opts.deckCapacity != null) hero.deckCapacity = opts.deckCapacity;
        if (opts.gold != null) hero.gold = opts.gold;

        const deckSys = new DeckSystem(charDeck);

        const enemies = enemyIds
            .map(id => {
                const inst = createEnemyInstance(id);
                if (!inst) console.warn(`⚠️ 找不到敵人 id=${id}，已略過`);
                return inst;
            })
            .filter(Boolean);

        if (enemies.length === 0) {
            console.error('⚠️ 沒有任何有效敵人，測試關卡取消');
            return;
        }

        gameState.hero = hero;
        gameState.deckSys = deckSys;
        if (!gameState.mapData) {
            gameState.mapData = [[{ id: 'debug_node', floor: 1, type: 'BATTLE', difficulty: 1, visited: true }]];
            gameState.currentFloor = 1;
        }

        // 🟢 修正：game.scene.start() 不會自動停掉其他場景，
        // 需要明確 stop 掉 MapScene / 舊的 BattleScene，避免底下畫面殘留、按鈕仍可互動
        ['MapScene', 'BattleScene'].forEach(key => {
            const sc = this._game.scene.getScene(key);
            if (sc && sc.scene.isActive()) {
                this._game.scene.stop(key);
            }
        });

        this._game.scene.start('BattleScene', {
            hero,
            deckSys,
            node: { type: 'BATTLE' },
            __debugOverride: { enemies }
        });

        console.log(`🧪 測試關卡啟動：角色[${characterId}] 敵人[${enemyIds.join(', ')}]`, hero);
    },

    // 🟢 新增：獲得指定卡片，用來測試新卡效果
    // opts.count：張數（預設1）
    giveCard(cardId, opts = {}) {
        const cardDef = REWARD_CARD_POOL.find(c => c.id === cardId);
        if (!cardDef) {
            console.error(`⚠️ 找不到卡片 id=${cardId}，可用 DEBUG.listCards() 查詢`);
            return;
        }

        const count = opts.count || 1;
        const battleScene = this._game.scene.getScene('BattleScene');
        const isBattleRunning = battleScene && battleScene.scene.isActive();
        const targetDeckSys = isBattleRunning ? battleScene.deckSys : gameState.deckSys;

        if (!targetDeckSys) {
            console.error('⚠️ 目前沒有可用的牌組（未在戰鬥中，也沒有 gameState.deckSys），請先 DEBUG.startTestBattle(...)');
            return;
        }

        for (let i = 0; i < count; i++) {
            const newCard = {
                id: `reward_${cardDef.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: cardDef.name,
                cost: cardDef.cost,
                getCost: cardDef.getCost,
                tags: cardDef.tags || [],
                desc: cardDef.desc,
                scope: cardDef.scope,
                onPlay: cardDef.onPlay,
                __source: 'reward',
                __defId: cardDef.id
            };
            targetDeckSys.originalDeck.push(newCard);
            if (isBattleRunning) {
                targetDeckSys.hand.push(newCard); // 🟢 戰鬥中直接塞進手牌，立刻可打
            }
        }

        if (isBattleRunning) {
            battleScene.renderHandUI();
            battleScene.updateUI();
        }

        console.log(`🧪 已獲得卡片 [${cardDef.name}] x${count}${isBattleRunning ? '（已直接放入手牌）' : '（已加入牌組收藏，下次抽牌可能抽到）'}`);
    }
};