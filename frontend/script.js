document.addEventListener('DOMContentLoaded', () => {

  // ----- DOM elements -----
  const homeView = document.getElementById('home-view');
  const detailView = document.getElementById('detail-view');
  const movieRowsContainer = document.getElementById('movie-rows');
  const detailContent = document.getElementById('detail-content');
  const backBtn = document.getElementById('back-btn');

  // Auth
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

  // Search
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const searchResultsSection = document.getElementById('search-results');
  const searchGrid = document.getElementById('search-grid');
  const searchTitle = document.getElementById('search-title');

  // Watchlist – Movies
  const watchlistSection = document.getElementById('watchlist-section');
  const watchlistGrid = document.getElementById('watchlist-grid');
  // Watchlist – TV
  const watchlistTvSection = document.getElementById('watchlist-tv-section');
  const watchlistTvGrid = document.getElementById('watchlist-tv-grid');

  // State
  let token = localStorage.getItem('token');
  let currentUser = null;
  let isLoginMode = true;
  let debounceTimer;

  // ----- Auth check on load -----
  if (token) {
    fetch('/api/user', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(user => {
        currentUser = user;
        updateAuthUI();
        loadWatchlist('movie');
        loadWatchlist('tv');
      })
      .catch(() => {
        localStorage.removeItem('token');
        token = null;
        updateAuthUI();
      });
  } else {
    updateAuthUI();
  }

  // ----- Auth UI -----
  function updateAuthUI() {
    const prompt = document.getElementById('watchlist-login-prompt');
    if (currentUser) {
      loginBtn.classList.add('hidden');
      userEmailSpan.classList.remove('hidden');
      userEmailSpan.textContent = currentUser.email;
      logoutBtn.classList.remove('hidden');
      watchlistSection.classList.remove('hidden');
      watchlistTvSection.classList.remove('hidden');
      if (prompt) prompt.classList.add('hidden');
    } else {
      loginBtn.classList.remove('hidden');
      userEmailSpan.classList.add('hidden');
      logoutBtn.classList.add('hidden');
      watchlistSection.classList.add('hidden');
      watchlistTvSection.classList.add('hidden');
      if (prompt) prompt.classList.remove('hidden');
    }
  }

  // ----- Auth modal handlers -----
  document.getElementById('login-prompt-link').addEventListener('click', (e) => {
    e.preventDefault();
    loginBtn.click();  // opens login modal
  });
  loginBtn.addEventListener('click', () => {
    isLoginMode = true;
    authTitle.textContent = 'Login';
    toggleAuth.innerHTML = `Don't have an account? <a href="#">Sign up</a>`;
    authError.textContent = '';
    authModal.classList.remove('hidden');
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    updateAuthUI();
    watchlistGrid.innerHTML = '';
    watchlistTvGrid.innerHTML = '';
  });

  closeModal.addEventListener('click', () => authModal.classList.add('hidden'));
  window.addEventListener('click', (e) => {
    if (e.target === authModal) authModal.classList.add('hidden');
  });

  toggleAuth.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      e.preventDefault();
      isLoginMode = !isLoginMode;
      authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up';
      toggleAuth.innerHTML = isLoginMode
        ? `Don't have an account? <a href="#">Sign up</a>`
        : `Already have an account? <a href="#">Login</a>`;
      authError.textContent = '';
    }
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      updateAuthUI();
      authModal.classList.add('hidden');
      loadWatchlist('movie');
      loadWatchlist('tv');
    } catch (err) {
      authError.textContent = err.message;
    }
  });

  // ----- Watchlist -----
  async function loadWatchlist(type) {
    if (!token) return;
    const grid = type === 'tv' ? watchlistTvGrid : watchlistGrid;
    try {
      const res = await fetch(`/api/watchlist?type=${type}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const items = await res.json();
      renderWatchlist(items, type, grid);
    } catch (err) {
      console.error('Watchlist load error:', err);
    }
  }

  function renderWatchlist(items, type, grid) {
    if (!items.length) {
      grid.innerHTML = '<p style="color:#b3b3b3">Nothing here yet. Start adding!</p>';
      return;
    }
    grid.innerHTML = items.map(item => `
      <div class="movie-card" data-id="${item.id}" data-type="${type}">
        <img src="${item.poster}" alt="${item.title}" loading="lazy" />
        <div class="card-info">
          <h3>${item.title}</h3>
          <p>${item.year} • ${item.language || ''}</p>
        </div>
        <button class="watched-btn" data-id="${item.id}" data-type="${type}">✔ Watched</button>
      </div>
    `).join('');
    // Card click → detail
    grid.querySelectorAll('.movie-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('watched-btn')) return;
        showDetail(card.dataset.id, card.dataset.type);
      });
    });
    // Watched button
    grid.querySelectorAll('.watched-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const btnType = btn.dataset.type;
        await markWatched(id, btnType);
      });
    });
  }

  async function addToWatchlist(movieId, type) {
    if (!token) { alert('Please login first'); return; }
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ movieId, type })
      });
      const data = await res.json();
      if (res.status === 202) {
        showOptimisticCard(movieId, type);
        pollWatchlist(movieId, type);
      } else if (res.status === 201) {
        loadWatchlist(type);
      } else {
        alert(data.error || 'Could not add');
      }
    } catch (err) {
      alert('Error adding to watchlist');
    }
  }

  function showOptimisticCard(movieId, type) {
    const grid = type === 'tv' ? watchlistTvGrid : watchlistGrid;
    const tempCard = document.createElement('div');
    tempCard.className = 'movie-card pending';
    tempCard.dataset.id = movieId;
    tempCard.dataset.type = type;
    tempCard.innerHTML = '<div class="pending-spinner"></div>';
    grid.prepend(tempCard);
  }

  function pollWatchlist(movieId, type) {
    let attempts = 0;
    const maxAttempts = 5;
    const interval = setInterval(async () => {
      attempts++;
      const res = await fetch(`/api/watchlist?type=${type}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const items = await res.json();
      const found = items.some(item => item.id == movieId);
      if (found || attempts >= maxAttempts) {
        clearInterval(interval);
        loadWatchlist(type);
      }
    }, 2000);
  }

  async function markWatched(movieId, type) {
    try {
      await fetch(`/api/watchlist/${movieId}?type=${type}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadWatchlist(type);
    } catch (err) {
      console.error(err);
    }
  }

  // ----- Detail View -----
  async function showDetail(id, type = 'movie') {
    try {
      const url = type === 'tv' ? `/api/tv/${id}` : `/api/movies/${id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Not found');
      const content = await res.json();

      const html = `
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
            ${type === 'movie' ? `<p><strong>Director:</strong> ${content.director || 'N/A'}</p>` : ''}
            <p><strong>Cast:</strong> ${(content.cast || []).join(', ')}</p>
            ${type === 'tv' && content.creator ? `<p><strong>Creator:</strong> ${content.creator}</p>` : ''}
            ${type === 'tv' && content.seasons ? `<p><strong>Seasons:</strong> ${content.seasons.map(s => `${s.name || 'Season '+s.season_number} (${s.episode_count} ep)`).join(', ')}</p>` : ''}
            ${token ? `<button class="watchlist-add-btn" data-id="${content.id}" data-type="${type}">+ Add to Your ${type === 'tv' ? 'Series' : 'Movie'}</button>` : ''}
          </div>
        </div>
        ${content.trailerUrl ? `<div class="trailer-container"><h3>Trailer</h3><iframe src="${content.trailerUrl}" allowfullscreen></iframe></div>` : ''}
      `;
      detailContent.innerHTML = html;

      const addBtn = document.querySelector('.watchlist-add-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          addToWatchlist(parseInt(addBtn.dataset.id), addBtn.dataset.type);
        });
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
    detailView.classList.add('hidden');
    homeView.classList.remove('hidden');
  });

  // ----- Home Loader -----
  async function loadHome() {
    try {
      const res = await fetch('/api/movies');
      const sections = await res.json();
      movieRowsContainer.innerHTML = '';
      sections.forEach(section => {
        if (!section.movies.length) return;
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        rowDiv.innerHTML = `
          <h2>${section.title}</h2>
          <div class="movie-grid">
            ${section.movies.map(m => `
              <div class="movie-card" data-id="${m.id}" data-type="${m.type || 'movie'}">
                <img src="${m.poster}" alt="${m.title}" loading="lazy" />
                <div class="card-info">
                  <h3>${m.title}</h3>
                  <p>${m.year} • ${m.language || ''}</p>
                </div>
                <span class="add-home-btn" data-id="${m.id}" data-type="${m.type || 'movie'}" title="Add to Your ${m.type === 'tv' ? 'Series' : 'Movie'}">+</span>
              </div>
            `).join('')}
          </div>
        `;
        movieRowsContainer.appendChild(rowDiv);
      });
      attachCardListeners();
    } catch (err) {
      console.error(err);
      movieRowsContainer.innerHTML = '<p>Failed to load movies. Is the server running?</p>';
    }
  }

  function attachCardListeners() {
    document.querySelectorAll('.movie-card').forEach(card => {
      if (card.dataset.cardListener) return;
      card.dataset.cardListener = 'true';
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-home-btn') || e.target.classList.contains('watched-btn')) return;
        const id = card.dataset.id;
        const type = card.dataset.type || 'movie';
        showDetail(id, type);
      });
    });
    document.querySelectorAll('.add-home-btn').forEach(btn => {
      if (btn.dataset.btnListener) return;
      btn.dataset.btnListener = 'true';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const type = btn.dataset.type || 'movie';
        addToWatchlist(id, type);
      });
    });
  }

  // ----- Search -----
  function performSearch(query) {
    if (!query) { clearSearch(); return; }
    fetch(`/api/search?query=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        const results = data.results || [];
        movieRowsContainer.classList.add('hidden');
        searchResultsSection.classList.remove('hidden');
        searchTitle.textContent = `Search Results for "${query}"`;
        searchGrid.innerHTML = results.length
          ? results.map(item => `
              <div class="movie-card" data-id="${item.id}" data-type="${item.type || 'movie'}">
                <img src="${item.poster}" alt="${item.title}" loading="lazy" />
                <div class="card-info">
                  <h3>${item.title}</h3>
                  <p>${item.year} • ${item.language || ''}</p>
                </div>
                <span class="add-home-btn" data-id="${item.id}" data-type="${item.type || 'movie'}" title="Add to Your ${item.type === 'tv' ? 'Series' : 'Movie'}">+</span>
              </div>
            `).join('')
          : '<p>No results found.</p>';
        attachCardListeners();
      })
      .catch(err => console.error(err));
  }

  function clearSearch() {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchResultsSection.classList.add('hidden');
    movieRowsContainer.classList.remove('hidden');
  }

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearSearchBtn.classList.toggle('hidden', val === '');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(val), 300);
  });
  clearSearchBtn.addEventListener('click', clearSearch);

  // ----- SEO routing -----
  const path = window.location.pathname;
  if (path.startsWith('/movie/')) {
    const id = path.split('/')[2];
    showDetail(id, 'movie');
  } else if (path.startsWith('/tv/')) {
    const id = path.split('/')[2];
    showDetail(id, 'tv');
  } else {
    loadHome();
  }
});