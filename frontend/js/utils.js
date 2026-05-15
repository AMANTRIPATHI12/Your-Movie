// ========== GLOBAL STATE ==========
export let token = localStorage.getItem('token');
export let currentUser = null;

// ========== AUTH HELPERS ==========
export async function checkAuth() {
  if (!token) return null;
  try {
    const res = await fetch('/api/user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Invalid token');
    const user = await res.json();
    currentUser = user;
    return user;
  } catch {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    return null;
  }
}

export function logout() {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
}

// ========== API WRAPPERS ==========
export async function fetchWithAuth(url, options = {}) {
  if (token) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
  }
  return fetch(url, options);
}

// ========== CARD RENDERING ==========
export function createMovieCard(item) {
  return `
    <div class="movie-card" data-id="${item.id}" data-type="${item.type || 'movie'}">
      <img src="${item.poster}" alt="${item.title}" loading="lazy" />
      <div class="card-info">
        <h3>${item.title}</h3>
        <p>${item.year} · ${item.language || ''}</p>
      </div>
      <div class="add-dropdown">
        <span class="add-trigger" data-id="${item.id}" data-type="${item.type || 'movie'}">+</span>
        <div class="add-menu">
          <div class="add-option ${item.type === 'tv' ? 'hidden' : ''}" data-action="movie">🎬 Your Movie</div>
          <div class="add-option ${item.type === 'movie' ? 'hidden' : ''}" data-action="tv">📺 Your Series</div>
          <div class="add-option disabled">👥 Save to Group (soon)</div>
        </div>
      </div>
    </div>
  `;
}

export function createWatchlistCard(item) {
  return `
    <div class="movie-card" data-id="${item.id}" data-type="${item.type}">
      <img src="${item.poster}" alt="${item.title}" loading="lazy" />
      <div class="card-info">
        <h3>${item.title}</h3>
        <p>${item.year} · ${item.type === 'tv' ? 'TV' : 'Movie'}</p>
      </div>
      <button class="watched-btn" data-id="${item.id}" data-type="${item.type}">✔ Watched</button>
    </div>
  `;
}

// ========== DROPDOWN LOGIC ==========
export function toggleDropdown(trigger) {
  const dropdown = trigger.parentElement;
  document.querySelectorAll('.add-dropdown.active').forEach(d => {
    if (d !== dropdown) d.classList.remove('active');
  });
  dropdown.classList.toggle('active');
}

export function attachDropdownListeners() {
  document.querySelectorAll('.add-trigger').forEach(trig => {
    if (trig.dataset.trigListener) return;
    trig.dataset.trigListener = 'true';
    trig.addEventListener('click', e => {
      e.stopPropagation();
      toggleDropdown(trig);
    });
  });

  document.querySelectorAll('.add-option:not(.disabled)').forEach(opt => {
    if (opt.dataset.optListener) return;
    opt.dataset.optListener = 'true';
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const dropdown = opt.closest('.add-dropdown');
      const trigger = dropdown.querySelector('.add-trigger');
      const id = parseInt(trigger.dataset.id);
      const type = trigger.dataset.type;
      // Custom event to be handled by the page
      document.dispatchEvent(new CustomEvent('add-to-watchlist', { detail: { id, type } }));
      dropdown.classList.remove('active');
    });
  });
}

// Global click to close dropdowns
document.addEventListener('click', () => {
  document.querySelectorAll('.add-dropdown.active').forEach(d => d.classList.remove('active'));
});

// ========== WATCHLIST ADD (to be used by pages) ==========
export async function addToWatchlist(movieId, type) {
  if (!token) {
    alert('Please login first');
    return;
  }
  try {
    const res = await fetchWithAuth('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieId, type })
    });
    const data = await res.json();
    if (res.status === 202) {
      // queued – handled by page
      document.dispatchEvent(new CustomEvent('watchlist-queued', { detail: { movieId, type } }));
    } else if (res.status === 201) {
      document.dispatchEvent(new CustomEvent('watchlist-updated', { detail: { type } }));
    } else {
      alert(data.error || 'Could not add');
    }
  } catch (err) {
    alert('Error adding to watchlist');
  }
}

export async function markWatched(movieId, type) {
  try {
    await fetchWithAuth(`/api/watchlist/${movieId}?type=${type}`, { method: 'DELETE' });
    document.dispatchEvent(new CustomEvent('watchlist-updated', { detail: { type } }));
  } catch (err) {
    console.error(err);
  }
}