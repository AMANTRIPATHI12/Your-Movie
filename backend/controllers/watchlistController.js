const pool = require('../config/db');
const { getContentById } = require('../utils/tmdb');
const { enqueue } = require('../utils/queue');

exports.getWatchlist = async (req, res) => {
  const type = req.query.type;
  try {
    let query = `SELECT m.data AS content FROM watchlist w JOIN movies m ON w.movie_id=m.id AND w.type=m.type WHERE w.user_id=$1`;
    const params = [req.user.id];
    if (type) { query += ' AND w.type=$2'; params.push(type); }
    query += ' ORDER BY w.added_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(r => r.content));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch watchlist' });
  }
};

exports.addToWatchlist = async (req, res) => {
  const { movieId, type = 'movie' } = req.body;
  // Validate
  if (!movieId || isNaN(parseInt(movieId))) {
    return res.status(400).json({ error: 'Valid movieId (integer) required' });
  }
  if (!['movie', 'tv'].includes(type)) {
    return res.status(400).json({ error: 'type must be movie or tv' });
  }
  const id = parseInt(movieId);
  try {
    // Already cached?
    const cached = await pool.query('SELECT data FROM movies WHERE id=$1 AND type=$2', [id, type]);
    if (cached.rows.length) {
      await pool.query('INSERT INTO watchlist (user_id, movie_id, type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [req.user.id, id, type]);
      return res.status(201).json({ message: 'Added' });
    } else {
      // Enqueue for fetching
      enqueue({ userId: req.user.id, movieId: id, type }, getContentById, pool);
      return res.status(202).json({ message: 'Queued for addition' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add to watchlist' });
  }
};

exports.removeFromWatchlist = async (req, res) => {
  const movieId = parseInt(req.params.movieId);
  const type = req.query.type || 'movie';
  if (isNaN(movieId)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    await pool.query('DELETE FROM watchlist WHERE user_id=$1 AND movie_id=$2 AND type=$3',
      [req.user.id, movieId, type]);
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove' });
  }
};