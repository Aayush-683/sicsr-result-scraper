require('fix-esm').register();
const { chromium } = require('playwright');
const fs = require('fs');
const { fetch } = require('undici');

const BASE = 'http://siuexam.siu.edu.in/forms/resultview.html';
const SEAT_XPATH = 'xpath=//html/body/div[2]/form/div/div[1]/div[2]/div/div/div/div/div/input[1]';
const VIEW_XPATH = 'xpath=//html/body/div[2]/form/div/div[1]/div[2]/div/div/div/div/div/input[2]';
const LOGIN_INPUT_ID = '#login';
const LOGIN_BTN_ID = '#lgnbtn';
const RESULT_BTN_XPATH = 'xpath=//html/body/div[2]/form/div/div[2]/div[1]/a';

const prn = '22030121140'; // Replace with your PRN value
const seatNo = '433035'; // Replace with your seat number
const output = `${prn}.pdf`;

async function runScraper() {
    console.log('Starting...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.goto(BASE);

        // Fill the login form and submit
        console.log('Logging in...');
        await page.fill(LOGIN_INPUT_ID, prn);
        await page.click(LOGIN_BTN_ID);
        console.log('Logged in');
        await page.fill(SEAT_XPATH, seatNo);
        await page.click(VIEW_XPATH);
        console.log('Viewing result...');

        // Wait for the result button and get the href attribute
        const resultHref = await retry(async () => {
            const element = await page.waitForSelector(RESULT_BTN_XPATH, { timeout: 50000 });
            return await element.getAttribute('href');
        });
        
        console.log('Result found');
        // Construct the target URL for the result PDF
        const targetUrl = new URL(resultHref, BASE).href;
        let response = null;
        
        console.log('Fetching PDF...');
        // Fetch the result PDF
        while (!response || response.status !== 200) {
            console.log('Attempting to fetch PDF...');
            response = await fetch(targetUrl);
        }

        console.log('PDF fetched');
        // Write the PDF to the output file
        try {
            console.log('Saving PDF...');
            const writableStream = fs.createWriteStream(output);
            await streamPipeline(response.body, writableStream);
        } catch (error) {
            throw error;
        }

        console.log(`PDF saved as ${output}`);
    } catch (error) {
        throw error; // Re-throw the error to be caught by the outer retry logic
    } finally {
        // Close the browser
        await browser.close();
        console.log('Browser closed');
    }
}

const retry = async (action, attempts = 25, delay = 1000) => {
    for (let i = 0; i < attempts; i++) {
        try {
            return await action();
        } catch (err) {
            if (err.name === 'TimeoutError') {
                console.log('Operation timed out. Retrying in 10 seconds...');
                await new Promise(res => setTimeout(res, 10000));
            } else {
                if (i === attempts - 1) {
                    throw err;
                }
                console.log(`Retrying... attempt ${i + 1}`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }
}

// Helper function to pipeline the response stream to the file system
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

// Main execution with retry logic
(async () => {
    let attempts = 50; // Number of attempts the scraper will make
    await retry(runScraper, attempts, 10000); // function, attempts, delay
})();
