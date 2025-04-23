import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { google } from 'googleapis';

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

// Run server on port 3000
app.listen(3000);

