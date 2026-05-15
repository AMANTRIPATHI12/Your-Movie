import { checkAuth, currentUser, token, fetchWithAuth, addToWatchlist, markWatched, createMovieCard, createWatchlistCard, attachDropdownListeners } from './utils.js';
import { initAuth } from './auth.js';

// ========== DOM ELEMENTS ==========
const homeView = document.getElementById('home-view');
const detailView = document.getElementById('detail-view');
const backBtn = document.getElementById('back-btn');
const movieRows = document.getElementById('movie-rows');
const detailContent = document.getElementById('detail-content');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const searchResults = document.getElementById('search-results');
const searchGrid = document.getElementById('search-grid');
const searchTitle = document.getElementById('search-title');
const watchlistSec = document.getElementById('watchlist-section');
const watchlistGrid = document.getElementById('watchlist-grid');
const watchlistTvSec = document.getElementById('watchlist-tv-section');
const watchlistTvGrid = document.getElementById('watchlist-tv-grid');
const watchlistPrompt = document.getElementById('watchlist-login-prompt');
const watchlistPageLink = document.getElementById('watchlist-page-link');

// Auth modal elements
const authModal = document.getElementById('auth-modal');
const closeModal = document.getElementById('close-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const toggleAuth = document.getElementById('toggle-auth');
const authError = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmailSpan = document.getElementById('user-email');

let debounceTimer;

// ========== AUTH INIT ==========
initAuth({
  authModal, closeModal, authForm, authTitle, authEmail, authPassword,
  toggleAuth, authError, loginBtn, logoutBtn, isLoginMode: true
}, async (user) => {
  if (user) {
    updateAuthUI(user);
    loadWatchlist('movie');
    loadWatchlist('tv');
  } else {
    updateAuthUI(null);
    watchlistGrid.innerHTML = '';
    watchlistTvGrid.innerHTML = '';
  }
});

// Initial auth check
// Initial auth check
checkAuth().then(user => {
  if (user) {
    updateAuthUI(user);
    loadWatchlist('movie');
    loadWatchlist('tv');
  } else {
    updateAuthUI(null);
  }
});

function updateAuthUI(user) {
  if (user) {
    loginBtn.classList.add('hidden');
    userEmailSpan.classList.remove('hidden');
    userEmailSpan.textContent = user.email;
    logoutBtn.classList.remove('hidden');
    watchlistPageLink.classList.remove('hidden');
    watchlistSec.classList.remove('hidden');
    watchlistTvSec.classList.remove('hidden');
    watchlistPrompt.classList.add('hidden');
  } else {
    loginBtn.classList.remove('hidden');
    userEmailSpan.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    watchlistPageLink.classList.add('hidden');
    watchlistSec.classList.add('hidden');
    watchlistTvSec.classList.add('hidden');
    watchlistPrompt.classList.remove('hidden');
  }
}

// ========== WATCHLIST ROWS (home) ==========
async function loadWatchlist(type) {
  if (!token) return;
  const grid = type === 'tv' ? watchlistTvGrid : watchlistGrid;
  try {
    const res = await fetchWithAuth(`/api/watchlist?type=${type}`);
    const items = await res.json();
    renderWatchlistRow(items, type, grid);
  } catch (err) {
    console.error(err);
  }
}

function renderWatchlistRow(items, type, grid) {
  if (!items.length) {
    grid.innerHTML = '<p style="color:#b3b3b3">Nothing here yet. Start adding!</p>';
    return;
  }
  grid.innerHTML = items.map(item => createWatchlistCard(item)).join('');
  attachCardListeners();
  grid.querySelectorAll('.watched-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const t = btn.dataset.type;
      await markWatched(id, t);
      loadWatchlist(t);
    });
  });
}

// ========== ADD TO WATCHLIST EVENTS ==========
document.addEventListener('add-to-watchlist', e => {
  const { id, type } = e.detail;
  addToWatchlist(id, type);
});

document.addEventListener('watchlist-updated', e => {
  loadWatchlist(e.detail.type);
});

document.addEventListener('watchlist-queued', e => {
  const { movieId, type } = e.detail;
  const grid = type === 'tv' ? watchlistTvGrid : watchlistGrid;
  const card = document.createElement('div');
  card.className = 'movie-card pending';
  card.dataset.id = movieId;
  card.dataset.type = type;
  card.innerHTML = '<div class="pending-spinner"></div>';
  grid.prepend(card);
  // poll until available
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    const res = await fetchWithAuth(`/api/watchlist?type=${type}`);
    const items = await res.json();
    if (items.some(i => i.id == movieId) || attempts >= 5) {
      clearInterval(interval);
      loadWatchlist(type);
    }
  }, 2000);
});

