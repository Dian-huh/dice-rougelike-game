import { TUTORIAL_PAGES } from '../data/tutorialData.js';
import { fullOverlay, CX, X, Y, S, px } from '../config/layout.js';

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

        // fullOverlay 本身已可互動：攔截點擊，避免玩家隔著教學視窗點到底下的按鈕/手牌
        const overlay = fullOverlay(scene, 0.93);
        container.add(overlay);

        let titleText, bodyText, pageIndicator, nextBtn, skipBtn;

        function renderPage() {
            if (titleText) titleText.destroy();
            if (bodyText) bodyText.destroy();
            if (pageIndicator) pageIndicator.destroy();
            if (nextBtn) nextBtn.destroy();
            if (skipBtn) skipBtn.destroy();

            const page = TUTORIAL_PAGES[pageIndex];

            titleText = scene.add.text(CX, Y(80), page.title, { fontSize: px(22), fill: '#ffcc00' }).setOrigin(0.5);

            const bodyStr = page.lines.join('\n\n');
            bodyText = scene.add.text(CX, Y(240), bodyStr, {
                fontSize: px(14), fill: '#eeeeee', align: 'left',
                wordWrap: { width: S(620) }, lineSpacing: S(8)
            }).setOrigin(0.5);

            pageIndicator = scene.add.text(CX, Y(420), `${pageIndex + 1} / ${TUTORIAL_PAGES.length}`, {
                fontSize: px(12), fill: '#888888'
            }).setOrigin(0.5);

            const isLastPage = pageIndex === TUTORIAL_PAGES.length - 1;
            nextBtn = scene.add.text(CX, Y(460), isLastPage ? '[ 我知道了，開始冒險！ ]' : '[ 下一頁 ▶ ]', {
                fontSize: px(16), fill: '#00ffaa', backgroundColor: '#222', padding: { x: S(14), y: S(8) }
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
                skipBtn = scene.add.text(X(760), Y(40), '跳過教學', {
                    fontSize: px(12), fill: '#888888'
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