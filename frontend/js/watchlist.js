import { checkAuth, token, currentUser, fetchWithAuth, markWatched, createWatchlistCard } from './utils.js';

// Redirect if not logged in
checkAuth().then(user => {
  if (!user) {
    window.location.href = '/';
    return;
  }
  // Update UI
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-email').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  });

  loadWatchlistPage();
});

async function loadWatchlistPage() {
  const genreGroups = document.getElementById('watchlist-genre-groups');
  genreGroups.innerHTML = '<p>Loading...</p>';

  try {
    const [movies, tvShows] = await Promise.all([
      fetchWithAuth('/api/watchlist?type=movie').then(r => r.json()),
      fetchWithAuth('/api/watchlist?type=tv').then(r => r.json())
    ]);
    const all = [...movies, ...tvShows];

    if (!all.length) {
      genreGroups.innerHTML = '<p>Your watchlist is empty. Start adding!</p>';
      return;
    }

    const groups = {};
    all.forEach(item => {
      const genre = item.genre?.[0] || 'Other';
      if (!groups[genre]) groups[genre] = [];
      groups[genre].push(item);
    });

    genreGroups.innerHTML = '';
    Object.entries(groups).forEach(([genre, items]) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';
      rowDiv.innerHTML = `
        <h2>${genre}</h2>
        <div class="movie-grid">
          ${items.map(item => createWatchlistCard(item)).join('')}
        </div>
      `;
      genreGroups.appendChild(rowDiv);
    });

    // Attach card click → go to home with detail? We'll just navigate to /movie/id or /tv/id
    document.querySelectorAll('.movie-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.classList.contains('watched-btn')) return;
        const id = card.dataset.id;
        const type = card.dataset.type;
        window.location.href = `/${type === 'tv' ? 'tv' : 'movie'}/${id}`;
      });
    });

    // Watched buttons
    document.querySelectorAll('.watched-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        await markWatched(id, type);
        loadWatchlistPage();
      });
    });
  } catch (err) {
    console.error(err);
    genreGroups.innerHTML = '<p>Error loading watchlist.</p>';
  }
}