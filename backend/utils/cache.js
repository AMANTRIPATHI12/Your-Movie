const fs = require('fs');
const path = require('path');
const CACHE_FILE = path.join(__dirname, '..', 'data', 'movies.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data.sections) data.sections = [];
    return data;
  } catch {
    return { updatedAt: 0, sections: [] };
  }
}

function writeCache(sections) {
  const dir = path.dirname(CACHE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ updatedAt: Date.now(), sections }, null, 2));
}

module.exports = { readCache, writeCache, CACHE_DURATION };