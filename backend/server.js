const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';
const CACHE_FILE = path.join(__dirname, 'data', 'movies.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// -------------------------------------------------------------------
// Cache helpers – now safe
// -------------------------------------------------------------------
function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const cache = JSON.parse(raw);
    // Ensure we always have a sections array (fallback for old format)
    if (!cache.sections) {
      cache.sections = [];
    }
    return cache;
  } catch {
    // File doesn't exist or is invalid
    return { updatedAt: 0, sections: [] };
  }
}

function writeCache(sections) {
  const data = { updatedAt: Date.now(), sections };
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

// -------------------------------------------------------------------
// Map TMDB movie
// -------------------------------------------------------------------
function mapTmdbMovie(tmdbMovie) {
  const poster = tmdbMovie.poster_path
    ? TMDB_IMAGE_BASE + tmdbMovie.poster_path
    : 'https://via.placeholder.com/300x450/1a1a2e/ffffff?text=No+Image';

  const genreMap = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western'
  };
  let genreNames = [];
  if (tmdbMovie.genres && tmdbMovie.genres.length) {
    genreNames = tmdbMovie.genres.map(g => g.name);
  } else if (tmdbMovie.genre_ids && tmdbMovie.genre_ids.length) {
    genreNames = tmdbMovie.genre_ids.map(id => genreMap[id] || 'Unknown');
  }

  return {
    id: tmdbMovie.id,
    title: tmdbMovie.title || tmdbMovie.name,
    year: tmdbMovie.release_date
      ? tmdbMovie.release_date.substring(0, 4)
      : (tmdbMovie.first_air_date ? tmdbMovie.first_air_date.substring(0, 4) : ''),
    genre: genreNames,
    language: (tmdbMovie.original_language || '').toUpperCase(),
    region: '',
    poster,
    description: tmdbMovie.overview || '',
    trailerUrl: '',
    director: '',
    cast: []
  };
}

// -------------------------------------------------------------------
// Fetch multiple pages (always returns an array)
// -------------------------------------------------------------------
async function fetchTmdbPages(baseUrl, pages = 2) {
  let allResults = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const { data } = await axios.get(url);
      if (data.results && data.results.length) {
        allResults = allResults.concat(data.results);
      } else {
        break;
      }
    } catch (e) {
      console.warn(`Skipping page ${page} of ${baseUrl}: ${e.message}`);
      break;
    }
  }
  const seen = new Set();
  return allResults.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// -------------------------------------------------------------------
