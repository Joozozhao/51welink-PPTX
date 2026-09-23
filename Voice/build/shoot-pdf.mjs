import { chromium } from 'file:///Users/joozo/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + process.cwd() + '/index.html');
await page.addStyleTag({ content: '.deck-download { display: none !important; }' });
await page.waitForTimeout(2500); // 字体与图片加载
const total = await page.evaluate(() => deck.slides.length);
for (let i = 0; i < total; i++) {
    await page.evaluate((n) => deck.showSlide(n), i);
    await page.waitForTimeout(1100);  // reveal 动画播完
    await page.screenshot({ path: `build/shots-pdf/slide-${String(i+1).padStart(2,'0')}.png` });
}
await browser.close();
console.log(total + ' slides shot (no download buttons)');
