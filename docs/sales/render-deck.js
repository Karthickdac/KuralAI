const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath:
      process.env.CHROME_PATH ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  const fileUrl = 'file://' + path.resolve(__dirname, 'deck.html');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));

  const out = path.resolve(__dirname, '..', 'KuralAI-Sales-Deck.pdf');
  await page.pdf({
    path: out,
    width: '1280px',
    height: '720px',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await browser.close();
  console.log('Sales deck PDF written to', out);
})();
