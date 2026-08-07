export const HERO_DATA = {
    id: 'hero',
    name: '勇者',
    hp: 20, maxHp: 20,
    atk: 3,
    critBonus: 2,
    battleCritBonus: 0,    // 🟢 新增：戰鬥內臨時爆擊增益（來自骰面2/骰面4觸發，每場戰鬥結束重置）
    healRatio: 1,           // 永久回復比值基礎值（目前無獎勵來源，保留供未來擴充）
    battleHealBonus: 0,    // 🟢 新增：戰鬥內臨時回復加成（來自骰面2觸發，每場戰鬥結束重置）
    mana: 3, maxMana: 3,
    healRatio: 1,      
    speedBonus: 0,     
    atkCount: 1,       
    armorMax: 3,       
    armorHits: 0,      
    isVulnerable: false,
    block: 0,          
    dodgeCount: 0,     
    doubleNextAction: false, // ⚡ 新增：下一次攻擊骰行動是否執行 2 次
    poisonTurns: 0,    // 🐉 黑龍【吐息】劇毒：每執行一個動作扣1點HP，持續回合數歸零後解除
    isPressured: false, // 🐉 黑龍【威壓】：下次攻擊骰鎖定為1，且本回合無法使用主動技
    stigma: 0, 
    stigmaPerTurn: 0,   // 🟢 新增：聖痕君臨被動 - 每回合開始施加的聖痕層數（可疊加）  
    gold: 0,      
    cdActiveSkill: 0,  
    overrideDice: null,

    

    diceSkills: {
        1: {
            name: '普通攻擊',
            execute: (hero, enemy, combatSys, log) => {
                log(`⚔️ 觸發 [1:普通攻擊] 造成 ${hero.atk} 基礎傷害`);
                combatSys.applyDamageToTarget(enemy, hero.atk, log);
            }
        },
        2: {
            name: '技能1',
            execute: (hero, enemy, combatSys, log) => {
                hero.battleCritBonus += 1;   // 🟢 改為累加到戰鬥內臨時欄位
                hero.battleHealBonus += 1;   // 🟢 改為累加到戰鬥內臨時欄位
                log(`✨ 觸發 [2:技能1] 爆擊增益+1 (現為${hero.critBonus + hero.battleCritBonus})，回復量比值+1 (現為${hero.healRatio + hero.battleHealBonus})`);
            }
        },
        3: {
            name: '爆擊攻擊',
            execute: (hero, enemy, combatSys, log) => {
                let critDmg = hero.atk + hero.critBonus + hero.battleCritBonus;  // 🟢 加總永久+臨時
                log(`💥 觸發 [3:爆擊攻擊] 造成 ${critDmg} 點傷害！`);
                combatSys.applyDamageToTarget(enemy, critDmg, log);
            }
        },
        4: {
            name: '技能2',
            execute: (hero, enemy, combatSys, log) => {
                let s2Dmg = hero.atk + hero.critBonus + hero.battleCritBonus;  // 🟢 加總永久+臨時

                let enemyWasVulnerable = enemy.isVulnerable;
                log(`💥 觸發 [4:技能2] 造成 ${s2Dmg} 點爆擊傷害！`);
                combatSys.applyDamageToTarget(enemy, s2Dmg, log);
                hero.battleCritBonus += 2;
                if (enemyWasVulnerable || enemy.isVulnerable) {
                    hero.battleCritBonus += 4;  // 🟢 這是戰鬥中觸發的加成，改為累加到臨時欄位
                    if (enemyWasVulnerable) {
                        log(`🎯 技能2成功命中破防敵人！爆擊增益 +4 (現為 +${hero.critBonus + hero.battleCritBonus})`);
                    } else {
                        log(`🎯 技能2成功將敵人【打破防】！觸發額外效果，爆擊增益 +4 (現為 +${hero.critBonus + hero.battleCritBonus})`);
                    }
                }
            }
        },
        5: {
            name: '閃避',
            execute: (hero, enemy, combatSys, log) => {
                hero.dodgeCount += 1;
                log(`🌀 觸發 [5:閃避] 獲得 1 次閃避狀態！將完全免疫下 1 次攻擊傷害 (現有閃避: ${hero.dodgeCount} 次)`);
            }
        },
        6: {
            name: '技能3',
            execute: (hero, enemy, combatSys, log) => {
                let s3Dmg = 3 + hero.critBonus + hero.battleCritBonus + hero.stigma;  // 🟢 加總永久+臨時
                log(`🗡️ 觸發 [6:技能3] 造成 ${s3Dmg} 點傷害！`);
                combatSys.applyDamageToTarget(enemy, s3Dmg, log);
                combatSys.applyHealToHero(hero, 1 + hero.stigma, log);
            }
        }
    }
};