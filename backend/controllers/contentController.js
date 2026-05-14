const axios = require('axios');
const { readCache, writeCache, CACHE_DURATION } = require('../utils/cache');
const { mapTmdbMovie, mapTmdbTV, getContentById, TMDB_API_KEY } = require('../utils/tmdb');
const pool = require('../config/db');

// Home sections (movies + TV)
exports.getHomeSections = async (req, res) => {
  try {
    let cache = readCache();
    if (cache.updatedAt && (Date.now() - cache.updatedAt < CACHE_DURATION) && cache.sections.length > 0) {
      return res.json(cache.sections);
    }

    const sections = await fetchAllSections();
    writeCache(sections);
    res.json(sections);
  } catch (err) {
    console.error('Home sections error:', err.message);
    const cache = readCache();
    if (cache.sections.length) return res.json(cache.sections);
    res.status(500).json({ error: 'Failed to load home' });
  }
};

// Helper: fetch multiple pages from TMDB
async function fetchTmdbPages(baseUrl, pages = 2) {
  let results = [];
  for (let page = 1; page <= pages; page++) {
    let success = false;
    for (let attempt = 0; attempt < 2; attempt++) {   // retry once
      try {
        const { data } = await axios.get(`${baseUrl}&page=${page}`);
        if (data.results && data.results.length) {
          results = results.concat(data.results);
        }
        success = true;
        break;   // stop retrying on success
      } catch (e) {
        if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || (e.response && e.response.status >= 500)) {
          console.warn(`Attempt ${attempt + 1} failed for page ${page} of ${baseUrl}: ${e.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second before retry
        } else {
          throw e; // non‑retryable error
        }
      }
    }
    if (!success) {
      console.warn(`Skipping page ${page} of ${baseUrl} after retries`);
      break;
    }
  }
  const seen = new Set();
  return results.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

// Build all sections
async function fetchAllSections() {
  const sections = [];

  // ---- MOVIES ----
  const trending = await fetchTmdbPages(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}`, 2);
  if (trending.length) sections.push({ title: '🔥 Trending Movies', movies: trending.map(mapTmdbMovie) });

  const popular = await fetchTmdbPages(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US`, 2);
  if (popular.length) sections.push({ title: '⭐ Popular Movies', movies: popular.map(mapTmdbMovie) });

  const nowPlaying = await fetchTmdbPages(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US`, 2);
  if (nowPlaying.length) sections.push({ title: '🎥 Now in Cinemas', movies: nowPlaying.map(mapTmdbMovie) });

  const topRated = await fetchTmdbPages(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US`, 2);
  if (topRated.length) sections.push({ title: '🏆 Top Rated Movies', movies: topRated.map(mapTmdbMovie) });

  // Regional movies – using with_origin_country (ISO country code) for exact country
  const regional = [
    { title: '🇮🇳 Indian Cinema', country: 'IN' },
    { title: '🇰🇷 Korean Cinema', country: 'KR' },
    { title: '🇯🇵 Japanese Movies', country: 'JP' },
    { title: '🇨🇳 Chinese Movies', country: 'CN' },
    { title: '🇫🇷 French Cinema', country: 'FR' },
    { title: '🇩🇪 German Cinema', country: 'DE' },
    { title: '🇬🇧 British Cinema', country: 'GB' }
  ];
  for (const r of regional) {
    const movies = await fetchTmdbPages(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_origin_country=${r.country}&sort_by=popularity.desc`,
      2
    );
    if (movies.length) sections.push({ title: r.title, movies: movies.map(mapTmdbMovie) });
  }

  // ---- TV SHOWS ----
  const tvSections = [
    { title: '📺 Trending TV Shows', endpoint: `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}` },
    { title: '⭐ Popular TV Shows', endpoint: `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=en-US` },
    { title: '🇰🇷 Korean Dramas', endpoint: `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=KR&sort_by=popularity.desc` },
    { title: '🇯🇵 Anime / Japanese Shows', endpoint: `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=JP&sort_by=popularity.desc` }
  ];
  for (const cfg of tvSections) {
    const shows = await fetchTmdbPages(cfg.endpoint, 2);
    if (shows.length) sections.push({ title: cfg.title, movies: shows.map(mapTmdbTV) });
  }

  return sections;
}

// Movie detail
exports.getMovieDetail = async (req, res) => {
  const movie = await getContentById(pool, parseInt(req.params.id), 'movie');
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
};

// TV detail
exports.getTVDetail = async (req, res) => {
  const show = await getContentById(pool, parseInt(req.params.id), 'tv');
  if (!show) return res.status(404).json({ error: 'TV show not found' });
  res.json(show);
};

// Search (movies + TV)
const searchCache = {};
async function axiosGetWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await axios.get(url);
      return data;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || (err.response && err.response.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw err;
    }
  }
}
exports.search = async (req, res) => {
  const query = req.query.query?.trim();
  const page = req.query.page || 1;
  if (!query) return res.json({ results: [] });
  const cacheKey = `${query}_page${page}`;
  const now = Date.now();
  const cacheTTL = 10 * 60 * 1000;
  if (searchCache[cacheKey] && (now - searchCache[cacheKey].timestamp < cacheTTL)) {
    return res.json({ results: searchCache[cacheKey].results });
  }
  try {
        const [movieData, tvData] = await Promise.all([
      axiosGetWithRetry(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`),
      axiosGetWithRetry(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`)
    ]);
    const results = [
      ...(movieData.results || []).map(mapTmdbMovie),
      ...(tvData.results || []).map(mapTmdbTV)
    ];
    searchCache[cacheKey] = { results, timestamp: now };
    res.json({ results });
  } catch (err) {
    console.error('Search error:', err.message);
    res.json({ results: [] });
  }
};