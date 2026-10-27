import { createEnemyInstance } from '../data/enemyData.js';
import { EffectEngine } from './EffectEngine.js';
import { EFFECT_REGISTRY } from '../data/effectRegistry.js';
import { DOT_TYPES } from '../data/dotRegistry.js'; 
import { MoveRunner } from './MoveRunner.js';
import './moveHandlers.js';   // 註冊 MoveRunner 基本 handlers（僅副作用）
// js/systems/CombatSystem.js
export class CombatSystem {

    static setActiveHero(hero) {
        this._activeHero = hero;
    }

    static setActiveEnemies(enemies) {
        this._activeEnemies = enemies;
    }

    // 易傷施加：預設持續2T，可疊加層數
    static applyVulnerability(target, stacks = 1, turns = 2, logCallback = null) {
        let entry = EffectEngine.getEntry(target, 'debuff_vulnerability');
        if (!entry) {
            entry = EffectEngine.addStacks(target, 'debuff_vulnerability', stacks);
            entry.turns = turns;
        } else {
            entry.stacks += stacks;
            entry.turns = Math.max(entry.turns || 0, turns);
        }
        if (typeof logCallback === 'function') {
            logCallback(`💔 ${target.name} 獲得 ${stacks} 層【易傷】(現有 ${entry.stacks} 層，持續 ${entry.turns} 回合)！`);
        }
        return entry;
    }

    // 冰結施加：預設持續2T，每層使速度-3、攻擊力-3
    static applyFreeze(target, stacks = 1, turns = 2, logCallback = null) {
        let entry = EffectEngine.getEntry(target, 'debuff_freeze');
        if (!entry) {
            entry = EffectEngine.addStacks(target, 'debuff_freeze', stacks);
            entry.turns = turns;
        } else {
            entry.stacks += stacks;
            entry.turns = Math.max(entry.turns || 0, turns);
        }
        if (typeof logCallback === 'function') {
            logCallback(`❄️ ${target.name} 獲得 ${stacks} 層【冰結】(現有 ${entry.stacks} 層，持續 ${entry.turns} 回合)！`);
        }
        return entry;
    }

    // 通用「持續回合型」狀態施加：REFRESH＝取較大值（重複只刷新）；EXTEND＝累加回合
    static addTimedStatus(target, id, turns, mode = 'REFRESH') {
        const entry = EffectEngine.getEntry(target, id);
        if (!entry) return EffectEngine.addStacks(target, id, turns);
        if (mode === 'EXTEND') entry.stacks += turns;
        else entry.stacks = Math.max(entry.stacks, turns);
        return entry;
    }

    static setBattleLog(fn) {
        this._battleLog = fn;
    }

    // 烈焰琉璃：每次CT值變動時50%機率給予對方2層冰結
    static onEnemyCtChanged(enemy) {
        const hero = this._activeHero;
        if (!hero || !enemy.ctChangeFreezeChance || enemy.hp <= 0) return;
        if (Math.random() < enemy.ctChangeFreezeChance) {
            CombatSystem.applyFreeze(hero, 2, 2, this._battleLog);
        }
    }

