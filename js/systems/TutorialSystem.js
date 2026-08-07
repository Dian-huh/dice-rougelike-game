import { TUTORIAL_PAGES } from '../data/tutorialData.js';

export class TutorialSystem {
    static hasSeenTutorial() {
        return localStorage.getItem('dice_roguelike_tutorial_seen') === 'true';
    }

    static markTutorialSeen() {
        localStorage.setItem('dice_roguelike_tutorial_seen', 'true');
    }

    static showTutorialUI(scene, onComplete) {
        let pageIndex = 0;
        const container = scene.add.container(0, 0).setDepth(4000);

        const overlay = scene.add.rectangle(425, 275, 850, 550, 0x000000, 0.93);
        overlay.setInteractive(); // 🟢 新增：攔截點擊，避免玩家隔著教學視窗點到底下的按鈕/手牌
        container.add(overlay);

        let titleText, bodyText, pageIndicator, nextBtn, skipBtn;

        function renderPage() {
            if (titleText) titleText.destroy();
            if (bodyText) bodyText.destroy();
            if (pageIndicator) pageIndicator.destroy();
            if (nextBtn) nextBtn.destroy();
            if (skipBtn) skipBtn.destroy();

            const page = TUTORIAL_PAGES[pageIndex];

            titleText = scene.add.text(425, 80, page.title, { fontSize: '22px', fill: '#ffcc00' }).setOrigin(0.5);

            const bodyStr = page.lines.join('\n\n');
            bodyText = scene.add.text(425, 240, bodyStr, {
                fontSize: '14px', fill: '#eeeeee', align: 'left',
                wordWrap: { width: 620 }, lineSpacing: 8
            }).setOrigin(0.5);

            pageIndicator = scene.add.text(425, 420, `${pageIndex + 1} / ${TUTORIAL_PAGES.length}`, {
                fontSize: '12px', fill: '#888888'
            }).setOrigin(0.5);

            const isLastPage = pageIndex === TUTORIAL_PAGES.length - 1;
            nextBtn = scene.add.text(425, 460, isLastPage ? '[ 我知道了，開始冒險！ ]' : '[ 下一頁 ▶ ]', {
                fontSize: '16px', fill: '#00ffaa', backgroundColor: '#222', padding: { x: 14, y: 8 }
            }).setOrigin(0.5)
              .setInteractive({ useHandCursor: true })
              .on('pointerdown', () => {
                  if (isLastPage) {
                      TutorialSystem.markTutorialSeen();
                      container.destroy();
                      if (typeof onComplete === 'function') onComplete();
                  } else {
                      pageIndex += 1;
                      renderPage();
                  }
              });

            container.add([titleText, bodyText, pageIndicator, nextBtn]);

            if (!isLastPage) {
                skipBtn = scene.add.text(760, 40, '跳過教學', {
                    fontSize: '12px', fill: '#888888'
                }).setInteractive({ useHandCursor: true })
                  .on('pointerdown', () => {
                      TutorialSystem.markTutorialSeen();
                      container.destroy();
                      if (typeof onComplete === 'function') onComplete();
                  });
                container.add(skipBtn);
            }
        }

        renderPage();
    }
}