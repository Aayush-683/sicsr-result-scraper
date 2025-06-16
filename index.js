require('fix-esm').register();
const { chromium } = require('playwright');
const fs = require('fs');
const { fetch } = require('undici');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

const BASE_URL = 'https://siuexam.siu.edu.in/forms/resultview.html';
const SELECTORS = {
    loginInput: '#login',
    loginBtn: '#lgnbtn',
    seatInput: 'xpath=//html/body/div[2]/form/div/div[1]/div[2]/div/div/div/div/div/input[1]',
    viewBtn: 'xpath=//html/body/div[2]/form/div/div[1]/div[2]/div/div/div/div/div/input[2]',
    resultLink: 'xpath=//html/body/div[2]/form/div/div[2]/div[1]/a',
};

const PRN = '22030121307';
const SEAT_NO = '500002';
const OUTPUT_FILE = `${PRN}.pdf`;

async function runScraper() {
    console.log('[*] Launching browser...');
    const browser = await chromium.launch({ headless: false }); // Show browser
    const page = await browser.newPage();

    try {
        console.log('[*] Navigating to the results page...');
        await page.goto(BASE_URL);

        console.log('[*] Logging in...');
        await page.fill(SELECTORS.loginInput, PRN);
        await page.click(SELECTORS.loginBtn);

        console.log('[*] Entering seat number...');
        
        // Check if result is declared (div id='seatnum' has text)
        const seatNumDiv = await page.waitForSelector('#seatnum', { timeout: 5000 });
        const seatNumText = await seatNumDiv.textContent();
        if (seatNumText.trim() === 'Result not available !!' || seatNumText.includes('Result not yet declared')) {
            console.error('[✖] Result not available or not yet declared for this seat number.');
            return;
        }

        await page.fill(SELECTORS.seatInput, SEAT_NO);
        await page.click(SELECTORS.viewBtn);

        console.log('[*] Waiting for result link...');
        const resultElement = await retry(() => page.waitForSelector(SELECTORS.resultLink, { timeout: 5000 }));
        const resultHref = await resultElement.getAttribute('href');
        if (!resultHref) throw new Error('No href found for result link');

        const resultUrl = new URL(resultHref, BASE_URL).href;
        console.log(`[*] Result URL: ${resultUrl}`);

        let response = await retry(async () => {
            const res = await fetch(resultUrl);
            if (res.status !== 200) throw new Error('Failed to fetch PDF');
            return res;
        });

        console.log('[*] Downloading PDF...');
        const writeStream = fs.createWriteStream(OUTPUT_FILE);
        await streamPipeline(response.body, writeStream);
        console.log(`[✔] PDF saved as ${OUTPUT_FILE}`);
    } catch (err) {
        console.error(`[✖] Error: ${err.message}`);
        throw err;
    } finally {
        await browser.close();
        console.log('[*] Browser closed');
    }
}

async function retry(action, attempts = 10, delay = 2000) {
    for (let i = 1; i <= attempts; i++) {
        try {
            return await action();
        } catch (err) {
            const isLast = i === attempts;
            console.warn(`[!] Attempt ${i} failed: ${err.message}${isLast ? '' : ' - Retrying...'}`);
            if (isLast) throw err;
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

// Run
(async () => {
    try {
        await runScraper();
    } catch (err) {
        console.error('[✖] Scraper failed after multiple attempts', err);
    }
})();
