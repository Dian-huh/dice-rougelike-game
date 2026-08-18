// js/data/enemyTemplate.js

/**
 * 所有怪物的基礎契約範本 (Enemy Base Interface)
 */
export const ENEMY_TEMPLATE = {
    // === 1. 基礎屬性 ===
    id: '', 
    name: '', 
    hp: 0, 
    maxHp: 0, 
    atk: 0,
    block: 0,
    speedDiceSides: 6,

    // === 2. 核心戰鬥資源槽 ===
    ct: 0,
    maxCt: 3,      // CT 自動充能槽 (滿額可用於解除 Break 或釋放大招)
    od: 0,
    maxOd: 10,     // OD 槽 (滿值進 OD 狂暴，歸零進 Break)

    // === 3. 核心狀態標記 ===
    isOD: false,    // 是否處於 OD 狂暴狀態 (攻擊 100% 暴擊)
    isBreak: false, // 是否處於 Break 癱瘓狀態 (僅能使用一般行動)
    isFlying: false,
    chargeTurns: 0,   // 🟢 新增：衝鋒效果剩餘回合數（0 = 未生效）
    heroicTurns: 0,   // 🟢 新增：英勇效果剩餘回合數（0 = 未生效）

    // === 4. 機制邏輯：受擊觸發 (On Take Damage) ===
    onTakeHit(log) {
        const safeLog = typeof log === 'function' ? log : console.log;

        // 常態受擊：OD +1
        if (!this.isOD && !this.isBreak) {
            this.od = Math.min(this.maxOd, this.od + 1);
            if (this.od >= this.maxOd) {
                this.isOD = true;
                //safeLog(`🔥 ${this.name} 的 OD 槽已滿！進入【OD 狂暴狀態】(所有攻擊必定爆擊)！`);
            }
        } 
        // OD 狀態受擊：OD -1
        else if (this.isOD) {
            this.od = Math.max(0, this.od - 1);
            if (this.od <= 0) {
                this.isOD = false;
                this.isBreak = true;
                //safeLog(`💫 ${this.name} 的 OD 被徹底清空！陷入【Break 癱瘓狀態】！`);
            }
        }
    },

    // === 5. 機制邏輯：回合結束觸發 (On Turn End) ===
    onTurnEnd(log) {
        const safeLog = typeof log === 'function' ? log : console.log;

        // CT 每回合自動 +1
        this.ct = Math.min(this.maxCt, this.ct + 1);

        // Break 狀態下，若 CT 達到最大值，消耗所有 CT 自動解除 Break
        if (this.isBreak && this.ct >= this.maxCt) {
            this.ct = 0;
            this.isBreak = false;
            safeLog(`✨ ${this.name} 消耗了滿額 CT，成功【解除 Break 狀態】！`);
        }

        // 🟢 衝鋒效果倒數：到期時歸還 OD 上限與爆擊增益的加值
        if (this.chargeTurns > 0) {
            this.chargeTurns -= 1;
            if (this.chargeTurns <= 0) {
                this.maxOd = Math.max(1, this.maxOd - 1);
                this.critBonus = Math.max(0, (this.critBonus || 0) - 1);
                this.od = Math.min(this.od, this.maxOd); // 🟢 新增：避免 od 超過新的上限，造成顯示與判定不一致
                safeLog(`⚡ ${this.name} 的【衝鋒】效果已結束`);
            }
        }

        // 🟢 英勇效果：回合結束時持續回復HP與格擋，並倒數
        if (this.heroicTurns > 0) {
            this.hp = Math.min(this.maxHp, this.hp + 3);
            this.block = (this.block || 0) + 2;
            safeLog(`🔥 ${this.name} 的【英勇】效果發動：回復 3 點HP、獲得 2 點格擋`);
            this.heroicTurns -= 1;
        }
    },

    // === 6. 通用 UI 狀態資訊列 ===
    getStatusLine() {
        const parts = [];
        if (this.maxCt > 0) parts.push(`CT: ${this.ct}/${this.maxCt}`);
        if (this.maxOd > 0) parts.push(`OD: ${this.od}/${this.maxOd}`);
        
        const tags = [];
        if (this.isOD) tags.push('🔥[OD狂暴]');
        if (this.isBreak) tags.push('💫[Break癱瘓]');
        if (this.isFlying) tags.push('🦅[飛行]');
        if (this.chargeTurns > 0) tags.push(`⚡[衝鋒x${this.chargeTurns}]`);   // 🟢 新增
        if (this.heroicTurns > 0) tags.push(`🌟[英勇x${this.heroicTurns}]`); // 🟢 新增
        if (tags.length > 0) parts.push(`狀態: ${tags.join(' ')}`);

        return parts.length > 0 ? `\n  ${parts.join(' | ')}` : '';
    },

    // === 7. 契約規範方法 (新增怪物必須 Override，否則會丟出明確錯誤) ===
    getIntent(turnCount, speedDice, self) { 
        throw new Error(`[${this.name || this.id}] 未實作 getIntent() 方法！`); 
    },

    executeAction(self, intent, target, combatSys, log, enemies) { 
        throw new Error(`[${this.name || this.id}] 未實作 executeAction() 方法！`); 
    }
};