// ========== DETAIL VIEW ==========
// ========== DETAIL VIEW ==========
async function showDetail(id, type = 'movie', push = true) {
  try {
    const url = type === 'tv'
      ? `/api/tv/${id}`
      : `/api/movies/${id}`;

    const res = await fetch(url);

    if (!res.ok) throw new Error('Not found');

    const content = await res.json();

    detailContent.innerHTML = `
      <div class="movie-detail">
        <img class="poster-large" src="${content.poster}" alt="${content.title}" />

        <div class="movie-info">
          <h1>${content.title}</h1>

          <div class="meta">
            <span>${content.year}</span>
            <span>${content.language || ''}</span>
            <span>${content.genre.join(', ')}</span>
          </div>

          <p class="description">${content.description}</p>

          ${type === 'movie'
            ? `<p><strong>Director:</strong> ${content.director || 'N/A'}</p>`
            : ''
          }

          <p><strong>Cast:</strong> ${(content.cast || []).join(', ')}</p>

          ${type === 'tv' && content.creator
            ? `<p><strong>Creator:</strong> ${content.creator}</p>`
            : ''
          }

          ${type === 'tv' && content.seasons
            ? `<p><strong>Seasons:</strong> ${
                content.seasons
                  .map(
                    s =>
                      `${s.name || 'Season ' + s.season_number} (${s.episode_count} ep)`
                  )
                  .join(', ')
              }</p>`
            : ''
          }

          ${token
            ? `
            <button
              class="watchlist-add-btn"
              data-id="${content.id}"
              data-type="${type}">
              + Add to Your ${type === 'tv' ? 'Series' : 'Movie'}
            </button>
          `
            : ''
          }
        </div>
      </div>

      ${content.trailerUrl
        ? `
        <div class="trailer-container">
          <h3>Trailer</h3>
          <iframe src="${content.trailerUrl}" allowfullscreen></iframe>
        </div>
      `
        : ''
      }
    `;

    const addBtn = document.querySelector('.watchlist-add-btn');

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addToWatchlist(
          parseInt(addBtn.dataset.id),
          addBtn.dataset.type
        );
      });
    }

    // IMPORTANT FIX
    if (push) {
      history.pushState(
        { id, type },
        '',
        type === 'tv'
          ? `/tv/${id}`
          : `/movie/${id}`
      );
    }

    homeView.classList.add('hidden');
    detailView.classList.remove('hidden');

    window.scrollTo(0, 0);

  } catch (err) {
    alert('Could not load details.');
    console.error(err);
  }
}

backBtn.addEventListener('click', () => {
  history.back();
});

window.addEventListener('popstate', () => {
  const path = window.location.pathname;

  if (path.startsWith('/movie/')) {

    const id = path.split('/')[2];

    showDetail(id, 'movie', false);

  } else if (path.startsWith('/tv/')) {

    const id = path.split('/')[2];

    showDetail(id, 'tv', false);

  } else {

    detailView.classList.add('hidden');
    homeView.classList.remove('hidden');

    window.scrollTo(0, 0);
  }
});

// ========== HOME LOADER ==========
async function loadHome() {
  try {
    const res = await fetch('/api/movies');
    const sections = await res.json();
    movieRows.innerHTML = '';
    sections.forEach(section => {
      if (!section.movies.length) return;
      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';
      rowDiv.innerHTML = `
        <h2>${section.title}</h2>
        <div class="movie-grid">
          ${section.movies.map(m => createMovieCard(m)).join('')}
        </div>
      `;
      movieRows.appendChild(rowDiv);
    });
    attachCardListeners();
    attachDropdownListeners();
  } catch (err) {
    console.error(err);
    movieRows.innerHTML = '<p>Failed to load movies. Is the server running?</p>';
  }
}

function attachCardListeners() {
  document.querySelectorAll('.movie-card').forEach(card => {
    if (card.dataset.cardListener) return;
    card.dataset.cardListener = 'true';
    card.addEventListener('click', e => {
      if (e.target.closest('.add-dropdown') || e.target.classList.contains('watched-btn')) return;
      const id = card.dataset.id;
      const type = card.dataset.type || 'movie';
      showDetail(id, type);
    });
  });
}

// ========== SEARCH ==========
function performSearch(query) {
  if (!query) { clearSearch(); return; }
  fetch(`/api/search?query=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      const results = data.results || [];
      movieRows.classList.add('hidden');
      searchResults.classList.remove('hidden');
      searchTitle.textContent = `Search Results for "${query}"`;
      searchGrid.innerHTML = results.length
        ? results.map(item => createMovieCard(item)).join('')
        : '<p>No results found.</p>';
      attachCardListeners();
      attachDropdownListeners();
    })
    .catch(err => console.error(err));
}

function clearSearch() {
  searchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  searchResults.classList.add('hidden');
  movieRows.classList.remove('hidden');
}

searchInput.addEventListener('input', e => {
  clearSearchBtn.classList.toggle('hidden', !e.target.value.trim());
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => performSearch(e.target.value.trim()), 300);
});
clearSearchBtn.addEventListener('click', clearSearch);

// ========== INIT ==========
// ========== INIT ==========
const path = window.location.pathname;

loadHome();

if (path.startsWith('/movie/')) {

  const id = path.split('/')[2];

  showDetail(id, 'movie', false);

} else if (path.startsWith('/tv/')) {

  const id = path.split('/')[2];

  showDetail(id, 'tv', false);
}