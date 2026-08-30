import { gameState } from '../data/gameState.js';
import { createEnemyInstance, ENEMY_DATABASE } from '../data/enemyData.js';
import { getCharacterData, getCharacterDeck, getAllCharacterIds } from '../characters/characterRegistry.js';
import { DeckSystem } from './DeckSystem.js';

export const DebugSystem = {
    _game: null,
    init(game) { this._game = game; },

    listEnemies() {
        console.log('可用敵人 id：', Object.keys(ENEMY_DATABASE).concat(['black_dragon']));
    },

    listCharacters() {
        console.log('可用角色 id：', getAllCharacterIds());
    },

    /**
     * 啟動測試戰鬥
     * @param {object} opts
     *   characterId: 'hero' | 'swordsman'（預設 'hero'）
     *   enemies: ['goblin','goblin_shaman', ...]（預設 ['goblin']）
     *   hp / maxHp / mana / maxMana / atk / critBonus / speedBonus / atkCount / armorMax / deckCapacity / gold
     *     -> 全部可選，不填就用角色預設值
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

        this._game.scene.start('BattleScene', {
            hero,
            deckSys,
            node: { type: 'BATTLE' },
            __debugOverride: { enemies }
        });

        console.log(`🧪 測試關卡啟動：角色[${characterId}] 敵人[${enemyIds.join(', ')}]`, hero);
    }
};