export class TurnSystem {
    static startTurn(hero, enemies, turnCount, log) {
        hero.mana = hero.maxMana;
        if (hero.cdActiveSkill > 0) hero.cdActiveSkill--;
        if (hero.isVulnerable) { hero.isVulnerable = false; hero.armorHits = 0; }

        if (turnCount === 1 && hero.startBlock > 0) {
            hero.block += hero.startBlock;
            log(`🛡️ [開局被動發動] 獲得 ${hero.startBlock} 點格擋！`, 'system');
        }
        if (hero.stigmaPerTurn > 0) {
            hero.stigma += hero.stigmaPerTurn;
            log(`🔱 [回合被動發動] 對敵方施加 ${hero.stigmaPerTurn} 層聖痕 (現為 ${hero.stigma} 層)`, 'system');
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

        return { playerSpeedDice: Phaser.Math.Between(1, 6) + hero.speedBonus };
    }
}