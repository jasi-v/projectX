const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.goto('http://localhost:5000');
    await page.type('#qr-data', 'test data');
    await page.type('#password', 'mypassword');
    await page.click('#generate-btn');
    await page.waitForTimeout(2000);
    await browser.close();
})();
