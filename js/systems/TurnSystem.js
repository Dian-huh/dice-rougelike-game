import { CombatSystem } from './CombatSystem.js';
import { EffectEngine } from './EffectEngine.js'; 

export class TurnSystem {
    static startTurn(hero, enemies, turnCount, log) {
        hero.mana = hero.maxMana;
        if (hero.cdActiveSkill > 0) hero.cdActiveSkill--;
        if (hero.isVulnerable) { hero.isVulnerable = false; hero.armorHits = 0; }
        hero.turnSpeedBonus = 0;   // 🟢 賄絡用：本回合速度加成，每回合開始重置
        hero.freeGoldCardsThisTurn = false;
        if (turnCount === 1 && hero.startBlock > 0) {
            hero.block += hero.startBlock;
            log(`🛡️ [開局被動發動] 獲得 ${hero.startBlock} 點格擋！`, 'system');
        }

        // 🟢 取代：原本守護/渾身/聖痕君臨/暴君 4 段散落判斷式，改由引擎跑 hook
        const ctx = { log };
        EffectEngine.runHook('onTurnStart', hero, ctx);

        enemies.forEach(enemy => {
            if (enemy.hp <= 0) return;
            if (enemy.isVulnerable) { enemy.isVulnerable = false; enemy.armorHits = 0; }
            if (turnCount > 1 && typeof enemy.onTurnEnd === 'function') {
                enemy.onTurnEnd((m) => log(m, 'system'));
            }
            EffectEngine.runHook('onTurnStart', enemy, { log: (m) => log(m, 'system') });   // 🟢 新增
            enemy.speedDice = Phaser.Math.Between(1, enemy.speedDiceSides || 6) + CombatSystem.getEffectiveEnemySpeedBonus(enemy);
            enemy.currentIntent = enemy.getIntent(turnCount, enemy.speedDice, enemy);
            enemy.currentIntent = CombatSystem.applyStunOverride(enemy, enemy.currentIntent); 
            enemy._intentLockedInBreak = enemy.isBreak;
        });
        // 🟢 融合判定：CT 回復完成後檢查，融合出的敵人當回合就擲速度骰並有預告意圖
        const fused = CombatSystem.tryFusion(enemies, (m) => log(m, 'system'));
        if (fused) {
            fused.speedDice = Phaser.Math.Between(1, fused.speedDiceSides || 6) + CombatSystem.getEffectiveEnemySpeedBonus(fused);
            fused.currentIntent = fused.getIntent(turnCount, fused.speedDice, fused);
            fused.currentIntent = CombatSystem.applyStunOverride(fused, fused.currentIntent);
            fused._intentLockedInBreak = fused.isBreak;
        }
        return { playerSpeedDice: Phaser.Math.Between(1, 6) + CombatSystem.getEffectiveSpeedBonus(hero) };
    }
}