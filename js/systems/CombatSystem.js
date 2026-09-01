import { createEnemyInstance } from '../data/enemyData.js';
import { EffectEngine } from './EffectEngine.js';
import { EFFECT_REGISTRY } from '../data/effectRegistry.js';
import { DOT_TYPES } from '../data/dotRegistry.js'; 
// js/systems/CombatSystem.js
export class CombatSystem {

    static setActiveHero(hero) {
        this._activeHero = hero;
    }

    // 🟢 通用敵人意圖解析器 (資料驅動核心)
    static executeEnemyIntent(attacker, intent, target, logCallback, enemies) {
        const safeLog = typeof logCallback === 'function' ? logCallback : console.log;
        if (!intent) return;

        // 🟢 新增：暈眩狀態直接跳過行動（滿CT特殊技已在 applyStunOverride 排除，不會走到這裡）
        if (intent.type === 'STUNNED') {
            safeLog(`💫 ${attacker.name} 處於【暈眩】狀態，無法行動！`);
            return;
        }

        // 🟢 新增：真正發動「消耗全部CT」的滿CT技時，強制解除自己身上會導致無法行動的負面效果
        // （暈眩此時已在 applyStunOverride 被豁免、不會擋這招，但招式一旦真的打出來，殘留的暈眩層數應一併清除，
        //   否則下回合暈眩還沒歸零，又會擋住下一次行動，觀感上像「明明剛才還能動，怎麼又動不了」）
        if (attacker.maxCt > 0 && intent.consumeCt === attacker.maxCt) {
            const stunEntry = EffectEngine.getEntry(attacker, 'debuff_stun');
            if (stunEntry && stunEntry.stacks > 0) {
                attacker.activeEffects = attacker.activeEffects.filter(e => e !== stunEntry);
                safeLog(`✨ ${attacker.name} 發動滿CT技，強行掙脫【暈眩】狀態！`);
            }
        }

        //友軍增益型招式（薩滿的加護/部落英雄）
        if (intent.type === 'ALLY_BUFF') {
            this.applyAllyBuff(attacker, intent, enemies, safeLog);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        // 🟢 盾之守衛專屬 SPECIAL 招式
        if (intent.type === 'SPECIAL' && intent.id === 'FULL_GUARD') {
            const allAllies = Array.isArray(enemies) ? enemies.filter(e => e.hp > 0) : [];
            allAllies.forEach(ally => { ally.block = (ally.block || 0) + 10; });
            attacker.activeEffects = attacker.activeEffects || [];
            attacker.activeEffects.push({ id: 'taunt', clearOnBlockZero: true });
            attacker.activeEffects.push({ id: 'guardian_counter', clearOnBlockZero: true });
            safeLog(`🛡️ ${attacker.name} 發動【全體保護】！己方全體獲得 10 點格擋，自己獲得【嘲諷】與【盾反】(直到格擋歸零)！`);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'SHIELD_BASH') {
            if ((attacker.block || 0) < (intent.selfBlockCost || 0)) {
                safeLog(`🛡️ ${attacker.name} 格擋不足，【盾擊】發動失敗！`);
            } else {
                attacker.block -= intent.selfBlockCost;
                safeLog(`🛡️ ${attacker.name} 消耗 ${intent.selfBlockCost} 點格擋，發動【盾擊】！`);
                this.applyDamageToTarget(target, intent.value, safeLog, enemies, attacker);
                if (target.hp > 0) {
                    const stunTurns = (intent.statusEffect && intent.statusEffect.turns) || 2;
                    safeLog(`💫 ${target.name} 陷入【暈眩】(${stunTurns} 回合)！`);
                    this.applyStun(target, stunTurns, safeLog);
                }
            }
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }
        //劍之守衛特殊技
        if (intent.type === 'SPECIAL' && intent.id === 'GAIN_COUNTER') {
            EffectEngine.addStacks(attacker, 'counter_stack', 1);
            safeLog(`🛡️ ${attacker.name} 獲得 1 層【反擊】！`);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'FOCUS') {
            attacker.atk = (attacker.atk || 0) + 1;
            attacker.critChance = (attacker.critChance || 0.15) + 0.05;
            safeLog(`🎯 ${attacker.name} 發動【專注】，攻擊力+1、爆擊率+5%（永久生效）`);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }
        //杖之守衛特殊技
        if (intent.type === 'SPECIAL' && intent.id === 'HEAL_LOWEST') {
            const target2 = this.getLowestHpPercentAlly(enemies);
            if (target2) {
                target2.hp = Math.min(target2.maxHp, target2.hp + 5);
                safeLog(`💚 ${attacker.name} 治療 ${target2.name}，回復 5 點HP！`);
            }
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'AREA_HEAL_CAST') {
            attacker.pendingDelayedHeal = true;
            safeLog(`✨ ${attacker.name} 詠唱【範圍治療】，將在下次行動時發動！`);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'DELAYED_HEAL_RESOLVE') {
            const allAllies = (enemies || []).filter(e => e.hp > 0);
            const lowest = this.getLowestHpPercentAlly(allAllies);
            allAllies.forEach(ally => {
                const heal = (ally === lowest) ? 5 : 2;
                ally.hp = Math.min(ally.maxHp, ally.hp + heal);
            });
            safeLog(`✨ ${attacker.name} 的【範圍治療】發動！${lowest ? lowest.name + '回復5' : ''}，其餘我方回復2`);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'SAGE_BLESS') {
            const others = (enemies || []).filter(e => e.hp > 0 && e !== attacker);
            others.forEach(ally => EffectEngine.addStacks(ally, 'sage_blessing', 2));
            safeLog(`🔮 ${attacker.name} 發動【賢者加護】，其他友軍獲得加護2回合！`);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'BLAST_MAGIC') {
            safeLog(`💥 ${attacker.name} 發動【爆破魔法】，對 ${target.name} 造成 ${intent.value} 點傷害！`);
            this.applyDamageToTarget(target, intent.value, safeLog, enemies, attacker);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'FREEZE') {
            EffectEngine.addStacks(target, 'debuff_freeze', 2);
            safeLog(`❄️ ${target.name} 被施加【冰結】(2回合)！`);
            this.applyDamageToTarget(target, intent.value, safeLog, enemies, attacker);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        // 弩之守衛特殊技
        if (intent.type === 'SPECIAL' && intent.id === 'DODGE') {
            attacker.dodgeCount = (attacker.dodgeCount || 0) + 1;
            safeLog(`🌀 ${attacker.name} 準備【閃避】！`);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'RESUPPLY') {
            attacker.nextDamageBonus = (attacker.nextDamageBonus || 0) + 2;
            safeLog(`🎯 ${attacker.name} 【補充箭矢】，下次造成傷害提升2點！`);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        if (intent.type === 'SPECIAL' && intent.id === 'ARMOR_PIERCE') {
            target.armorHits = target.armorMax || 0;
            target.isVulnerable = true;
            safeLog(`🎯 ${attacker.name} 發動【破甲箭】！${target.name} 護甲值歸零並進入【破防】狀態！`);
            this.applyDamageToTarget(target, intent.value, safeLog, enemies, attacker);
            if (target.hp > 0) {
                target.bleedStacks = (target.bleedStacks || 0) + 2;
                safeLog(`🩸 ${target.name} 附加2層【流血】！`);
            }
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            return;
        }

        // 🟢 境界衛士：祈求加護（回復14，過量治療轉格擋，1:1比例）
        if (intent.type === 'SPECIAL' && intent.id === 'PRAYER_BLESSING') {
            const before = attacker.hp;
            const healed = Math.min(attacker.maxHp - before, 14);
            const overflow = 14 - healed;
            attacker.hp += healed;
            safeLog(`🙏 ${attacker.name} 發動【祈求加護】，回復 ${healed} 點HP！`);
            if (overflow > 0) {
                attacker.block = (attacker.block || 0) + overflow;
                safeLog(`🛡️ 過量治療 ${overflow} 點轉換為格擋！`);
            }
            return;
        }

        // 🟢 境界衛士：連續刺擊（護甲歸零+流血3，若已有流血則追加2次1點傷害）
        if (intent.type === 'SPECIAL' && intent.id === 'CONTINUOUS_THRUST') {
            const hadBleedBefore = (target.bleedStacks || 0) > 0;
            target.armorHits = target.armorMax || 0;
            target.isVulnerable = true;
            target.bleedStacks = (target.bleedStacks || 0) + 3;
            safeLog(`🗡️ ${attacker.name} 發動【連續刺擊】！${target.name} 護甲歸零、進入【破防】，附加3層【流血】！`);
            if (hadBleedBefore) {
                safeLog(`🩸 ${target.name} 已有流血在身，追加造成2次1點傷害！`);
                for (let i = 0; i < 2; i++) {
                    if (target.hp <= 0) break;
                    this.applyDamageToTarget(target, 1, safeLog, enemies, attacker);
                }
            }
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            this.applyBossHealOnSpecial(attacker, target, safeLog);
            return;
        }

        // 🟢 境界衛士：裂地擊（滿CT，全體暈眩+7點傷害，自己+7格擋）
        if (intent.type === 'SPECIAL' && intent.id === 'GROUND_SLAM') {
            safeLog(`💥 ${attacker.name} 發動【裂地擊】！`);
            this.applyStun(target, 2, safeLog);
            this.applyDamageToTarget(target, 7, safeLog, enemies, attacker);
            attacker.block = (attacker.block || 0) + 7;
            safeLog(`🛡️ ${attacker.name} 獲得 7 點格擋！`);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            this.applyBossHealOnSpecial(attacker, target, safeLog);
            return;
        }

        // 🟢 境界衛士(二階)：引雷槍
        if (intent.type === 'SPECIAL' && intent.id === 'LIGHTNING_SPEAR') {
            const hadBleed = (target.bleedStacks || 0) > 0;
            safeLog(`⚡ ${attacker.name} 發動【引雷槍】！`);
            this.applyDamageToTarget(target, 7, safeLog, enemies, attacker);
            EffectEngine.addStacks(target, 'debuff_shock', 2);
            safeLog(`⚡ ${target.name} 附加 2 層【電擊】！`);
            if (hadBleed && target.hp > 0) {
                safeLog(`🩸 ${target.name} 已有流血，追加施加【暈眩】(2回合)！`);
                this.applyStun(target, 2, safeLog);
            }
            attacker.nextDamageBonus = (attacker.nextDamageBonus || 0) + 2;
            attacker.pendingLightningRecall = true;
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            this.applyBossHealOnSpecial(attacker, target, safeLog);
            return;
        }

        // 🟢 境界衛士(二階)：憾地洛雷（滿CT，解除飛行，全體暈眩+電擊，單體10點傷害）
        if (intent.type === 'SPECIAL' && intent.id === 'GROUND_THUNDER') {
            attacker.isFlying = false;
            safeLog(`⚡ ${attacker.name} 發動【憾地洛雷】！`);
            this.applyStun(target, 2, safeLog);
            target.bleedStacks = (target.bleedStacks || 0) + 2;
            EffectEngine.addStacks(target, 'debuff_shock', 2);
            safeLog(`⚡ ${target.name} 附加 2 層【電擊】！`);
            this.applyDamageToTarget(target, 10, safeLog, enemies, attacker);
            attacker.lockedBeforeGroundThunder = false;   // 解鎖：發動過後恢復正常選招
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            this.applyBossHealOnSpecial(attacker, target, safeLog);
            return;
        }

        // 🟢 境界衛士(二階)：天雷突刺（傷害=6+目標流血層數+電擊層數）
        if (intent.type === 'SPECIAL' && intent.id === 'THUNDER_THRUST') {
            const bleedLayers = target.bleedStacks || 0;
            const shockEntry = EffectEngine.getEntry(target, 'debuff_shock');
            const shockLayers = shockEntry ? shockEntry.stacks : 0;
            target.bleedStacks = (target.bleedStacks || 0) + 3;
            const dmg = 6 + bleedLayers + shockLayers;
            safeLog(`⚡ ${attacker.name} 發動【天雷突刺】，給予3層流血並造成 ${dmg} 點傷害！`);
            this.applyDamageToTarget(target, dmg, safeLog, enemies, attacker);
            if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            this.applyBossHealOnSpecial(attacker, target, safeLog);
            return;
        }

        // 1. 處理 Buff / Debuff / 特殊機制 (如蓄力、飛翔、威壓)
        if (intent.type === 'BUFF' || intent.type === 'DEBUFF') {
            if (intent.id === 'CHARGE') {
                attacker.ct = Math.min(attacker.maxCt, attacker.ct + 1);
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + (intent.healValue || 7));
                safeLog(`🐉 ${attacker.name} 展開【${intent.desc || '蓄力'}】，回復 7 點 HP 並累積 1CT！`);
            } else if (intent.id === 'FLY') {
                attacker.isFlying = true;
                safeLog(`🐉 ${attacker.name} 振翅升空進入【飛翔】狀態！`);
            } else if (intent.id === 'ASCEND') {   // 🟢 新增：境界衛士的展翼，效果與FLY相同，用不同id方便log/未來差異化
                attacker.isFlying = true;
                safeLog(`🦅 ${attacker.name} 振翅升空進入【飛翔】狀態！`);
            } else if (intent.id === 'PRESSURE') {
                target.isPressured = true;
                attacker.pressureUsedThisOD = true;
                safeLog(`😱 ${attacker.name} 發動【威壓】！${target.name} 下次攻擊骰鎖定為 1，且本回合無法使用主動技能！`);
            }
            return;
        }

        // 2. 處理攻擊型招式 (ATTACK / SPECIAL)
        const hitCount = intent.hits || 1;
        
        for (let i = 0; i < hitCount; i++) {
            if (target.hp <= 0) break;

            let baseDmg = intent.value || attacker.atk || 0;
            if (attacker.nextDamageBonus) {
                baseDmg += attacker.nextDamageBonus;
                attacker.nextDamageBonus = 0;
            }

            // 判斷暴擊
            const isCrit = attacker.isOD || (intent.canCrit && typeof attacker.rollCrit === 'function' && attacker.rollCrit());
            if (isCrit) {
                baseDmg += (attacker.critBonus || 2);
                safeLog(`💥 【${intent.desc || '攻擊'}】觸發暴擊！`);
            }

            // 真實傷害：無視閃避與格擋 (如：制裁)
            if (intent.trueDamage || intent.unblockable) {
                target.hp = Math.max(0, target.hp - baseDmg);
                safeLog(`⚡ ${attacker.name} 使用【${intent.desc}】，造成 ${baseDmg} 點無視防禦與閃避的真實傷害！`);
            } else {
                // 一般結算 (經由 applyDamageToTarget)
                this.applyDamageToTarget(target, baseDmg, safeLog, enemies, attacker);   // 🟢 傳遞 attacker 以支持 onGetHit hook
            }
        }

        // 3. 處理狀態附加 (如：劇毒)
        if (intent.statusEffect) {
            if (intent.statusEffect.type === 'poison') {
                target.poisonTurns = intent.statusEffect.turns || 3;
                safeLog(`☠️ ${target.name} 中了【劇毒】(持續 ${target.poisonTurns} 回合)！`);
            } else if (intent.statusEffect.type === 'bleed') {
                const stacks = intent.statusEffect.stacks || 1;
                target.bleedStacks = (target.bleedStacks || 0) + stacks;
                safeLog(`🩸 ${target.name} 附加 ${stacks} 層【流血】！`);
            }
        }

        // 4. 招式後的資源消耗 (如：吐息耗 1CT、制裁耗 3CT、墜擊解除飛行)
        if (intent.consumeCt) {
            attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            this.applyBossHealOnSpecial(attacker, target, safeLog);   // 🟢 新增：純ATTACK型特動(如舞花)在此觸發回血
        }
        if (intent.id === 'DIVE') attacker.isFlying = false;

        // js/systems/CombatSystem.js 的 executeEnemyIntent 補上：

        
        if (!intent) return;

        // CombatSystem.js (召喚邏輯區塊)

        if (intent.type === 'SPECIAL' && intent.id === 'SUMMON') {
            safeLog(`📢 ${attacker.name} 大聲呼叫，召喚了同伴支援！`);

            // 改成
            if (enemies && Array.isArray(enemies)) {
                // 🟢 改為檢查「存活」敵人數量是否低於上限 (最大 4 個)，死亡敵人不再佔用召喚名額
                const aliveCount = enemies.filter(e => e.hp > 0).length;
                if (aliveCount < 4) {
                    const newGoblin = createEnemyInstance('goblin');
                    if (newGoblin) {
                        enemies.push(newGoblin);
                        safeLog(`👺 新的哥布林加入了戰場！(當前存活數量: ${aliveCount + 1}/4)`);
                    }
                } else {
                    // 🟢 場滿提示
                    safeLog(`⚠️ 場上存活敵人數量已達上限 (4/4)，無法召喚更多同伴！`);
                }
            } else {
                console.warn('⚠️ 召喚失敗：無法取得 enemies 陣列');
            }

            // 扣除 CT 費用 (不管成功或場滿，只要發動技能就會扣 CT)
            if (intent.consumeCt) {
                attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
            }
            return;
        }
    }


// 🟢 通用「友軍增益」招式解析器
    static applyAllyBuff(attacker, intent, enemies, safeLog) {
        const allAllies = Array.isArray(enemies) ? enemies.filter(e => e && e.hp > 0) : [];
        const otherAllies = allAllies.filter(e => e !== attacker);

        switch (intent.effect) {
            case 'BLOCK': {
                if (otherAllies.length === 0) {
                    safeLog(`🔮 ${attacker.name} 發動【${intent.desc}】，但沒有其他友軍在場，效果落空`);
                    break;
                }
                otherAllies.forEach(ally => { ally.block = (ally.block || 0) + intent.value; });
                safeLog(`🛡️ ${attacker.name} 發動【${intent.desc}】，其他友軍全部獲得 ${intent.value} 點格擋！`);
                break;
            }
            case 'CHARGE_BUFF': {
                if (otherAllies.length === 0) {
                    safeLog(`🔮 ${attacker.name} 發動【${intent.desc}】，但沒有其他友軍在場，效果落空`);
                    break;
                }
                otherAllies.forEach(ally => this.applyChargeBuff(ally, intent.turns));
                safeLog(`⚡ ${attacker.name} 發動【${intent.desc}】，其他友軍獲得【衝鋒】效果 ${intent.turns} 回合！`);
                break;
            }
            case 'HEAL_ALL': {
                allAllies.forEach(ally => { ally.hp = Math.min(ally.maxHp, ally.hp + intent.value); });
                safeLog(`✨ ${attacker.name} 發動【${intent.desc}】，友軍全體回復 ${intent.value} 點HP！`);
                break;
            }
            case 'HEROIC_BUFF': {
                // 部落英雄：自己必定獲得，並隨機挑一位其他友軍一起獲得
                this.applyHeroicBuff(attacker, intent.turns);
                let logMsg = `🔥 ${attacker.name} 發動【${intent.desc}】，自己獲得【英勇】效果 ${intent.turns} 回合`;
                if (otherAllies.length > 0) {
                    const chosen = otherAllies[Math.floor(Math.random() * otherAllies.length)];
                    this.applyHeroicBuff(chosen, intent.turns);
                    logMsg += `，並讓 ${chosen.name} 一同獲得【英勇】效果！`;
                } else {
                    logMsg += `！（沒有其他友軍可分享效果）`;
                }
                safeLog(logMsg);
                break;
            }
            case 'RANDOM_SELF_BLOCK': {
                attacker.block = (attacker.block || 0) + intent.value;
                let msg = `🛡️ ${attacker.name} 發動【${intent.desc}】，自己獲得 ${intent.value} 點格擋`;
                if (otherAllies.length > 0) {
                    const randomAlly = otherAllies[Math.floor(Math.random() * otherAllies.length)];
                    randomAlly.block = (randomAlly.block || 0) + intent.value;
                    msg += `，並讓 ${randomAlly.name} 一同獲得 ${intent.value} 點格擋！`;
                } else {
                    msg += `！（沒有其他友軍可分享效果）`;
                }
                safeLog(msg);
                break;
            }
            default:
                safeLog(`⚠️ 未知的友軍增益效果類型: ${intent.effect}`);
        }
    }

    // 🟢 套用「衝鋒」：首次生效才疊加 OD上限+1 / 爆擊增益+1，重複觸發只刷新回合數，避免無限疊加
    static applyChargeBuff(entity, turns = 2) {
        if (!(entity.chargeTurns > 0)) {
            entity.maxOd = (entity.maxOd || 0) + 1;
            entity.critBonus = (entity.critBonus || 0) + 1;
        }
        entity.chargeTurns = turns;
    }

    // 🟢 套用「英勇」：效果在 onTurnEnd 中持續觸發，這裡只需設定/刷新回合數
    static applyHeroicBuff(entity, turns = 2) {
        entity.heroicTurns = turns;
    }


    static applyDamageToTarget(target, rawDmg, logCallback, enemies, attacker = null) {   // 🟢 Stage 5-6：新增 enemies / attacker 參數
        // 1. 🌀 閃避判定
        // 1. 🌀 閃避判定
        if (target.dodgeCount && target.dodgeCount > 0) {
            target.dodgeCount -= 1;
            if (logCallback) logCallback(`🌀 發動【閃避】！完全免疫本次 ${rawDmg} 點傷害`);
            if (typeof target.onDodgeSuccess === 'function') {
                target.onDodgeSuccess(enemies, logCallback, this);
            }
            // 🟢 新增：讓「戰鬥內限時」的閃避連動效果（寂寞無為）跟角色固有被動分開掛勾
            EffectEngine.runHook('onDodgeSuccess', target, { enemies, log: logCallback, combatSys: this });
            return;
        }

        // 🟢 新增：受擊 hook —— 不論後續格擋/傷害計算結果，只要沒被閃避就觸發（反擊層數用）
        const hookCtx = { enemies, log: logCallback, combatSys: this };
        if (attacker) hookCtx.attacker = attacker;  // 只在 attacker 存在時才傳遞
        EffectEngine.runHook('onGetHit', target, hookCtx);

        // 改成
        // 2. 觸發受擊 OD / Break 增減 (適用於敵人)
        if (typeof target.onTakeHit === 'function') {
            target.onTakeHit(logCallback);
        }

        // 🟢 若這一擊讓敵人當場進入Break，立刻重新驗證意圖並更新顯示，
        // 不要等到敵人真正執行動作時才切換，避免玩家看到過期的預告文字
        if (target.isBreak && typeof target.getIntent === 'function') {
            this.resolveEnemyIntent(target);
        }
        this.checkPhaseTransition(target, logCallback);

        let finalDmg = rawDmg;
        let logDetails = [];
        
        // 3. 破防狀態加傷判定
        if (target.isBreak) {
            finalDmg += 2;
            logDetails.push(`Break破防+2`);
        } 
        else if (target.isVulnerable) {
            finalDmg += 2;
            logDetails.push(`玩家破防+2`);
        }

        // 4. 格擋 (Block) 抵銷扣除 (玩家與敵人皆適用)
        let blockedAmount = 0;   // 🟢 Stage 5-6：記錄這次實際被格擋吸收的量
        if (target.block && target.block > 0) {
            if (target.block >= finalDmg) {
                blockedAmount = finalDmg;
                target.block -= finalDmg;
                logDetails.push(`格擋完全抵銷`);
                finalDmg = 0;
            } else {
                blockedAmount = target.block;
                finalDmg -= target.block;
                logDetails.push(`格擋抵銷 ${target.block}`);
                target.block = 0;
            }
        }

        // 🟢 Stage 5-6：格擋有實際吸收傷害時，觸發 onBlockedDamage hook（盾反等效果掛在這裡）
        // combatSys: this 讓 registry 不用 import CombatSystem，避免循環依賴
        if (blockedAmount > 0) {
            EffectEngine.runHook('onBlockedDamage', target, { blockedAmount, enemies, log: logCallback, combatSys: this, attacker });
        }

        // 🟢 門衛四天王：格擋歸零時解除標記為 clearOnBlockZero 的效果（嘲諷/盾之守衛盾反）
        // 用「實例層級flag」而非改動 taunt/guardian_counter 本身的既有解除邏輯，
        // 避免動到玩家「盾反」卡片原本靠回合倒數解除的行為
        if (blockedAmount > 0 && target.block <= 0 && target.activeEffects && target.activeEffects.length > 0) {
            const hadFlag = target.activeEffects.some(e => e.clearOnBlockZero);
            if (hadFlag) {
                target.activeEffects = target.activeEffects.filter(e => !e.clearOnBlockZero);
                if (logCallback) logCallback(`🛡️ ${target.name} 的格擋已耗盡，【嘲諷】與【盾反】效果解除！`);
            }
        }

        // 5. 扣除 HP 與 受傷次數判定
        if (finalDmg > 0) {
            const wasAliveBefore = target.hp > 0;
            target.hp = Math.max(0, target.hp - finalDmg);
            let detailStr = logDetails.length > 0 ? ` (${logDetails.join(', ')})` : '';
            if (logCallback) logCallback(`💥 造成 ${finalDmg} 點傷害${detailStr} (剩餘 ${target.hp}/${target.maxHp} HP)`);

            // 🟢 懸賞：帶有懸賞標記的目標死亡時，玩家獲得50*該目標身上懸賞層數的金幣
            if (wasAliveBefore && target.hp <= 0 && target.bounty && target.bounty > 0) {
                const bountyGold = 50 * target.bountyStacks;
                this._activeHero.gold = (this._activeHero.gold || 0) + bountyGold;
                if (logCallback) logCallback(`🏆 ${target.name} 死亡，獲得懸賞金 ${bountyGold} 金幣！`);
            }

            if (target.armorMax && target.armorMax > 0) {
                target.armorHits = (target.armorHits || 0) + 1;
                const effectiveArmorMax = this.getEffectiveArmorMax(target);
                if (target.armorHits >= effectiveArmorMax && !target.isVulnerable) {
                    target.isVulnerable = true;
                    if (logCallback) logCallback(`⚠️ 玩家護甲崩潰！進入【破防】狀態！`);
                }
            }
        } else {
            if (logCallback) logCallback(`🛡️ 傷害被完全抵銷！`);
        }
    }

    // 🟢 通用：血量門檻多階段轉換判定
    static checkPhaseTransition(target, logCallback) {
        if (!target.phaseThresholds || target.phaseThresholds.length === 0) return;
        const idx = (target.phase || 1) - 1;
        const threshold = target.phaseThresholds[idx];
        if (threshold === undefined) return;
        if (target.hp / target.maxHp <= threshold) {
            target.phase = (target.phase || 1) + 1;
            if (typeof target.onPhaseTransition === 'function') {
                target.onPhaseTransition(target.phase, logCallback);
            }
        }
    }

    
    static applyBossHealOnSpecial(attacker, target, logCallback) {
        if (!attacker.healOnSpecialUse || !target) return;
        const bleedLayers = target.bleedStacks || 0;
        const shockEntry = EffectEngine.getEntry(target, 'debuff_shock');
        const shockLayers = shockEntry ? shockEntry.stacks : 0;
        const healAmount = bleedLayers + shockLayers;
        if (healAmount <= 0) return;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
        logCallback(`🩸⚡ ${attacker.name} 汲取流血與電擊之力，回復 ${healAmount} 點HP！`);
    }

    // 🟢 中途被打進Break時，作廢原本鎖定的非一般意圖，改成當下的一般行動
    // Break分支邏輯不依賴 turnCount/speedDice，帶入安全值 0 即可正確走到 generalPool
    static resolveEnemyIntent(enemy, force = false) {
        if ((force || (enemy.isBreak && !enemy._intentLockedInBreak)) && typeof enemy.getIntent === 'function') {
            enemy.currentIntent = enemy.getIntent(0, enemy.speedDice, enemy);
            enemy.currentIntent = this.applyStunOverride(enemy, enemy.currentIntent);
            if (enemy.isBreak) enemy._intentLockedInBreak = true;
        }
        return enemy.currentIntent;
    }


    static applyHealToHero(hero, baseHeal, logCallback) {
        const actualHeal = baseHeal * (hero.healRatio + hero.battleHealBonus) + EffectEngine.getHealBonus(hero);
        hero.hp = Math.min(hero.maxHp, hero.hp + actualHeal);
        if (logCallback) logCallback(`💚 回復 ${actualHeal} 點 HP (現有 ${hero.hp}/${hero.maxHp})`);
    }

    static tickActionDOT(entity, log) {
        Object.values(DOT_TYPES).forEach(dot => {
            const stacks = entity[dot.stacksField] || 0;
            if (stacks <= 0) return;
            const dmg = dot.getDamage(entity);
            entity.hp = Math.max(0, entity.hp - dmg);
            entity[dot.stacksField] -= 1;
            log(`${dot.icon} 【${dot.label}】發作，${entity.name} 受到 ${dmg} 點傷害 (剩餘 ${entity[dot.stacksField]} 回合)`);
        });
    }

    static getLowestHpPercentAlly(allies) {
        const alive = (allies || []).filter(e => e.hp > 0);
        if (alive.length === 0) return null;
        return alive.reduce((lowest, e) => (e.hp / e.maxHp) < (lowest.hp / lowest.maxHp) ? e : lowest);
    }

    // 修改後
    static resetBattleScopedStats(hero) {
        hero.block = 0;
        hero.stigma = 0;
        hero.battleCritBonus = 0;
        hero.battleHealBonus = 0;
        hero.battleAtkBonus = 0;
        // 🟢 閃避次數與護甲受擊狀態同屬「單場戰鬥內臨時狀態」，
        // 上一場戰鬥結束時沒清空的話，玩家還沒開打就帶著上一場的閃避次數／破防倒數進場
        hero.dodgeCount = 0;
        hero.armorHits = 0;
        hero.isVulnerable = false;

        // 🟢 新增：劍豪專屬的單場戰鬥狀態，勇者身上沒有這些欄位，設定不影響勇者
        // 🟢 劍豪專屬單場戰鬥狀態：只在角色本身有定義該欄位時才重置，避免污染其他角色
        if ('stance' in hero) {
            hero.stance = 'SHEATHED';
            hero.swordIntent = 0;
            hero.insightStacks = 0;
        }

        // 🟢 獨立於角色判斷：turnCritBonus/forceCritThisTurn 現在任何角色都可能透過抽卡(KG_03)取得
        hero.turnCritBonus = 0;
        hero.forceCritThisTurn = false;
        hero.nextStigmaCardDiscount = 0;

        // 🟢 新增：清除單場戰鬥限定的卡片效果 (CARD_EFFECT 類，如寂寞無為/槿花泡影/盾反)，
        // 避免尚未倒數完的剩餘回合數被帶進下一場戰鬥
        if (hero.activeEffects && hero.activeEffects.length > 0) {
            hero.activeEffects = hero.activeEffects.filter(entry => {
                const def = EFFECT_REGISTRY[entry.id];
                return !(def && def.category === 'CARD_EFFECT');
            });
        }

        // 🟢 欄位生命週期稽核補上：以下 6 個欄位理論上會在戰鬥流程中被消耗歸零，
        // 但若戰鬥在「已設定、尚未被消耗」的狀態下結束，殘留值會直接帶進下一場戰鬥
        hero.doubleNextAction = false;
        hero.poisonTurns = 0;
        hero.isPressured = false;
        hero.overrideDice = null;
        hero.lastPlayedCard = null;
        hero.cdActiveSkill = 0;   // 🟢 確認：主動技能冷卻為單場戰鬥性質，新戰鬥開局即可使用

        // 🟢 併入：DICE 計數器 used 歸零（原本獨立寫在 BattleScene.create()，統一到這裡管理，
        // 避免「單場戰鬥該清空什麼」分散在兩個地方查詢）
        ['reroll_attack_dice', 'reroll_speed_dice'].forEach(id => {
            const entry = EffectEngine.getEntry(hero, id);
            if (entry) entry.used = 0;
        });
    }

    // === 即時計算 Helper（方案A：不存欄位，每次讀取當下 HP 現算）===




    static getEffectiveEnemyAtk(enemy) {
        return (enemy.atk || 0) + EffectEngine.getLiveStatBonus(enemy, 'atk');
    }

    static getEffectiveEnemySpeedBonus(enemy) {
        return (enemy.speedBonus || 0) + EffectEngine.getLiveStatBonus(enemy, 'speed');
    }
    
    static getTauntTarget(aliveEnemies) {
        return aliveEnemies.find(e => EffectEngine.getEntry(e, 'taunt')) || null;
    }

    // 🟢 新增：暈眩覆蓋判定。有暈眩層數 & 意圖不是「消耗全部CT的滿CT特殊技」時，強制覆蓋成無行動
    static applyStunOverride(enemy, intent) {
        const stunEntry = EffectEngine.getEntry(enemy, 'debuff_stun');
        if (!stunEntry || !(stunEntry.stacks > 0)) return intent;

        const isFullCtUltimate = intent && enemy.maxCt > 0 && intent.consumeCt === enemy.maxCt;
        if (isFullCtUltimate) return intent;

        return { id: 'STUNNED', type: 'STUNNED', desc: '💫 暈眩中，無法行動' };
    }

    // 🟢 新增：統一的「施加暈眩」入口。除了疊加層數，若目標是「本回合意圖已經決定的敵人」，
    // 立刻中斷、覆蓋成暈眩狀態，不用等到下一次 getIntent() 才生效
    static applyStun(target, turns, logCallback) {
        const safeLog = typeof logCallback === 'function' ? logCallback : console.log;
        EffectEngine.addStacks(target, 'debuff_stun', turns);

        if (typeof target.getIntent === 'function' && target.currentIntent) {
            const overridden = this.applyStunOverride(target, target.currentIntent);
            if (overridden !== target.currentIntent) {
                target.currentIntent = overridden;
                safeLog(`💫 ${target.name} 的行動被【暈眩】強制中斷！`);
            }
        }
    }

    static getEffectiveAtk(hero) {
        return (hero.atk || 0) + (hero.battleAtkBonus || 0) + EffectEngine.getLiveStatBonus(hero, 'atk');
    }

    static getEffectiveCritBonus(hero) {
        return (hero.critBonus || 0) + (hero.battleCritBonus || 0) + (hero.turnCritBonus || 0) + EffectEngine.getLiveStatBonus(hero, 'crit');
    }

    static getEffectiveSpeedBonus(hero) {
        return (hero.speedBonus || 0) + (hero.turnSpeedBonus || 0) + EffectEngine.getLiveStatBonus(hero, 'speed');
    }

    static getEffectiveArmorMax(entity) {
        return (entity.armorMax || 0) + EffectEngine.getLiveStatBonus(entity, 'armor');
    }

    // 🟢 Stage 5-1 新增：卡片動態費用計算
    static getEffectiveCost(card, hero) {
        const base = (typeof card.getCost === 'function') ? card.getCost(hero) : (card.cost || 0);
        if (card.tags && card.tags.includes('金幣') && hero.freeGoldCardsThisTurn) {
            return 0;
        }
        let discounted = base;
        if (card.tags && card.tags.includes('聖痕') && hero.nextStigmaCardDiscount > 0) {
            discounted = Math.max(0, base - hero.nextStigmaCardDiscount);
        }
         const globalReduction = EffectEngine.getLiveStatBonus(hero, 'cardCost');

        return Math.max(0, discounted + globalReduction);
    }

    // 🟢 新增：統一計算「顯示/實際扣款用」的最終費用，把「首張卡片免費」被動也一併算進去
    // 供 BattleScene 的手牌顯示、出牌前檢查、實際扣款三處共用，避免各自重複判斷造成不一致
    static getDisplayCost(card, hero, battleCtx) {
        const baseEffCost = this.getEffectiveCost(card, hero);
        const isFreeFirstCard = battleCtx &&
            !battleCtx.firstCardPlayedThisBattle &&
            hero.firstCardFreeEachBattle;
        return {
            cost: isFreeFirstCard ? 0 : baseEffCost,
            isFreeFirstCard
        };
    }

    static resolveTurnOrder(playerSpeed, enemySpeed) {
        if (playerSpeed > enemySpeed) return 'PLAYER_FIRST';
        if (playerSpeed < enemySpeed) return 'ENEMY_FIRST';
        return 'SIMULTANEOUS';
    }

    static getRepeatCount(hero) {
        const count = hero.doubleNextAction ? 2 : 1;
        hero.doubleNextAction = false;
        return count;
    }

    onTurnEnd(entity) {
        let logs = [];
        if (entity.poisonTurns && entity.poisonTurns > 0) {
            entity.hp = Math.max(0, entity.hp - 1);
            entity.poisonTurns -= 1;
            logs.push(`🤢 ${entity.name} 受到【劇毒】侵蝕，扣除 1 點 HP！(剩餘 ${entity.poisonTurns} 回合)`);
        }
        if (typeof entity.onTurnEnd === 'function') {
            entity.onTurnEnd();
        }
        return logs;
    }
}