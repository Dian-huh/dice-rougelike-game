import { HERO_DECK } from '../characters/hero/heroCards.js';

export class RewardSystem {
    static showRewardUI(scene, stageData) {
        // 如果傳進來的 stageData 為空，給予安全保底
        const config = (stageData && stageData.rewardConfig) ? stageData.rewardConfig : { baseGold: 15 };
        const stageName = (stageData && stageData.name) ? stageData.name : '戰鬥';
        
        if (config.baseGold) {
            scene.hero.gold = (scene.hero.gold || 0) + config.baseGold;
        }

        const rewardContainer = scene.add.container(0, 0);
        let overlay = scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.9);
        let title = scene.add.text(280, 50, `🏆 ${stageName} 戰鬥獲勝！`, { fontSize: '20px', fill: '#ffcc00' });
        let subTitle = scene.add.text(310, 85, `💰 基本戰利品：金幣 +${config.baseGold} (現有: ${scene.hero.gold} Gold)`, { fontSize: '13px', fill: '#00ffaa' });

        rewardContainer.add([overlay, title, subTitle]);

        const rewardList = this.generateRewards([scene.hero]);

        rewardList.forEach((reward, index) => {
            let cardBg = scene.add.rectangle(index * 230 + 190, 240, 200, 200, 0x222233)
                .setStrokeStyle(2, 0x00ffff)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    // 🟢 1. 執行獎勵效果
                    reward.apply(scene);
                    
                    // 🟢 2. 銷毀 UI 介面
                    rewardContainer.destroy();
                    
                    // 🟢 3. 明確呼叫 BattleScene 的 nextStage() 切換下一層
                    if (scene && typeof scene.nextStage === 'function') {
                        scene.nextStage();
                    }
                });

            let nameText = scene.add.text(index * 230 + 100, 160, reward.title, { fontSize: '14px', fill: '#ffffff', wordWrap: { width: 180 } });
            let descText = scene.add.text(index * 230 + 100, 210, reward.desc, { fontSize: '12px', fill: '#aaaaaa', wordWrap: { width: 180 } });
            let selectBtn = scene.add.text(index * 230 + 140, 310, '[ 選擇此項 ]', { fontSize: '13px', fill: '#00ffaa' });

            rewardContainer.add([cardBg, nameText, descText, selectBtn]);
        });

        let skipBtn = scene.add.text(280, 410, '[ 🚫 跳過獎勵：換取 +20 金幣 & 恢復 5 HP ]', { fontSize: '14px', fill: '#ff6666', backgroundColor: '#222', padding: { x: 10, y: 5 } })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                scene.hero.gold = (scene.hero.gold || 0) + 20;
                scene.hero.hp = Math.min(scene.hero.maxHp, scene.hero.hp + 5);
                scene.appendLog(`🚫 跳過獎勵：獲得 +20 金幣，並恢復 5 HP`, 'system');
                
                // 🟢 銷毀 UI 並進入下一層
                rewardContainer.destroy();
                if (scene && typeof scene.nextStage === 'function') {
                    scene.nextStage();
                }
            });

        rewardContainer.add(skipBtn);
        rewardContainer.setDepth(2000);
    }

    static generateRewards(party = []) {
        const rewardTypes = ['CARD', 'TEAM_STAT', 'TARGET_STAT', 'RANDOM_STAT', 'PASSIVE_BUFF', 'STIGMA_PASSIVE'];
        const shuffledTypes = rewardTypes.sort(() => 0.5 - Math.random()).slice(0, 3);

        return shuffledTypes.map(type => this.createRewardItem(type, party));
    }

    static createRewardItem(type, party) {
        switch (type) {
            case 'CARD': {
                const randomCard = HERO_DECK[Math.floor(Math.random() * HERO_DECK.length)];
                return {
                    title: `🎴 [卡牌] ${randomCard.name}`,
                    desc: `(${randomCard.cost}費) ${randomCard.desc}`,
                    apply: (scene) => {
                        scene.deckSys.originalDeck.push(randomCard);
                        scene.appendLog(`🎁 獲得新卡片：[${randomCard.name}]！`, 'system');
                    }
                };
            }
            case 'TEAM_STAT': {
                const hpAmount = Math.floor(Math.random() * 2) + 2;
                return {
                    title: `🛡️ [全隊成長] 全員體力`,
                    desc: `全隊最大 HP +${hpAmount}，並恢復 ${hpAmount} HP (可永久疊加)`,
                    apply: (scene) => {
                        scene.hero.maxHp += hpAmount;
                        scene.hero.hp = Math.min(scene.hero.maxHp, scene.hero.hp + hpAmount);
                        scene.appendLog(`✨ 全隊最大 HP +${hpAmount}！現上限: ${scene.hero.maxHp}`, 'system');
                    }
                };
            }
            case 'TARGET_STAT': {
                return {
                    title: `⚔️ [指定灌注] 力量注入`,
                    desc: `指定一名角色：基礎攻擊力 +1 (可永久疊加)`,
                    apply: (scene) => {
                        scene.hero.atk += 1;
                        scene.appendLog(`✨ ${scene.hero.name} 基礎攻擊力 +1！現攻擊力: ${scene.hero.atk}`, 'system');
                    }
                };
            }
            case 'RANDOM_STAT': {
                const critAmount = Math.floor(Math.random() * 2) + 1;
                return {
                    title: `🎲 [隨機暴升] 爆擊修練`,
                    desc: `隨機 1 名角色：爆擊增益 +${critAmount} (可永久疊加)`,
                    apply: (scene) => {
                        scene.hero.critBonus += critAmount;
                        scene.appendLog(`✨ ${scene.hero.name} 爆擊增益 +${critAmount}！現增益: +${scene.hero.critBonus}`, 'system');
                    }
                };
            }
            case 'PASSIVE_BUFF': {
                return {
                    title: `🌀 [隊伍被動] 開局護盾`,
                    desc: `每場戰鬥開局獲得 +3 點額外格擋 (可無限疊加)`,
                    apply: (scene) => {
                        scene.hero.startBlock = (scene.hero.startBlock || 0) + 3;
                        scene.appendLog(`✨ 獲得被動：每場戰鬥開局自動獲得 ${scene.hero.startBlock} 點格擋！`, 'system');
                    }
                };
            }
            case 'STIGMA_PASSIVE': {
                return {
                    title: `🔱 [隊伍被動] 聖痕君臨`,
                    desc: `每回合開始時，自動對敵方施加 1 層聖痕 (可無限疊加，隨戰鬥回合數持續增強)`,
                    apply: (scene) => {
                        scene.hero.stigmaPerTurn = (scene.hero.stigmaPerTurn || 0) + 1;
                        scene.appendLog(`✨ 獲得被動：每回合自動施加 ${scene.hero.stigmaPerTurn} 層聖痕！`, 'system');
                    }
                };
            }
        }
    }
}