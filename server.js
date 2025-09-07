import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { google } from 'googleapis';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

// Create server
const app = express();
// JSON middleware
app.use(express.json());

// Global error handler for malformed JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError) {
    // Return invalid JSON error
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  // If the error is not a SyntaxError, pass it to the next handler
  next(err);
});

// Allow requests from focus website
app.use(cors({
  origin: 'https://getfocus.cc',
}));

// Authenticate Google Sheets API key
const auth = new google.auth.GoogleAuth({
  keyFile: 'private-key.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Rate limiter for opt in status api call
const optinRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1, // 1 request per IP
  message: {
    error: 'Too many submissions from this IP. Please wait a few minutes before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Log whether the user is opted in or out
app.post('/optin_status', optinRateLimiter, async (req, res) => {

  // Get opt in status from request body
  const { optInStatus } = req.body;

  // If the opt in status does not equal true or false return error
  if (optInStatus !== true && optInStatus !== false) {
    return res.status(400).json({ error: 'Invalid opt in status' });
  }

  // Try to append opt in status to google sheets database
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: '1RXuFhoKSG6q7FvoxBbRjAUmuadJGjLZztIFnD5YuXZk',
      range: 'Sheet1!A:A',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[optInStatus]],
      },
    });
    // If successful return 200 code
    return res.status(200).json({ message: 'Opt in status logged' });
  } catch (err) {
    // If unsuccessful return 500 code and error message
    return res.status(500).json({ error: err.message });
  }
});

let cachedUserCount = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h in ms

async function fetchUserCount() {
  let browser;
  try {
    // Chrome Web Store
    const chromeResponse = await fetch(
      'https://chromewebstore.google.com/detail/focus-short-form-content/bbobcnmcegmkheaimcepkmcmnaaomagn'
    );
    if (!chromeResponse.ok) throw new Error('Failed to fetch Chrome Web Store');

    let chromeHtml = await chromeResponse.text();
    let $ = cheerio.load(chromeHtml);
    let chromeText = $('.F9iKBc').text().trim();
    const chromeMatch = chromeText.match(/[\d,]+/);
    const chromeCount = chromeMatch ? parseInt(chromeMatch[0].replace(/,/g, ''), 10) : 0;

    const firefoxResponse = await fetch(
      'https://addons.mozilla.org/en-US/firefox/addon/focus-remove-shorts-reels/'
    );
    if (!firefoxResponse.ok) throw new Error('Failed to fetch Firefox Store');

    let firefoxHtml = await firefoxResponse.text();
    let $$ = cheerio.load(firefoxHtml);
    let firefoxText = $$('.Badge-content')
      .filter((i, el) => $$(el).text().includes("Users"))
      .first()
      .text()
      .trim();
    const firefoxMatch = firefoxText.match(/[\d,]+/);
    const firefoxCount = firefoxMatch ? parseInt(firefoxMatch[0].replace(/,/g, ''), 10) : 0;

    // Microsoft Edge
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(
      'https://microsoftedge.microsoft.com/addons/detail/focus-remove-shorts-r/plicpnabmdpgenmhkajnkdicjdoddofg',
      { waitUntil: 'networkidle2' }
    );

    const edgeText = await page.$eval('#activeInstallText', el => el.innerText.trim());
    const edgeMatch = edgeText.match(/[\d,]+/);
    const edgeCount = edgeMatch ? parseInt(edgeMatch[0].replace(/,/g, ''), 10) : 0;

    await page.close();
    await browser.close();

    cachedUserCount = chromeCount + edgeCount + firefoxCount;
    console.log(`[UserCountUpdater] Updated count: ${cachedUserCount}`);
  } catch (err) {
    if (browser) await browser.close();
    console.error('[UserCountUpdater] Error fetching count:', err);
  }
}

// Update every 24 hours
setInterval(fetchUserCount, CACHE_DURATION);

// Fetch immediately on startup
fetchUserCount();

app.get('/user_count', (req, res) => {
  if (cachedUserCount !== null) {
    res.status(200).json({ userCount: cachedUserCount });
  } else {
    res.status(503).json({ error: 'User count not yet available' });
  }
});

// Run server on port 3000
app.listen(3000);

