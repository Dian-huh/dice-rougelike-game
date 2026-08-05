export class CombatSystem {
    static applyDamageToTarget(target, rawDmg, logCallback) {
        // 1. 🌀 閃避判定
        if (target.dodgeCount && target.dodgeCount > 0) {
            target.dodgeCount -= 1;
            if (logCallback) logCallback(`🌀 發動【閃避】！完全免疫本次 ${rawDmg} 點傷害`);
            return;
        }

        // 攻擊沒被閃避掉，視為「受到攻擊」，觸發受擊方的特殊機制 (例如黑龍的OD/Break)
        if (typeof target.onTakeDamage === 'function') {
            target.onTakeDamage();
        }

        let finalDmg = rawDmg;
        let logDetails = [];
        
        // 2. 破防加傷判定
        if (target.isVulnerable) {
            finalDmg += 2;
            logDetails.push(`破防+2`);
        }

        // 3. 格擋扣除
        if (target.block > 0) {
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

        // 4. 扣除 HP
        if (finalDmg > 0) {
            target.hp = Math.max(0, target.hp - finalDmg);
            let detailStr = logDetails.length > 0 ? ` (${logDetails.join(', ')})` : '';
            if (logCallback) logCallback(`💥 造成 ${finalDmg} 點傷害${detailStr} (剩餘 ${target.hp}/${target.maxHp} HP)`);
        } else {
            if (logCallback) logCallback(`🛡️ 傷害被完全抵銷！`);
        }

        // 5. 護甲破防判定
        target.armorHits++;
        if (target.armorHits >= target.armorMax && !target.isVulnerable) {
            target.isVulnerable = true;
            if (logCallback) logCallback(`⚠️ 護甲崩潰！進入【破防】狀態！`);
        }
    }

    static applyHealToHero(hero, baseHeal, logCallback) {
        const actualHeal = baseHeal * hero.healRatio;
        hero.hp = Math.min(hero.maxHp, hero.hp + actualHeal);
        if (logCallback) logCallback(`💚 回復 ${actualHeal} 點 HP (現有 ${hero.hp}/${hero.maxHp})`);
    }

    // js/systems/CombatSystem.js

    // 1. 處理【飛行】閃避
    applyDamage(attacker, defender, baseDamage, isNormalDiceAttack = false) {
        // 🦅 如果 defender 是黑龍且處於飛行狀態，普通攻擊骰打不中！
        if (defender.isFlying && isNormalDiceAttack) {
            return { damage: 0, msg: `💨 ${defender.name} 處於【飛翔】狀態，躲過了攻擊！` };
        }
        
        // 正常結算傷害
        let actualDamage = Math.max(0, baseDamage - (defender.block || 0));
        defender.hp = Math.max(0, defender.hp - actualDamage);

        // 🔥 觸發黑龍受擊時的 OD / Break 能量計算
        if (typeof defender.onTakeDamage === 'function') {
            defender.onTakeDamage(actualDamage);
        }

        return { damage: actualDamage };
    }

    // 2. 回合結束觸發【劇毒】與【CT 增加】
    onTurnEnd(entity) {
        let logs = [];
        
        // 🤢 劇毒扣血：每執行一個動作受 1 點傷害，持續 3 回合
        if (entity.poisonTurns && entity.poisonTurns > 0) {
            entity.hp = Math.max(0, entity.hp - 1);
            entity.poisonTurns -= 1;
            logs.push(`🤢 ${entity.name} 受到【劇毒】侵蝕，扣除 1 點 HP！(剩餘 ${entity.poisonTurns} 回合)`);
        }

        // ⚡ 呼叫黑龍的回合結束觸發器 (自動增加 CT)
        if (typeof entity.onTurnEnd === 'function') {
            entity.onTurnEnd();
        }

        return logs;
    }
}