    // 造成傷害時／受到傷害時的機率附加狀態（烈焰琉璃）
    static _applyHitProcs(target, attacker, log) {
        const safeLog = typeof log === 'function' ? log : () => {};
        // 烈焰琉璃：每次造成傷害時50%機率給予對方2層灼燒，若已有灼燒再給予2點傷害
        if (attacker && attacker.hitBurnChance && target.hp > 0 && Math.random() < attacker.hitBurnChance) {
            const hadBurn = !!EffectEngine.getEntry(target, 'debuff_burn');
            const burnStacks = attacker.hitBurnStacks || 2;
            EffectEngine.addStacks(target, 'debuff_burn', burnStacks);
            safeLog(`🔥 ${attacker.name} 造成傷害，${target.name} 獲得 ${burnStacks} 層【灼燒】！`);
            if (hadBurn) {
                this.applyDamageToTarget(target, 2, safeLog, this._activeEnemies || [], attacker, { noProc: true });
                safeLog(`🔥 ${target.name} 身上已有灼燒，額外受到 2 點傷害！`);
            }
        }
        // 烈焰琉璃：每次受到傷害時50%機率給予對方2T凍傷，若已有凍傷則延長3T
        if (target.takeHitFrostbiteChance && Math.random() < target.takeHitFrostbiteChance) {
            const src = attacker || this._activeHero;
            if (src && src !== target && src.hp > 0) {
                const frostEntry = EffectEngine.getEntry(src, 'debuff_frostbite');
                if (frostEntry && frostEntry.stacks > 0) {
                    this.addTimedStatus(src, 'debuff_frostbite', 3, 'EXTEND');
                    safeLog(`🧊 ${target.name} 受到傷害，${src.name} 已有凍傷，【凍傷】延長 3 回合！`);
                } else {
                    this.addTimedStatus(src, 'debuff_frostbite', 2, 'EXTEND');
                    safeLog(`🧊 ${target.name} 受到傷害，${src.name} 獲得 2 回合【凍傷】！`);
                }
            }
        }
    }

    // 融合：partner 與自己都存活且 CT 皆滿時，兩者消失並生成 fusionResultId，立刻對玩家造成全體爆擊傷害
    // 兩兄弟直接退場（hp=0），不走 _handleEnemyDeath：不給賞金、不觸發復仇與詛咒
    static tryFusion(enemies, log) {
        const safeLog = typeof log === 'function' ? log : console.log;
        const alive = (enemies || []).filter(e => e.hp > 0);
        for (const a of alive) {
            if (!a.fusionPartnerId || !a.fusionResultId) continue;
            const b = alive.find(e => e !== a && e.id === a.fusionPartnerId);
            if (!b) continue;
            if (!(a.maxCt > 0 && a.ct >= a.maxCt && b.ct >= b.maxCt)) continue;

            a.hp = 0; b.hp = 0;
            const fused = createEnemyInstance(a.fusionResultId, a.scaleTier || 0);
            if (!fused) return null;
            enemies.push(fused);
            safeLog(`🔥🧊 ${a.name} 與 ${b.name} 的 CT 皆已滿，發動【融合】！${fused.name} 降臨戰場！`);

            const hero = this._activeHero;
            const dmg = this.getEffectiveEnemyAtk(fused) + (fused.critBonus || 0) + EffectEngine.getLiveStatBonus(fused, 'crit');
            safeLog(`💥 ${fused.name} 出場，對全體造成破防並給予爆擊傷害！`);
            if (hero && hero.hp > 0) {
                hero.armorHits = hero.armorMax || 0;
                hero.isVulnerable = true;
                safeLog(`⚠️ ${hero.name} 受到猛烈衝擊，護甲歸零並進入【破防】狀態！`);
            }
            this.applyDamageToTarget(hero, dmg, safeLog, enemies, fused);
            return fused;
        }
        return null;
    }

