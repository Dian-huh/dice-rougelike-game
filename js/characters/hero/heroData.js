import { BASE_CHARACTER_FIELDS } from '../characterBaseFields.js';

export const HERO_DATA = {
    id: 'hero',
    name: '勇者',
    description: '均衡型角色，技能組完整涵蓋攻擊、防禦與聖痕流派，適合新手熟悉戰鬥系統。',
    ...BASE_CHARACTER_FIELDS,
    hp: 20, maxHp: 20,
    atk: 3,
    critBonus: 2,
    mana: 3, maxMana: 3,
    healRatio: 1,
    speedBonus: 0,
    atkCount: 1,
    armorMax: 3,

    // 🟢 新增：scope 標籤，供 BattleScene 判斷是否需要跳出目標選擇 UI
    //   SINGLE_ENEMY -> 需要指定敵方目標（若場上僅剩1隻敵人則自動選定，不用多點一次）
    //   ALL_ENEMIES  -> 對所有存活敵人各自結算（維持原本全體攻擊行為）
    //   SELF         -> 純自身效果，不需要任何目標選擇

    diceSkills: {
        // 技能1（原本用 hero.atk）
        1: {
            name: '普通攻擊',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log) => {
                const atkVal = combatSys.getEffectiveAtk(hero);
                log(`⚔️ 觸發 [1:普通攻擊] 造成 ${atkVal} 基礎傷害`);
                combatSys.applyDamageToTarget(enemy, atkVal, log);
            }
        },
        2: {
            name: '技能1',
            scope: 'SELF',
            execute: (hero, enemy, combatSys, log) => {
                hero.battleCritBonus += 1;   // 🟢 改為累加到戰鬥內臨時欄位
                hero.battleHealBonus += 1;   // 🟢 改為累加到戰鬥內臨時欄位
                log(`✨ 觸發 [2:技能1] 爆擊增益+1 (現為${hero.critBonus + hero.battleCritBonus})，回復量比值+1 (現為${hero.healRatio + hero.battleHealBonus})`);
            }
        },
        3: {
            name: '爆擊攻擊',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log) => {
                let critDmg = combatSys.getEffectiveAtk(hero) + combatSys.getEffectiveCritBonus(hero);
                log(`💥 觸發 [3:爆擊攻擊] 造成 ${critDmg} 點傷害！`);
                combatSys.applyDamageToTarget(enemy, critDmg, log);
            }
        },
        // 技能4（其餘 log 文字沿用 hero.critBonus+hero.battleCritBonus 的地方也建議一併換成 getEffectiveCritBonus，避免顯示與實際傷害對不上）
        4: {
            name: '技能2',
            scope: 'ALL_ENEMIES',
            execute: (hero, enemy, combatSys, log) => {
                let s2Dmg = combatSys.getEffectiveAtk(hero) + combatSys.getEffectiveCritBonus(hero);
                let enemyWasVulnerable = enemy.isVulnerable;
                log(`💥 觸發 [4:技能2] 造成 ${s2Dmg} 點爆擊傷害！`);
                combatSys.applyDamageToTarget(enemy, s2Dmg, log);
                hero.battleCritBonus += 3;
                if (enemyWasVulnerable || enemy.isVulnerable) {
                    hero.battleCritBonus += 6;
                    // 下面兩行 log 內的 hero.critBonus + hero.battleCritBonus 建議也換成 combatSys.getEffectiveCritBonus(hero)
                }
            }
        },
        5: {
            name: '閃避',
            scope: 'SELF',
            execute: (hero, enemy, combatSys, log) => {
                hero.dodgeCount += 1;
                log(`🌀 觸發 [5:閃避] 獲得 1 次閃避狀態！將完全免疫下 1 次攻擊傷害 (現有閃避: ${hero.dodgeCount} 次)`);
            }
        },
        // 技能6
        6: {
            name: '技能3',
            scope: 'SINGLE_ENEMY',
            execute: (hero, enemy, combatSys, log) => {
                let s3Dmg = 3 + combatSys.getEffectiveCritBonus(hero) + hero.stigma;
                log(`🗡️ 觸發 [6:技能3] 造成 ${s3Dmg} 點傷害！`);
                combatSys.applyDamageToTarget(enemy, s3Dmg, log);
                combatSys.applyHealToHero(hero, 1 + hero.stigma, log);
            }
        }
    }
};