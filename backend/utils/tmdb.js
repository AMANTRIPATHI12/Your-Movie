const axios = require('axios');
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

const genreMap = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western'
};

function mapTmdbMovie(movie) {
  const poster = movie.poster_path
    ? TMDB_IMAGE_BASE + movie.poster_path
    : 'https://via.placeholder.com/300x450/1a1a2e/ffffff?text=No+Image';
  let genres = [];
  if (movie.genres) genres = movie.genres.map(g => g.name);
  else if (movie.genre_ids) genres = movie.genre_ids.map(id => genreMap[id] || 'Unknown');
  return {
    id: movie.id,
    title: movie.title,
    year: movie.release_date ? movie.release_date.substring(0,4) : '',
    genre: genres,
    language: (movie.original_language || '').toUpperCase(),
    type: 'movie',
    poster,
    description: movie.overview || '',
    trailerUrl: '',
    director: '',
    cast: []
  };
}

function mapTmdbTV(show) {
  const poster = show.poster_path
    ? TMDB_IMAGE_BASE + show.poster_path
    : 'https://via.placeholder.com/300x450/1a1a2e/ffffff?text=No+Image';
  let genres = [];
  if (show.genres) genres = show.genres.map(g => g.name);
  else if (show.genre_ids) genres = show.genre_ids.map(id => genreMap[id] || 'Unknown');
  return {
    id: show.id,
    title: show.name,
    year: show.first_air_date ? show.first_air_date.substring(0,4) : '',
    genre: genres,
    language: (show.original_language || '').toUpperCase(),
    type: 'tv',
    poster,
    description: show.overview || '',
    trailerUrl: '',
    director: '',
    cast: [],
    creator: '',
    seasons: []
  };
}

// Fetch full content (movie or TV) with DB cache + TMDB retry
async function getContentById(pool, contentId, type) {
  // Safety check
  if (!pool || !contentId || !type) {
    console.error(`getContentById called with invalid args: pool=${!!pool}, id=${contentId}, type=${type}`);
    return null;
  }

  // 1. Check cache
  try {
    const cached = await pool.query('SELECT data FROM movies WHERE id=$1 AND type=$2', [contentId, type]);
    if (cached.rows.length) return cached.rows[0].data;
  } catch (err) {
    console.error('DB cache lookup error:', err.message);
    // Continue to TMDB anyway
  }

  // 2. Fetch from TMDB with retries (network errors included)
  const endpoint = type === 'tv'
    ? `https://api.themoviedb.org/3/tv/${contentId}?api_key=${TMDB_API_KEY}&append_to_response=videos,credits`
    : `https://api.themoviedb.org/3/movie/${contentId}?api_key=${TMDB_API_KEY}&append_to_response=videos,credits`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.get(endpoint);
      let content;
      if (type === 'tv') {
        content = mapTmdbTV(data);
        content.trailerUrl = data.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key
          ? `https://www.youtube.com/embed/${data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube').key}`
          : '';
        content.creator = data.created_by?.map(p => p.name).join(', ') || '';
        content.seasons = data.seasons?.map(s => ({
          season_number: s.season_number,
          episode_count: s.episode_count,
          name: s.name
        })) || [];
        content.cast = data.credits?.cast?.slice(0,5).map(p => p.name) || [];
      } else {
        content = mapTmdbMovie(data);
        content.trailerUrl = data.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key
          ? `https://www.youtube.com/embed/${data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube').key}`
          : '';
        content.director = data.credits?.crew?.find(p => p.job === 'Director')?.name || '';
        content.cast = data.credits?.cast?.slice(0,5).map(p => p.name) || [];
      }

      // Store in DB
      try {
        await pool.query(
          'INSERT INTO movies (id, type, data) VALUES ($1,$2,$3) ON CONFLICT (id, type) DO NOTHING',
          [contentId, type, JSON.stringify(content)]
        );
      } catch (dbErr) {
        console.error('Failed to cache content in DB:', dbErr.message);
      }

      return content;
    } catch (err) {
      // Retry on network errors, 429, or 5xx
      const shouldRetry =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        (err.response && (err.response.status === 429 || err.response.status >= 500));

      if (shouldRetry && attempt < 2) {
        const waitMs = (attempt + 1) * 1000;   // 1s, 2s
        console.warn(`Retrying ${type}/${contentId} after ${err.code || err.response?.status} (attempt ${attempt+1}/2)`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      console.error(`getContentById failed for ${type}:${contentId}:`, err.code || err.response?.status, err.message);
      return null;
    }
  }
  return null;
}

module.exports = { mapTmdbMovie, mapTmdbTV, getContentById, genreMap, TMDB_API_KEY, TMDB_IMAGE_BASE };