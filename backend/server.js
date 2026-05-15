const express = require('express');
const path = require('path');
require('dotenv').config();
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const fs = require('fs');

app.get('/debug-files', (req, res) => {
  const dir = path.join(__dirname, '..', 'frontend', 'js');
  try {
    const files = fs.readdirSync(dir);
    res.json({ directory: dir, files });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Serve static files from frontend/
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/content'));
app.use('/api/watchlist', require('./routes/watchlist'));

// Explicit route for dedicated watchlist page
// Explicit route for the dedicated watchlist page
app.get('/watchlist', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'watchlist.html'));
});

// SPA fallback (Express 5)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});


// DB migration (unchanged)
pool.query(`
  DO $$
  BEGIN
    -- users table
    IF NOT EXISTS (
      SELECT FROM pg_tables
      WHERE schemaname='public' AND tablename='users'
    ) THEN
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    END IF;

    -- movies table
    IF NOT EXISTS (
      SELECT FROM pg_tables
      WHERE schemaname='public' AND tablename='movies'
    ) THEN
      CREATE TABLE movies (
        id INTEGER,
        type VARCHAR(10) DEFAULT 'movie',
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY(id, type)
      );
    ELSE
      -- add type column if missing
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='movies' AND column_name='type'
      ) THEN
        ALTER TABLE movies ADD COLUMN type VARCHAR(10) DEFAULT 'movie';
        UPDATE movies SET type = 'movie' WHERE type IS NULL;
      END IF;

      -- change primary key only if still on id alone
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name='movies'
        AND constraint_type='PRIMARY KEY'
        AND constraint_name='movies_pkey'
      ) THEN
        ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_movie_id_fkey;

        ALTER TABLE movies DROP CONSTRAINT movies_pkey;

        ALTER TABLE movies ADD PRIMARY KEY (id, type);
      END IF;
    END IF;

    -- watchlist table
    IF NOT EXISTS (
      SELECT FROM pg_tables
      WHERE schemaname='public' AND tablename='watchlist'
    ) THEN
      CREATE TABLE watchlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        movie_id INTEGER,
        type VARCHAR(10) DEFAULT 'movie',
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, movie_id, type)
      );
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='watchlist' AND column_name='type'
      ) THEN
        ALTER TABLE watchlist ADD COLUMN type VARCHAR(10) DEFAULT 'movie';

        UPDATE watchlist
        SET type = 'movie'
        WHERE type IS NULL;

        ALTER TABLE watchlist
        DROP CONSTRAINT IF EXISTS watchlist_user_id_movie_id_key;

        ALTER TABLE watchlist
        ADD CONSTRAINT watchlist_user_movie_type_unique
        UNIQUE (user_id, movie_id, type);
      END IF;
    END IF;
  END $$;
`)
.then(() => console.log('Database tables ready'))
.catch(console.error);

app.listen(PORT, () => {
  console.log(`Your Movie server running on http://localhost:${PORT}`);
});