    // 兄弟同心：source 剛進入 Break 時，讓 linkedBreakIds 內的其他存活敵人一起 Break
    static _propagateBreak(source, log) {
        const ids = source.linkedBreakIds;
        if (!ids || ids.length === 0) return;
        (this._activeEnemies || []).forEach(e => {
            if (e === source || e.hp <= 0 || e.isBreak || !ids.includes(e.id)) return;
            e.isOD = false;
            e.od = 0;
            e.isBreak = true;
            if (log) log(`🔗 ${source.name} 陷入 Break，${e.name} 受【兄弟同心】影響一同 Break！`);
            this.resolveEnemyIntent(e);
        });
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

        // 🟢 冰火兄弟：真正執行蓄力後的特殊技時，才清除 forceSpecialNext
        if (intent.bossSpecial) attacker.forceSpecialNext = false;

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

        // 🟢 MoveRunner 分流：有 effects / run 宣告的招式走通用執行器，其餘維持下方舊 if 鏈
        if (Array.isArray(intent.effects) || typeof intent.run === 'function') {
            return MoveRunner.execute(this, attacker, target, intent, safeLog, enemies);
        }

        // 所有招式都應已宣告 effects/run，或在上方有專屬分支；走到這裡代表有招式漏掛
        console.error(`⚠️ 招式 [${intent.id}] 沒有 effects/run，也沒有對應的舊分支，已略過`);

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

    static applyRageBuff(entity, turns = 2, bonus = 2) {
        if (!(entity.rageTurns > 0)) {
            entity.atk = (entity.atk || 0) + bonus;
            entity.speedBonus = (entity.speedBonus || 0) + bonus;
            entity.rageBonus = bonus;
        }
        entity.rageTurns = turns;
    }

        // 🟢 先發制人(onFirstAttack)：整場只觸發一次；觸發後開啟「行動視窗」，
    // 同一次行動內，每隻敵人各自的第一擊都吃加成，行動結束後由呼叫端關閉視窗
    static _applyFirstStrikeBonus(target, rawDmg, logCallback) {
        const hero = this._activeHero;
        if (!hero || target === hero || !(rawDmg > 0)) return rawDmg;

        const windowSet = hero._firstStrikeWindow;
        if (windowSet ? windowSet.has(target) : hero.firstStrikeUsed) return rawDmg;

        const bonusCtx = { log: logCallback || (() => {}), bonusTotal: 0 };
        EffectEngine.runHook('onFirstAttack', hero, bonusCtx);
        if (bonusCtx.bonusTotal <= 0) return rawDmg;   // 沒有先發制人效果時不消耗資格

        hero.firstStrikeUsed = true;
        if (!hero._firstStrikeWindow) hero._firstStrikeWindow = new Set();
        hero._firstStrikeWindow.add(target);
        return rawDmg + bonusCtx.bonusTotal;
    }

    static closeFirstStrikeWindow(hero) {
        if (hero) hero._firstStrikeWindow = null;
    }

    static applyDamageToTarget(target, rawDmg, logCallback, enemies, attacker = null, opts = {}) {  // 🟢 Stage 5-6：新增 enemies / attacker 參數
        // 🟢 敵人隨區域成長：只有「帶 dmgMul 的攻擊者」造成的傷害會被放大，
        // 放在格擋/閃避之前，防禦仍照常吸收，log 顯示的也是放大後的數字
        if (attacker && attacker.dmgMul > 1 && !opts.noScale) {
            rawDmg = Math.round(rawDmg * attacker.dmgMul);
        }
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

        // 🟢 靈體化免疫（閃避之後、先發制人之前；免疫時不觸發受擊、不加OD）
        const spiritEntry = EffectEngine.getEntry(target, 'spirit_form');
        const immuneChance = Math.max(target.damageImmuneChance || 0, spiritEntry ? 0.6 : 0);
        if (immuneChance > 0) {
            const tags = opts.tags || [];
            const exceptTags = target.damageImmuneExceptTags || (spiritEntry ? ['聖痕'] : []);
            const isExempt = tags.some(t => exceptTags.includes(t));
            if (!isExempt && Math.random() < immuneChance) {
                if (logCallback) logCallback(`👻 ${target.name} 【靈體化】生效，免疫本次 ${rawDmg} 點傷害！`);
                return;
            }
        }

        // 🟢 先發制人：閃避掉的攻擊不消耗資格；加成在格擋之前，會被格擋照常吸收
        if (!opts.noProc) rawDmg = this._applyFirstStrikeBonus(target, rawDmg, logCallback);

        // 🟢 新增：受擊 hook —— 不論後續格擋/傷害計算結果，只要沒被閃避就觸發（反擊層數用）
        const hookCtx = { enemies, log: logCallback, combatSys: this };
        if (attacker) hookCtx.attacker = attacker;  // 只在 attacker 存在時才傳遞
        EffectEngine.runHook('onGetHit', target, hookCtx);

        // 改成
        // 2. 觸發受擊 OD / Break 增減 (適用於敵人)
        const wasBreak = !!target.isBreak;
        if (typeof target.onTakeHit === 'function') {
            target.onTakeHit(logCallback);
        }
        if (!wasBreak && target.isBreak) this._propagateBreak(target, logCallback);

        // 🟢 若這一擊讓敵人當場進入Break，立刻重新驗證意圖並更新顯示，
        // 不要等到敵人真正執行動作時才切換，避免玩家看到過期的預告文字
        if (target.isBreak && typeof target.getIntent === 'function') {
            this.resolveEnemyIntent(target);
        }

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

        // 黑龍常駐被動: 龍王的傲氣（防禦面：自身血量每有10%，自身獲得5%減傷）
        if (target.dragonPride && target.hp > 0 && target.maxHp > 0) {
            const hpTenths = Math.floor((target.hp / target.maxHp) * 10);
            const reduction = Math.min(0.9, hpTenths * 0.05);
            if (reduction > 0) {
                finalDmg = Math.max(1, Math.round(finalDmg * (1 - reduction)));
                logDetails.push(`龍王的傲氣減傷${Math.round(reduction * 100)}%`);
            }
        }

        // 凍傷：每次受傷額外增加（剩餘回合數）點
        const takenBonus = EffectEngine.getLiveStatBonus(target, 'damageTaken');
        if (takenBonus > 0 && finalDmg > 0) {
            finalDmg += takenBonus;
            logDetails.push(`凍傷+${takenBonus}`);
        }

        // 🟢 固定傷害（弒滅劍）：覆蓋為指定數值，仍會被格擋吸收；呼叫端需同時傳 noScale
        if (opts.fixedDamage != null) finalDmg = opts.fixedDamage;

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
            // 易傷：每層使自身在受到傷害時額外使自身血量減少1
            const vulnBonus = EffectEngine.getLiveStatBonus(target, 'vulnerability');
            if (vulnBonus > 0) {
                finalDmg += vulnBonus;
                logDetails.push(`易傷+${vulnBonus}`);
            }
            const wasAliveBefore = target.hp > 0;
            const hpBefore = target.hp;
            let newHp = Math.max(0, hpBefore - finalDmg);
            // 🟢 血量下限：只在 phase 1 生效（用 floor 確保下限比例 ≤ 門檻，必能觸發轉階段）
            if (target.hpFloorRatio && (target.phase || 1) === 1) {
                const floorHp = Math.floor(target.maxHp * target.hpFloorRatio);
                newHp = Math.max(newHp, Math.min(hpBefore, floorHp));
            }
            finalDmg = hpBefore - newHp;
            target.hp = newHp;
            let detailStr = logDetails.length > 0 ? ` (${logDetails.join(', ')})` : '';
            if (logCallback) logCallback(`💥 造成 ${finalDmg} 點傷害${detailStr} (剩餘 ${target.hp}/${target.maxHp} HP)`);
            this.checkPhaseTransition(target, logCallback);
            if (wasAliveBefore && target.hp <= 0) {
                this._handleEnemyDeath(target, attacker || this._activeHero, logCallback, enemies, { cause: 'DAMAGE' });
            }
            this._applyHitProcs(target, attacker, logCallback);
            if (!opts.noProc) this._applyDamageProcs(target, attacker, enemies, logCallback);
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

    // 🟢 通用召喚：存活上限 4（含召喚者），逐隻生成並呼叫 onSpawn；回傳實際生成的敵人
    // opts.icon：每隻加入戰場訊息的前綴圖示；opts.capNotice：改成「迴圈後若已滿場才提示一次」（舊 SUMMON 的行為）
    static summonEnemies(summoner, ids, enemies, log, opts = {}) {
        const safeLog = typeof log === 'function' ? log : console.log;
        const spawned = [];
        if (!Array.isArray(enemies)) { console.warn('⚠️ 召喚失敗：無法取得 enemies 陣列'); return spawned; }
        const capMsg = `⚠️ 場上存活敵人數量已達上限 (4/4)，無法召喚更多同伴！`;
        let aliveCount = enemies.filter(e => e.hp > 0).length;
        for (const id of ids) {
            if (aliveCount >= 4) { if (!opts.capNotice && !opts.silentCap) safeLog(capMsg); break; }
            const e = createEnemyInstance(id, summoner.scaleTier || 0);
            if (!e) continue;
            if (e.faction === 'deadcity') {
                const auraTurns = enemies
                    .filter(ally => ally.hp > 0 && ally.faction === 'deadcity')
                    .reduce((maxTurns, ally) => {
                        const aura = EffectEngine.getEntry(ally, 'deadcity_aura');
                        return Math.max(maxTurns, aura ? aura.stacks : 0);
                    }, 0);
                if (auraTurns > 0) this.addTimedStatus(e, 'deadcity_aura', auraTurns, 'REFRESH');
            }
            enemies.push(e);
            aliveCount += 1;
            spawned.push(e);
            safeLog(`${opts.icon ? opts.icon + ' ' : ''}${e.name} 加入了戰場！(當前存活數量: ${aliveCount}/4)`);
            if (typeof e.onSpawn === 'function') e.onSpawn(e, enemies, safeLog);
        }
        if (opts.capNotice && aliveCount >= 4) safeLog(capMsg);
        return spawned;
    }

    // 🟢 傷害被動：受傷召喚（亡靈軍勢）、造傷附帶全體傷害（死神氣息）、龍王傲氣。內部傷害請傳 noProc 避免遞迴
    static _applyDamageProcs(target, attacker, enemies, log) {
        const safeLog = typeof log === 'function' ? log : () => {};
        const pool = enemies || this._activeEnemies;
        // 亡靈軍勢強化：每次受到傷害有44%機率召喚一個骷髏士兵並給予攻擊者1層詛咒
        if (target.onDamagedSummonChance && target.hp > 0 && Math.random() < target.onDamagedSummonChance) {
            safeLog(`💀 ${target.name} 的【亡靈軍勢】發動！`);
            this.summonEnemies(target, target.onDamagedSummonIds || [], pool, safeLog);
            if (attacker && attacker.hp > 0) {
                EffectEngine.addStacks(attacker, 'debuff_curse', 1);
                safeLog(`☠️ ${target.name} 的【亡靈軍勢】使 ${attacker.name} 獲得 1 層【詛咒】！`);
            }
        }
        const hero = this._activeHero;
        // 死神氣息強化：每次造成傷害(包含死神氣息所造成的傷害)有44%機率給予自身以外所有人1層易傷並造成一次全體1點傷害
        if (attacker && attacker.onDealDamageAoeChance && attacker.hp > 0
            && Math.random() < attacker.onDealDamageAoeChance) {
            safeLog(`☠️ ${attacker.name} 的【死神氣息】發動！給予全場（自身以外）1層【易傷】並造成全體 1 點傷害！`);
            if (hero && hero.hp > 0 && hero !== attacker) {
                CombatSystem.applyVulnerability(hero, 1, 2, safeLog);
            }
            (pool || []).filter(e => e.hp > 0 && e !== attacker).forEach(e => {
                CombatSystem.applyVulnerability(e, 1, 2, safeLog);
            });
            attacker._breathDepth = (attacker._breathDepth || 0) + 1;
            if (attacker._breathDepth <= 5) {
                if (hero && hero.hp > 0 && hero !== attacker) {
                    this.applyDamageToTarget(hero, 1, safeLog, pool, attacker);
                }
                (pool || []).filter(e => e.hp > 0 && e !== attacker).forEach(e => {
                    this.applyDamageToTarget(e, 1, safeLog, pool, attacker, { noScale: true });
                });
            }
            attacker._breathDepth = 0;
        }

        // 黑龍常駐被動: 龍王的傲氣（攻擊面：造成傷害時血量每少10%額外給予2點傷害與2層電擊）
        if (attacker && attacker.dragonPride && attacker.hp > 0 && target.hp > 0) {
            const missingTenths = Math.floor(((attacker.maxHp - attacker.hp) / attacker.maxHp) * 10);
            if (missingTenths > 0) {
                const bonusDmg = missingTenths * 2;
                const bonusShock = missingTenths * 2;
                safeLog(`🐉 ${attacker.name} 的【龍王的傲氣】發動（已損失 ${missingTenths * 10}% 血量），額外造成 ${bonusDmg} 點傷害與 ${bonusShock} 層【電擊】！`);
                this.applyDamageToTarget(target, bonusDmg, safeLog, pool, attacker, { noProc: true, noScale: true });
                if (target.hp > 0) {
                    EffectEngine.addStacks(target, 'debuff_shock', bonusShock);
                }
            }
        }
    }

    static getEffectiveEnemyCritChance(enemy) {
        return (enemy.critChance || 0.15) + EffectEngine.getLiveStatBonus(enemy, 'critChance');
    }

    // 🟢 統一的死亡結算：取代 applyDamageToTarget 與 forceKill 各自的懸賞金邏輯，
    // 並預留復活/山賊金幣返還/詛咒（Step3、Step4 才會真的掛欄位，目前多數敵人不受影響）
    static _handleEnemyDeath(target, killer, log, enemies, opts = {}) {
        const safeLog = typeof log === 'function' ? log : console.log;
        if (target === this._activeHero) return;
        if (opts.cause === 'ESCAPE' || opts.cause === 'FUSE') return;

        // 死骸騎士常駐被動: 死帝的王道（二階段後當血量第一次歸零時，立即恢復10%最大生命並獲得100%靈體化與補充CT到上限，且下次行動必定發動弒滅劍）
        if (target.id === 'corpse_knight' && (target.phase || 1) >= 2 && !target.hasUsedEmperorWay) {
            target.hasUsedEmperorWay = true;
            const reviveHp = Math.max(1, Math.floor(target.maxHp * 0.1));
            target.hp = reviveHp;
            target.damageImmuneChance = 1.0;
            EffectEngine.addStacks(target, 'spirit_form', 1);
            target.ct = target.maxCt;
            target.forceSlayerNext = true;
            target.awakenPending = false;
            safeLog(`👑 ${target.name} 發動【死帝的王道】！血量第一次歸零時重生，立即恢復 ${reviveHp} 點HP(10%)，獲得 100%【靈體化】，CT補滿至 ${target.ct}，下次行動必定發動【弒滅劍】！`);
            return;
        }

        // 復活（怨氣：不限次數，40%機率）
        if (target.reviveChance && Math.random() < target.reviveChance) {
            const reviveHp = Math.max(1, Math.round(target.maxHp * (target.reviveHpRatio || 0.5)));
            target.hp = reviveHp;
            safeLog(`💫 ${target.name} 觸發【怨氣】，以 ${reviveHp} 點HP復活！`);
            return;
        }

        // 復仇：存活的友軍若登記了 avengeOnDeathOf 包含死者 id，獲得比例版背水
        (enemies || this._activeEnemies || []).forEach(e => {
            if (e === target || e.hp <= 0 || !(e.avengeOnDeathOf || []).includes(target.id)) return;
            EffectEngine.addStacks(e, 'desperation_ratio', 1);
            safeLog(`😡 ${e.name} 目睹 ${target.name} 倒下，發動【復仇】獲得背水加護！`);
        });

        // 懸賞金
        if (target.bountyStacks && target.bountyStacks > 0) {
            const bountyGold = 50 * target.bountyStacks;
            this._activeHero.gold = (this._activeHero.gold || 0) + bountyGold;
            safeLog(`🏆 ${target.name} 死亡，獲得懸賞金 ${bountyGold} 金幣！`);
        }

        // 山賊金幣返還（無條件捨去一半）
        if (target.stolenGold && target.stolenGold > 0) {
            const returned = Math.floor(target.stolenGold / 2);
            if (returned > 0) {
                this._activeHero.gold = (this._activeHero.gold || 0) + returned;
                safeLog(`💰 ${target.name} 死亡，掉落了 ${returned} 金幣！`);
            }
        }

        // 詛咒：只有擊殺者是玩家時才施加
        if (killer === this._activeHero && target.onDeathCurse) {
            EffectEngine.addStacks(killer, 'debuff_curse', target.onDeathCurse);
            safeLog(`☠️ ${target.name} 死亡低語，你獲得 ${target.onDeathCurse} 層【詛咒】！`);
        }

        // 自身死亡時對指定友軍的效果（骷髏士兵：回歸死城）
        const pool = enemies || this._activeEnemies || [];
        const eff = target.onDeathAllyEffect;
        if (eff) {
            const ally = pool.find(e => e.hp > 0 && e.id === eff.targetId);
            if (ally) {
                if (eff.ct) ally.ct = Math.min(ally.maxCt, (ally.ct || 0) + eff.ct);
                if (eff.block) ally.block = (ally.block || 0) + eff.block;
                if (eff.heal) ally.hp = Math.min(ally.maxHp, ally.hp + eff.heal);
                safeLog(`💀 ${target.name} 的【回歸死城】發動：${ally.name} CT+${eff.ct || 0}、格擋+${eff.block || 0}、回復${eff.heal || 0}！`);
            }
        }

        // 死骸騎士常駐被動: 死之民的祈願與哀怨
        if (target.faction === 'deadcity' && target.id !== 'corpse_knight') {
            const knight = pool.find(e => e.hp > 0 && e.id === 'corpse_knight');
            if (knight) {
                // 死之民的哀怨: 獲得 1 層易傷
                CombatSystem.applyVulnerability(knight, 1, 2, safeLog);
                safeLog(`💔 ${target.name} 倒下，【死之民的哀怨】使 ${knight.name} 獲得 1 層【易傷】！`);

                // 死之民的祈願: 15%機率 CT上限+1, 回復10%最大生命, 獲得40格擋
                if (Math.random() < 0.15) {
                    knight.maxCt = (knight.maxCt || 0) + 1;
                    const healHp = Math.floor(knight.maxHp * 0.1);
                    knight.hp = Math.min(knight.maxHp, knight.hp + healHp);
                    knight.block = (knight.block || 0) + 40;
                    safeLog(`🙏 【死之民的祈願】發動！${knight.name} CT上限+1(現為 ${knight.maxCt})，回復 ${healHp} 點HP，獲得 40 點格擋！`);
                }
            }
        }

        // 死骸騎士常駐被動: 同歸於盡（死亡時給予全場自身CT數*10的制裁傷害）
        if (target.deathCtDamage && (target.ct || 0) > 0) {
            const deathDmg = (target.ct || 0) * 10;
            safeLog(`💀 ${target.name} 發動【同歸於盡】！對全場造成 ${deathDmg} 點制裁傷害 (自身CT: ${target.ct})！`);
            const hero = this._activeHero;
            if (hero && hero.hp > 0) {
                this.applyDamageToTarget(hero, deathDmg, safeLog, pool, target, { noProc: true, noScale: true });
            }
            pool.filter(e => e !== target && e.hp > 0).forEach(e => {
                this.applyDamageToTarget(e, deathDmg, safeLog, pool, target, { noProc: true, noScale: true });
            });
        }

        // 友軍死亡連動（覺醒等）：通知所有仍存活敵人身上的 onAllyDeath hook
        pool.forEach(e => {
            if (e !== target && e.hp > 0) {
                EffectEngine.runHook('onAllyDeath', e, {
                    dead: target, killer, hero: this._activeHero,
                    enemies: pool, log: safeLog, combatSys: this
                });
            }
        });
    }

    // 🟢 新增：統一的「即死」結算入口，跳過一般傷害計算，但仍觸發懸賞金結算，
    // 避免各卡片各自直接寫 target.hp = 0 導致懸賞等收尾邏輯被繞過
    static forceKill(target, logCallback) {
        if (!target || target.hp <= 0) return;
        target.hp = 0;
        this._handleEnemyDeath(target, this._activeHero, logCallback, null, { cause: 'DAMAGE' });
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
        const healAmount = (bleedLayers + shockLayers)*4;
        if (healAmount <= 0) return;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
        logCallback(`🩸⚡ ${attacker.name} 汲取流血與電擊之力，回復 ${healAmount} 點HP！`);
    }

        // 🟢 意圖預告用：把 desc 內「N 點(真實/普攻)傷害」的數字換算成套用 dmgMul 後的實際數字
    // 只改顯示，不動 intent 本身；沒有 dmgMul 時原樣回傳。
    // 多段攻擊(「3 次 1 點傷害」)換算的是每一擊的數字，與實際結算方式一致
    static getIntentDisplayDesc(enemy) {
        const intent = enemy.currentIntent;
        if (!intent || !intent.desc) return '無';
        const mul = enemy.dmgMul || 1;
        if (mul <= 1) return intent.desc;
        return intent.desc.replace(
            /(\d+)(\s*點(?:真實|普攻)?傷害)/g,
            (m, n, tail) => `${Math.round(Number(n) * mul)}${tail}`
        );
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
        hero._iaidoConsumedStacks = 0;
        // 🟢 閃避次數與護甲受擊狀態同屬「單場戰鬥內臨時狀態」，
        // 上一場戰鬥結束時沒清空的話，玩家還沒開打就帶著上一場的閃避次數／破防倒數進場
        hero.dodgeCount = 0;
        hero.armorHits = 0;
        hero.isVulnerable = false;
        hero.bleedStacks = 0;

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
                return !(def && (def.category === 'CARD_EFFECT' || def.category === 'DEBUFF_LIKE' || def.category === 'DEBUFF'));
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

        hero.firstStrikeUsed = false;
        hero._firstStrikeWindow = null;

        // 🟢 併入：DICE 計數器 used 歸零（原本獨立寫在 BattleScene.create()，統一到這裡管理，
        // 避免「單場戰鬥該清空什麼」分散在兩個地方查詢）
        ['reroll_attack_dice', 'reroll_speed_dice'].forEach(id => {
            const entry = EffectEngine.getEntry(hero, id);
            if (entry) entry.used = 0;
        });
    }

    // === 即時計算 Helper（方案A：不存欄位，每次讀取當下 HP 現算）===


    // 🟢 實際盜取 = min(持有金幣, 數量)，記入 thief.stolenGold（被擊殺時返還一半）
    static stealGold(thief, victim, amount, logCallback) {
        const safeLog = typeof logCallback === 'function' ? logCallback : console.log;
        const actual = Math.min(victim.gold || 0, amount || 0);
        if (actual <= 0) {
            safeLog(`💰 ${thief.name} 想搶劫，但你身上沒有金幣可搶！`);
            return;
        }
        victim.gold -= actual;
        thief.stolenGold = (thief.stolenGold || 0) + actual;
        safeLog(`💰 ${thief.name} 搶走了你 ${actual} 金幣！`);
    }

    // 🟢 脫離戰鬥：不算擊殺，跳過賞金/返還/詛咒
    static escapeFromBattle(enemy, logCallback) {
        const safeLog = typeof logCallback === 'function' ? logCallback : console.log;
        enemy.escaped = true;
        enemy.hp = 0;
        safeLog(`🏃 ${enemy.name} 成功逃離了戰鬥！`);
        this._handleEnemyDeath(enemy, null, safeLog, null, { cause: 'ESCAPE' });
    }

    static selfDestruct(attacker, target, enemies, logCallback) {
        const safeLog = typeof logCallback === 'function' ? logCallback : console.log;
        const dmg = (attacker.atk || 0) + (attacker.critBonus || 0);
        safeLog(`💥 ${attacker.name} 引爆自身，對 ${target.name} 造成 ${dmg} 點爆擊傷害！`);
        this.applyDamageToTarget(target, dmg, safeLog, enemies, attacker);
        if (attacker.hp > 0) {   // 防呆：造成傷害過程若已被反擊等機制殺死，避免二次死亡結算
            attacker.hp = 0;
            this._handleEnemyDeath(attacker, null, safeLog, enemies, { cause: 'SELF_DESTRUCT' });
        }
    }

    // 🟢 可被「手動選取／嘲諷選定」的敵人（寨主：有指定友軍在場時不可選）
    static getTargetableEnemies(enemies) {
        const alive = (enemies || []).filter(e => e.hp > 0);
        const result = alive.filter(e => {
            const guards = e.untargetableWhileAlliesAlive;
            if (!guards || guards.length === 0) return true;
            return !alive.some(o => o !== e && guards.includes(o.id));
        });
        return result.length > 0 ? result : alive;
    }

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
    
}