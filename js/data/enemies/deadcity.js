import { BASE_ENEMY } from './baseEnemy.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { ENEMY_TEMPLATE } from '../enemyTemplate.js';

export const DEADCITY_ENEMIES = {
    'undead': Object.assign(Object.create(BASE_ENEMY), {
        id: 'undead',
        faction: 'deadcity',
        name: '💀 亡靈',
        maxHp: 4, hp: 4, atk: 4, critBonus: 4, critChance: 0.15,
        ct: 0, maxCt: 4, od: 0, maxOd: 4, speedBonus: 4, speedDiceSides: 4,
        onDeathCurse: 1,
        damageImmuneChance: 0.6,
        damageImmuneExceptTags: ['聖痕'],

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }
            if (this.ct >= this.maxCt) {
                return { id: 'SUMMON', type: 'SPECIAL', summonIds: ['undead', 'ghost_small'], consumeCt: this.maxCt, desc: '👻 亡靈聚集 (消耗全部CT，召喚一個亡靈與小亡靈)' };
            }
            const pool = [
                this.basicAttack(),
                { id: 'SPIRIT_STRIKE', type: 'SPECIAL', value: this.atk, desc: `💀 死靈衝擊 (單體破防並造成 ${this.atk} 點傷害)`,
                  effects: ['breakArmor', 'damage'],
                  breakArmorMsg: (c) => `💀 ${c.attacker.name} 發動【死靈衝擊】！${c.target.name} 護甲值歸零並進入【破防】狀態！` 
                }
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'SUMMON', type: 'SPECIAL', summonIds: ['ghost_small'], consumeCt: 1, desc: '👻 分靈體 (消耗1CT，召喚一個小亡靈)' });
            }
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'ghost_small': Object.assign(Object.create(BASE_ENEMY), {
        id: 'ghost_small',
        faction: 'deadcity',
        name: '👻 小亡靈',
        maxHp: 2, hp: 2, atk: 2, critBonus: 2, critChance: 0.15,
        ct: 0, maxCt: 2, od: 0, maxOd: 2, speedBonus: 2, speedDiceSides: 4,
        onDeathCurse: 1,
        damageImmuneChance: 0.6,
        damageImmuneExceptTags: ['聖痕'],

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }
            if (this.ct >= this.maxCt) {
                return { id: 'SPIRIT_BOMB', type: 'SPECIAL', consumeCt: this.maxCt, desc: '💥 靈體炸彈 (消耗全部CT，自己死亡並對玩家造成爆擊傷害)' };
            }
            const pool = [
                this.basicAttack(),
                { id: 'SPIRIT_STRIKE_MULTI', type: 'ATTACK', value: this.atk, hits: 2, canCrit: true, desc: `💀 死靈衝擊 (造成 2 次 ${this.atk} 點傷害)` }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'wraith': Object.assign(Object.create(BASE_ENEMY), {
        id: 'wraith',
        name: '👤 怨靈',
        faction: 'deadcity',
        maxHp: 44, hp: 44, atk: 4, critBonus: 4, critChance: 0.15,
        ct: 0, maxCt: 4, od: 0, maxOd: 4, speedBonus: 4, speedDiceSides: 6,
        onDeathCurse: 2,
        reviveChance: 0.55,
        reviveHpRatio: 0.6,
        damageImmuneChance: 0.6,
        damageImmuneExceptTags: ['聖痕'],

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }
            if (this.ct >= this.maxCt) {
                return { id: 'SPIRIT_BOMB', type: 'SPECIAL', summonIds: ['undead'], consumeCt: this.maxCt, desc: '💥 靈體炸彈 (消耗全部CT，召喚亡靈，自己死亡並對玩家造成爆擊傷害)' };
            }
            const pool = [
                this.basicAttack(),
                { id: 'GHOST_IMPACT', type: 'ALLY_BUFF', effect: 'RAGE_BUFF', turns: 2, value: 2, desc: '怨靈衝擊 (我方全體攻擊力、速度加值+2，2回合)' }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'skeleton': Object.assign(Object.create(BASE_ENEMY), {
        id: 'skeleton',
        faction: 'deadcity',
        name: '☠️ 骷髏',
        maxHp: 4, hp: 4, atk: 2, critBonus: 2, critChance: 0.15,
        ct: 0, maxCt: 2, od: 0, maxOd: 2, speedDiceSides: 4,
        onDeathCurse: 1,

        getIntent(turnCount, speedDice, self) {
            if (this.isBreak) {
                return this.basicAttack();
            }
            const pool = [
                this.basicAttack()
            ];
            if (this.ct >= 1) {
                pool.push({ id: 'SUMMON', type: 'SPECIAL', summonIds: ['skeleton', 'skeleton'], consumeCt: 1, desc: '💀 亡靈呼喚 (消耗1CT，召喚2個骷髏)' });
            }
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    'skeleton_soldier': Object.assign(Object.create(BASE_ENEMY), {
        id: 'skeleton_soldier',
        name: '🦴 骷髏士兵',
        faction: 'deadcity',
        maxHp: 4, hp: 4, atk: 2, critBonus: 2, critChance: 0.15,
        ct: 0, maxCt: 0, od: 0, maxOd: 2, speedDiceSides: 8,
        // 回歸死城：自己死亡時，死骸騎士 CT+1、格擋+4、回復10（CombatSystem._handleEnemyDeath 統一處理）
        onDeathAllyEffect: { targetId: 'corpse_knight', ct: 1, block: 4, heal: 10 },
        // 死靈共鳴：進場時我方全體獲得 2 點格擋（由 CombatSystem.summonEnemies 呼叫）
        onSpawn(self, enemies, log) {
            (enemies || []).filter(e => e.hp > 0).forEach(e => { e.block = (e.block || 0) + 2; });
            if (typeof log === 'function') log(`🦴 ${self.name} 的【死靈共鳴】發動，我方全體獲得 2 點格擋！`);
        },

        getIntent(turnCount, speedDice, self) {
            const pool = [
                this.basicAttack(),
                { id: 'BONE_SPIRIT', type: 'ALLY_BUFF', effect: 'BLOCK_HEAL_ALL', value: 4, healValue: 10,
                  desc: '骨氣 (我方全體獲得4點格擋並回復10)' }
            ];
            return Phaser.Utils.Array.GetRandom(pool);
        }
    }),

    //boss--------------------------------------------------------------
    'corpse_knight': Object.assign(Object.create(BASE_ENEMY), {
            id: 'corpse_knight',
            name: '☠️ 死骸騎士',
            maxHp: 140, hp: 140, atk: 7, critBonus: 4, critChance: 0.15,
            ct: 0, maxCt: 4, od: 0, maxOd: 4, speedBonus: 4, speedDiceSides: 10,
    
            phase: 1,
            phaseThresholds: [0.5],
            hpFloorRatio: 0.5,               // 一階段血量不會低於 50%，轉階段後自動失效
            onDamagedSummonChance: 0.44,     // 亡靈軍勢
            onDamagedSummonIds: ['skeleton_soldier'],
            onDealDamageAoeChance: 0.44,     // 死神氣息
            onDealDamageAoeValue: 1,
            forceSlayerNext: false,          // Step 4：魔劍覺醒後必發弒滅劍
            awakenPending: false,            // Step 4
    
            onPhaseTransition(newPhase, log) {
                if (newPhase !== 2) return;
                const safeLog = typeof log === 'function' ? log : console.log;
                const hero = CombatSystem._activeHero;
                const enemies = CombatSystem._activeEnemies || [];
                safeLog(`💀 ${this.name} 進入【二階段】，發動【死寂之城】！`);
                if (hero && hero.hp > 0) {
                    CombatSystem.addTimedStatus(hero, 'debuff_freeze', 4, 'REFRESH');
                    safeLog(`❄️ ${hero.name} 被施加【冰結】(4回合)！`);
                }
                const buffed = enemies.filter(e => e.hp > 0 && (e === this || e.faction === 'deadcity'));
                buffed.forEach(e => CombatSystem.addTimedStatus(e, 'deadcity_aura', 4, 'REFRESH'));
                safeLog(`💀 ${buffed.map(e => e.name).join('、')} 獲得【死寂之城】(4回合：攻擊力+2、爆擊率+20%、速度+4)！`);
            },
            
            onTurnEnd(log) {
                ENEMY_TEMPLATE.onTurnEnd.call(this, log);
                const safeLog = typeof log === 'function' ? log : console.log;
    
                if (this.phase === 1 && this.hpFloorRatio && this.hp > 0) {
                    const floorHp = Math.floor(this.maxHp * this.hpFloorRatio);
                    if (this.hp < floorHp) {
                        this.hp = floorHp;
                        CombatSystem.checkPhaseTransition(this, log);
                    }
                }
    
                // 魔劍覺醒的下回合：CT 補至上限、失去靈體化、下一擊必定弒滅劍
                // （放在這裡而不是 getIntent，避免 Break 重新解析意圖時把旗標吃掉）
                if (this.awakenPending) {
                    this.awakenPending = false;
                    this.activeEffects = (this.activeEffects || []).filter(e => e.id !== 'spirit_form');
                    this.ct = this.maxCt;
                    this.forceSlayerNext = true;
                    safeLog(`🗡️ ${this.name} 的魔劍覺醒完成：CT 補至上限，失去【靈體化】，下一擊必定發動【弒滅劍】！`);
                }
            },
    
            getIntent(turnCount, speedDice, self) {
                const enemies = CombatSystem._activeEnemies || [];
                const aliveCount = enemies.filter(e => e.hp > 0).length;
                const soldierCount = enemies.filter(e => e.hp > 0 && e.id === 'skeleton_soldier').length;
    
                const general = [
                    this.basicAttack(),
                    { id: 'ASSAULT', type: 'SPECIAL', desc: '🗡️ 突襲 (單體爆擊傷害並使目標破防，再對全體造成1點傷害)' },
                    { id: 'TERROR', type: 'SPECIAL', desc: '😱 恐懼 (單體陷入威壓2T、凍傷4T)',
                      effects: ['effect'], effectTo: 'hero',
                      effect: [{ id: 'debuff_pressure', n: 2, mode: 'refresh' }, { id: 'debuff_frostbite', n: 4, mode: 'refresh' }],
                      effectMsg: (c) => `😱 ${c.attacker.name} 發動【恐懼】！${c.target.name} 陷入【威壓】(2回合)與【凍傷】(4回合)！` 
                    },
                    { id: 'UNDEAD_SLASH', type: 'SPECIAL', desc: '💀 亡靈斬擊 (處死其他死寂之城小怪，重複X+1次造成全體4點傷害並獲得4點格擋)' }
                ];
                if (this.isBreak) return Phaser.Utils.Array.GetRandom(general);
    
                if (this.phase === 2) {
                    // 魔劍覺醒後的下回合：必發弒滅劍（旗標在執行時才清除；CT 被壓到 0 時退回一般選招）
                    if (this.forceSlayerNext && this.ct >= 1) return this._slayerIntent();
                    // CT 滿：優先魔劍覺醒（想改成「只是加入選招池」，把這行改成下方 pool.push 即可）
                    if (this.ct >= this.maxCt) {
                        return {
                            id: 'SWORD_AWAKEN', type: 'SPECIAL', consumeCt: this.maxCt,
                            desc: '🗡️ 魔劍覺醒 (消耗全部CT，獲得靈體化；下回合CT補至上限、失去靈體化並必定發動弒滅劍)'
                        };
                    }
                }
    
                const pool = [...general];
                if (this.ct >= 2 && aliveCount < 4) {
                    pool.push({ id: 'NECRO_SUMMON', type: 'SPECIAL', consumeCt: 2, summonIds: ['undead', 'skeleton_soldier', 'skeleton_soldier'],
                        desc: '💀 死靈招喚 (消耗2CT，招喚亡靈與2個骷髏士兵)' });
                }
                if (this.ct >= 2) {
                    pool.push({ id: 'UNDEAD_RAID', type: 'SPECIAL', consumeCt: 2,
                        desc: '⚔️ 亡靈突襲 (消耗2CT，造成單體4點傷害，其他死寂之城小怪立刻各發動一次普通攻擊)' });
                }
                if (this.ct >= 1 && (aliveCount < 4 || soldierCount > 0)) {
                    pool.push({ id: 'SKELETON_ARMY', type: 'SPECIAL', consumeCt: 1,
                        desc: '🦴 骷髏大軍 (消耗1CT，招喚骷髏士兵直到滿場，我方全體獲得 4×骷髏士兵數 點格擋)' });
                }
                if (this.phase === 2 && this.ct >= 1) pool.push(this._slayerIntent());
                return Phaser.Utils.Array.GetRandom(pool);
            },
    
            _slayerIntent() {
                const x = this.ct;
                return {
                    id: 'ANNIHILATE_SWORD', type: 'SPECIAL', consumeCt: x,
                    desc: `🗡️ 弒滅劍 (消耗全部CT[${x}]，使目標血量變為${Math.max(0, 50 - x * 10)}%最大血量，覺醒${x}回合)`
                };
            },
        }),


}