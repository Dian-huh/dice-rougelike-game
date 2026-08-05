import { createEnemyInstance } from '../data/enemyData.js';
// js/systems/CombatSystem.js
export class CombatSystem {

    // 🟢 通用敵人意圖解析器 (資料驅動核心)
    static executeEnemyIntent(attacker, intent, target, logCallback, enemies) {
        const safeLog = typeof logCallback === 'function' ? logCallback : console.log;
        if (!intent) return;

        // 1. 處理 Buff / Debuff / 特殊機制 (如蓄力、飛翔、威壓)
        if (intent.type === 'BUFF' || intent.type === 'DEBUFF') {
            if (intent.id === 'CHARGE') {
                attacker.ct = Math.min(attacker.maxCt, attacker.ct + 1);
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + (intent.healValue || 7));
                safeLog(`🐉 ${attacker.name} 展開【${intent.desc || '蓄力'}】，回復 7 點 HP 並累積 1CT！`);
            } else if (intent.id === 'FLY') {
                attacker.isFlying = true;
                safeLog(`🐉 ${attacker.name} 振翅升空進入【飛翔】狀態！`);
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
                this.applyDamageToTarget(target, baseDmg, safeLog);
            }
        }

        // 3. 處理狀態附加 (如：劇毒)
        if (intent.statusEffect) {
            if (intent.statusEffect.type === 'poison') {
                target.poisonTurns = intent.statusEffect.turns || 3;
                safeLog(`☠️ ${target.name} 中了【劇毒】(持續 ${target.poisonTurns} 回合)！`);
            }
        }

        // 4. 招式後的資源消耗 (如：吐息耗 1CT、制裁耗 3CT、墜擊解除飛行)
        if (intent.consumeCt) attacker.ct = Math.max(0, attacker.ct - intent.consumeCt);
        if (intent.id === 'DIVE') attacker.isFlying = false;

        // js/systems/CombatSystem.js 的 executeEnemyIntent 補上：

        
        if (!intent) return;

        // CombatSystem.js (召喚邏輯區塊)

        if (intent.type === 'SPECIAL' && intent.id === 'SUMMON') {
            safeLog(`📢 ${attacker.name} 大聲呼叫，召喚了同伴支援！`);

            if (enemies && Array.isArray(enemies)) {
                // 🟢 檢查場上敵人數量是否低於上限 (最大 4 個)
                if (enemies.length < 4) {
                    const newGoblin = createEnemyInstance('goblin');
                    if (newGoblin) {
                        enemies.push(newGoblin);
                        safeLog(`👺 新的哥布林加入了戰場！(當前數量: ${enemies.length}/4)`);
                    }
                } else {
                    // 🟢 場滿提示
                    safeLog(`⚠️ 場上敵人數量已達上限 (4/4)，無法召喚更多同伴！`);
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

    static applyDamageToTarget(target, rawDmg, logCallback) {
        // 1. 🌀 閃避判定
        if (target.dodgeCount && target.dodgeCount > 0) {
            target.dodgeCount -= 1;
            if (logCallback) logCallback(`🌀 發動【閃避】！完全免疫本次 ${rawDmg} 點傷害`);
            return;
        }

        // 2. 觸發受擊 OD / Break 增減 (適用於敵人)
        if (typeof target.onTakeHit === 'function') {
            target.onTakeHit(logCallback);
        }

        let finalDmg = rawDmg;
        let logDetails = [];
        
        // 3. 破防狀態加傷判定
        // 🟢 敵人：由 isBreak 觸發破防加傷
        if (target.isBreak) {
            finalDmg += 2;
            logDetails.push(`Break破防+2`);
        } 
        // 🟢 玩家：若護甲已崩潰 (isVulnerable) 則套用破防加傷
        else if (target.isVulnerable) {
            finalDmg += 2;
            logDetails.push(`玩家破防+2`);
        }

        // 4. 格擋 (Block) 抵銷扣除 (玩家與敵人皆適用)
        if (target.block && target.block > 0) {
            if (target.block >= finalDmg) {
                target.block -= finalDmg;
                logDetails.push(`格擋完全抵銷`);
                finalDmg = 0;
            } else {
                finalDmg -= target.block;
                logDetails.push(`格擋抵銷 ${target.block}`);
                target.block = 0;
            }
        }

        // 5. 扣除 HP
        if (finalDmg > 0) {
            target.hp = Math.max(0, target.hp - finalDmg);
            let detailStr = logDetails.length > 0 ? ` (${logDetails.join(', ')})` : '';
            if (logCallback) logCallback(`💥 造成 ${finalDmg} 點傷害${detailStr} (剩餘 ${target.hp}/${target.maxHp} HP)`);
        } else {
            if (logCallback) logCallback(`🛡️ 傷害被完全抵銷！`);
        }

        // 6. 🟢 玩家專屬：護甲受擊次數計數與崩潰判定
        if (target.armorMax && target.armorMax > 0) {
            target.armorHits = (target.armorHits || 0) + 1;
            if (target.armorHits >= target.armorMax && !target.isVulnerable) {
                target.isVulnerable = true;
                if (logCallback) logCallback(`⚠️ 玩家護甲崩潰！進入【破防】狀態！`);
            }
        }
    }


    static applyHealToHero(hero, baseHeal, logCallback) {
        const actualHeal = baseHeal * hero.healRatio;
        hero.hp = Math.min(hero.maxHp, hero.hp + actualHeal);
        if (logCallback) logCallback(`💚 回復 ${actualHeal} 點 HP (現有 ${hero.hp}/${hero.maxHp})`);
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