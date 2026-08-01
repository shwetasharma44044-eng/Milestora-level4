const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

/**
 * Express application setup
 * PORT is configurable via environment variables (default: 5000)
 */
const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin Resource Sharing (CORS) and JSON request parsing middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbPath = path.join(__dirname, 'feedback.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to feedback database:', err.message);
  } else {
    console.log('Connected to feedback database SQLite file.');
  }
});

// Setup table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      wallet_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Feedback table verified/created.');
    }
  });
});

// Endpoints

/**
 * POST /api/feedback
 * Submit a new user feedback record containing rating, comment, and wallet address.
 */
app.post('/api/feedback', (req, res) => {
  const { rating, comment, walletAddress } = req.body;

  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid rating. Must be a number between 1 and 5.' });
  }

  if (!comment || typeof comment !== 'string' || comment.trim() === '') {
    return res.status(400).json({ error: 'Comment is required and cannot be empty.' });
  }

  const query = `
    INSERT INTO feedback (rating, comment, wallet_address, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  `;

  db.run(query, [rating, comment, walletAddress || null], function(err) {
    if (err) {
      console.error('Error saving feedback:', err.message);
      return res.status(500).json({ error: 'Internal server error saving feedback' });
    }
    
    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedbackId: this.lastID
    });
  });
});

/**
 * GET /api/feedback
 * Retrieve aggregated feedback statistics and the full list of submissions.
 */
app.get('/api/feedback', (req, res) => {
  const statsQuery = `SELECT COUNT(*) as count, AVG(rating) as avgRating FROM feedback`;
  const listQuery = `SELECT * FROM feedback ORDER BY timestamp DESC`;

  db.get(statsQuery, [], (err, stats) => {
    if (err) {
      console.error('Error running stats query:', err.message);
      return res.status(500).json({ error: 'Internal server error fetching stats' });
    }

    db.all(listQuery, [], (err, rows) => {
      if (err) {
        console.error('Error running list query:', err.message);
        return res.status(500).json({ error: 'Internal server error fetching list' });
      }

      res.status(200).json({
        totalSubmissions: stats.count || 0,
        averageRating: stats.avgRating ? parseFloat(stats.avgRating.toFixed(2)) : 0,
        submissions: rows
      });
    });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Feedback backend server running on port ${PORT}`);
});
