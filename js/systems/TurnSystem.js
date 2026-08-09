import { CombatSystem } from './CombatSystem.js';

export class TurnSystem {
    static startTurn(hero, enemies, turnCount, log) {
        hero.mana = hero.maxMana;
        if (hero.cdActiveSkill > 0) hero.cdActiveSkill--;
        if (hero.isVulnerable) { hero.isVulnerable = false; hero.armorHits = 0; }

        if (turnCount === 1 && hero.startBlock > 0) {
            hero.block += hero.startBlock;
            log(`🛡️ [開局被動發動] 獲得 ${hero.startBlock} 點格擋！`, 'system');
        }

        // 🟢 新增：守護（戰鬥開始，血量每5點+1格擋 ×層數）
        if (turnCount === 1 && (hero.blessingGuardianStacks || 0) > 0) {
            const bonusBlock = Math.floor(hero.hp / 5) * hero.blessingGuardianStacks;
            if (bonusBlock > 0) {
                hero.block += bonusBlock;
                log(`🛡️ [加護:守護] 血量 ${hero.hp} 點，獲得 ${bonusBlock} 點格擋！`, 'system');
            }
        }

        // 🟢 新增：渾身（戰鬥開始，血量每10點攻擊/爆擊+1 ×層數，寫入 battleXxxBonus 累加桶）
        if (turnCount === 1 && (hero.blessingAllOutStacks || 0) > 0) {
            const bonusStat = Math.floor(hero.hp / 10) * hero.blessingAllOutStacks;
            if (bonusStat > 0) {
                hero.battleAtkBonus = (hero.battleAtkBonus || 0) + bonusStat;
                hero.battleCritBonus += bonusStat;
                log(`💪 [加護:渾身] 血量 ${hero.hp} 點，攻擊力與爆擊增益各 +${bonusStat}！`, 'system');
            }
        }

        if (hero.stigmaPerTurn > 0) {
            hero.stigma += hero.stigmaPerTurn;
            log(`🔱 [回合被動發動] 對敵方施加 ${hero.stigmaPerTurn} 層聖痕 (現為 ${hero.stigma} 層)`, 'system');
        }

        // 🟢 新增：暴君（每回合開始，血量-3 ×層數，魔力+1 ×層數；若會扣死自己則整個效果不發動）
        if ((hero.blessingTyrantStacks || 0) > 0) {
            const dmg = 3 * hero.blessingTyrantStacks;
            const manaGain = hero.blessingTyrantStacks;
            if (hero.hp - dmg > 0) {
                hero.hp -= dmg;
                hero.mana += manaGain;
                log(`👑 [加護:暴君] 血量-${dmg}，魔力+${manaGain} (現魔力 ${hero.mana})`, 'system');
            } else {
                log(`👑 [加護:暴君] 血量不足以承受代價，本回合效果未發動`, 'system');
            }
        }

        enemies.forEach(enemy => {
            if (enemy.hp <= 0) return;
            if (enemy.isVulnerable) { enemy.isVulnerable = false; enemy.armorHits = 0; }
            if (turnCount > 1 && typeof enemy.onTurnEnd === 'function') {
                enemy.onTurnEnd((m) => log(m, 'system'));
            }
            enemy.speedDice = Phaser.Math.Between(1, enemy.speedDiceSides || 6) + (enemy.speedBonus || 0);
            enemy.currentIntent = enemy.getIntent(turnCount, enemy.speedDice, enemy);
        });

        return { playerSpeedDice: Phaser.Math.Between(1, 6) + CombatSystem.getEffectiveSpeedBonus(hero) };
    }
}