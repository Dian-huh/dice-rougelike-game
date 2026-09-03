// js/systems/SaveSystem.js
import { getCharacterDeck } from '../characters/characterRegistry.js';
import { REWARD_CARD_POOL } from '../data/rewardPoolData.js';
import { REWARD_CARD_ID_MIGRATIONS, STARTER_CARD_ID_MIGRATIONS } from '../data/cardIdMigrations.js';
import { DeckSystem } from './DeckSystem.js';

const SAVE_KEY = 'dice_roguelike_save_v1';
const SCHEMA_VERSION = 1;

// 🟢 白名單：只有這些欄位屬於「永久」性質，才會被存進存檔
// （對應 heroData.js 欄位生命週期稽核結果，'id' 同時也用來識別存檔屬於哪個角色）
const HERO_PERMANENT_FIELDS = [
    'id', 'name', 'atk', 'critBonus', 'maxHp', 'hp', 'maxMana', 'healRatio',
    'speedBonus', 'atkCount', 'armorMax', 'gold', 'deckCapacity', 'startBlock',
    'goldGainBonus', 'rewardCounts', 'firstCardFreeEachBattle', 'activeEffects'
];

export const SaveSystem = {
    hasSave() {
        return localStorage.getItem(SAVE_KEY) !== null;
    },

    save(gameState) {
        try {
            const hero = gameState.hero;
            const heroSnapshot = {};
            HERO_PERMANENT_FIELDS.forEach(field => {
                heroSnapshot[field] = hero[field];
            });

            const payload = {
                schemaVersion: SCHEMA_VERSION,
                hero: heroSnapshot,
                deck: this._serializeDeck(gameState.deckSys),
                mapData: gameState.mapData,
                currentFloor: gameState.currentFloor
            };

            localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        } catch (err) {
            console.error('⚠️ 存檔失敗：', err);
        }
    },

    load() {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;

        let payload;
        try {
            payload = JSON.parse(raw);
        } catch (err) {
            console.error('⚠️ 存檔資料損毀，無法解析：', err);
            return null;
        }

        if (payload.schemaVersion !== SCHEMA_VERSION) {
            console.warn(`⚠️ 存檔版本不相容 (存檔:${payload.schemaVersion} / 目前:${SCHEMA_VERSION})，捨棄舊存檔`);
            return null;
        }

        // 🟢 hero.id 同時是「這份存檔屬於哪個角色」的依據，用來查對應的起始牌組
        const characterId = payload.hero ? payload.hero.id : null;
        const deck = this._deserializeDeck(payload.deck, characterId);
        if (deck.length === 0) {
            console.warn('⚠️ 存檔牌組還原後為空，可能所有卡片來源皆已失效');
        }

        return {
            hero: payload.hero,
            deck,
            mapData: payload.mapData,
            currentFloor: payload.currentFloor
        };
    },

    clearSave() {
        localStorage.removeItem(SAVE_KEY);
    },

    // ------------------------------------------------------------
    // 牌組序列化：只存「來源引用」，不存卡片本體
    // （onPlay/getCost 等函式無法被 JSON.stringify 序列化）
    // ------------------------------------------------------------
    _serializeDeck(deckSys) {
        return deckSys.originalDeck.map(card => {
            if (card.__source === 'reward') {
                return { source: 'reward', defId: card.__defId };
            }
            return { source: 'starter', id: card.id };
        });
    },

    // 還原牌組：依 source 回查表重建完整卡片物件（含函式）
    // 查無對應卡片時：先查各自的遷移表，仍查不到就跳過該卡並警告，不讓整個讀檔失敗
    _deserializeDeck(deckRefs, characterId) {
        if (!Array.isArray(deckRefs)) return [];

        const starterDeck = getCharacterDeck(characterId) || [];
        const starterMigrations = STARTER_CARD_ID_MIGRATIONS[characterId] || {};

        const result = [];
        deckRefs.forEach(ref => {
            if (ref.source === 'starter') {
                const resolvedId = this._resolveId(ref.id, starterMigrations);
                const found = starterDeck.find(c => c.id === resolvedId);
                if (found) {
                    result.push(found);
                } else {
                    console.warn(`⚠️ [存檔還原] 角色[${characterId}] 找不到起始卡片 id=${ref.id}，已略過`);
                }
                return;
            }

            if (ref.source === 'reward') {
                const resolvedId = this._resolveId(ref.defId, REWARD_CARD_ID_MIGRATIONS);
                const cardDef = REWARD_CARD_POOL.find(c => c.id === resolvedId);

                if (!cardDef) {
                    console.warn(`⚠️ [存檔還原] 找不到獎勵卡片 defId=${ref.defId}（已查過遷移表），已略過此卡`);
                    return;
                }

                result.push(DeckSystem.instantiateCardDef(cardDef));
            }
        });

        return result;
    },

    // 依遷移表把「舊id」追蹤到目前有效的 id；支援連鎖改名，並防呆避免循環參照
    _resolveId(id, migrationTable) {
        let currentId = id;
        const visited = new Set();
        while (migrationTable[currentId] && !visited.has(currentId)) {
            visited.add(currentId);
            currentId = migrationTable[currentId];
        }
        return currentId;
    }
};