// Build all sections from TMDB
// -------------------------------------------------------------------
async function fetchSectionsFromTMDB() {
  const sections = [];

  // 1. Trending
  console.log('Fetching Trending...');
  const trending = await fetchTmdbPages(
    `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}`, 2
  );
  if (trending.length) {
    sections.push({ title: '🔥 Trending Worldwide', movies: trending.map(mapTmdbMovie) });
  }

  // 2. Popular
  const popular = await fetchTmdbPages(
    `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US`, 2
  );
  if (popular.length) {
    sections.push({ title: '⭐ Popular Worldwide', movies: popular.map(mapTmdbMovie) });
  }

  // 3. Now Playing
  const nowPlaying = await fetchTmdbPages(
    `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US`, 2
  );
  if (nowPlaying.length) {
    sections.push({ title: '🎥 Now in Cinemas', movies: nowPlaying.map(mapTmdbMovie) });
  }

  // 4. Top Rated
  const topRated = await fetchTmdbPages(
    `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US`, 2
  );
  if (topRated.length) {
    sections.push({ title: '🏆 Top Rated of All Time', movies: topRated.map(mapTmdbMovie) });
  }

  // 5. Regional rows
  const regionalConfigs = [
    { title: '🇮🇳 Bollywood & Indian', lang: 'hi-IN', regionName: 'Indian' },
    { title: '🇰🇷 Korean Cinema', lang: 'ko-KR', regionName: 'Asian' },
    { title: '🇯🇵 Japanese Movies', lang: 'ja-JP', regionName: 'Asian' },
    { title: '🇨🇳 Chinese Movies', lang: 'zh-CN', regionName: 'Asian' },
    { title: '🇪🇺 European Cinema', lang: 'fr-FR', regionName: 'European' }
  ];

  for (const cfg of regionalConfigs) {
    console.log(`Fetching ${cfg.title}...`);
    const movies = await fetchTmdbPages(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${cfg.lang}&sort_by=popularity.desc`, 2
    );
    if (movies.length) {
      const mapped = movies.map(m => {
        const appM = mapTmdbMovie(m);
        appM.region = cfg.regionName;
        return appM;
      });
      sections.push({ title: cfg.title, movies: mapped });
    }
  }

  return sections;
}

// -------------------------------------------------------------------
// Express routes
// -------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/api/movies', async (req, res) => {
  try {
    let cache = readCache();
    // Safe check: cache.sections is guaranteed to be an array now
    if (cache.updatedAt && (Date.now() - cache.updatedAt < CACHE_DURATION) && cache.sections.length > 0) {
      console.log('Serving from cache');
      return res.json(cache.sections);
    }

    console.log('Cache expired or missing – fetching from TMDB...');
    const sections = await fetchSectionsFromTMDB();
    writeCache(sections);
    res.json(sections);
  } catch (err) {
    console.error('Error loading sections:', err.message);
    const cache = readCache();
    if (cache.sections.length > 0) {
      return res.json(cache.sections);
    }
    res.status(500).json({ error: 'Failed to load movies' });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const cache = readCache();
    let movie = null;
    for (const sec of cache.sections) {
      movie = sec.movies.find(m => m.id === id);
      if (movie) break;
    }

    if (movie && movie.director) {
      return res.json(movie);
    }

    console.log(`Fetching detail for movie ${id}...`);
    const { data } = await axios.get(
      `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=videos,credits`
    );
    const detailed = mapTmdbMovie(data);
    detailed.trailerUrl = data.videos?.results?.find(
      v => v.type === 'Trailer' && v.site === 'YouTube'
    )?.key
      ? `https://www.youtube.com/embed/${data.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube').key}`
      : '';
    detailed.director = data.credits?.crew?.find(p => p.job === 'Director')?.name || '';
    detailed.cast = data.credits?.cast?.slice(0, 5).map(p => p.name) || [];

    if (movie) {
      Object.assign(movie, detailed);
      writeCache(cache.sections);
    }
    res.json(detailed);
  } catch (err) {
    console.error('Detail error:', err.message);
    const cache = readCache();
    for (const sec of cache.sections) {
      const movie = sec.movies.find(m => m.id === id);
      if (movie) return res.json(movie);
    }
    res.status(404).json({ error: 'Movie not found' });
  }
});

// ---------- In-memory search cache (query → { results, timestamp }) ----------
const searchCache = {};

// GET /api/search?query=...&page=1
app.get('/api/search', async (req, res) => {
  const query = req.query.query?.trim();
  if (!query) return res.json({ results: [] });

  const page = req.query.page || 1;
  const cacheKey = `${query}_page${page}`;
  const now = Date.now();
  const cacheTTL = 10 * 60 * 1000; // 10 minutes

  // Return cached results if still valid
  if (searchCache[cacheKey] && (now - searchCache[cacheKey].timestamp < cacheTTL)) {
    return res.json({ results: searchCache[cacheKey].results });
  }

  try {
    const { data } = await axios.get(
      `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`
    );
    const results = (data.results || []).map(mapTmdbMovie);
    searchCache[cacheKey] = { results, timestamp: now };
    res.json({ results });
  } catch (err) {
    console.error('Search error:', err.message);
    // Fallback to empty
    res.json({ results: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!TMDB_API_KEY) console.warn('WARNING: TMDB_API_KEY not set in .env');
});