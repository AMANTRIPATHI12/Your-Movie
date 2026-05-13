document.addEventListener('DOMContentLoaded', () => {
  const homeView = document.getElementById('home-view');
  const detailView = document.getElementById('detail-view');
  const movieRowsContainer = document.getElementById('movie-rows');
  const detailContent = document.getElementById('detail-content');
  const backBtn = document.getElementById('back-btn');

  // ---- Search elements ----
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const searchResultsSection = document.getElementById('search-results');
  const searchGrid = document.getElementById('search-grid');
  const searchTitle = document.getElementById('search-title');

  let debounceTimer;

  // ------------- Home loader (unchanged) -------------
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
              <div class="movie-card" data-id="${m.id}">
                <img src="${m.poster}" alt="${m.title}" loading="lazy" />
                <div class="card-info">
                  <h3>${m.title}</h3>
                  <p>${m.year} • ${m.language}</p>
                </div>
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

  // ------------- Attach click to all cards (home + search) -------------
  function attachCardListeners() {
    document.querySelectorAll('.movie-card').forEach(card => {
      // Avoid duplicate listeners
      card.removeEventListener('click', cardClickHandler);
      card.addEventListener('click', cardClickHandler);
    });
  }

  function cardClickHandler(e) {
    const card = e.currentTarget;
    showDetail(card.dataset.id);
  }

  // ------------- Detail view (unchanged) -------------
  async function showDetail(id) {
    try {
      const res = await fetch(`/api/movies/${id}`);
      if (!res.ok) throw new Error('Movie not found');
      const movie = await res.json();

      detailContent.innerHTML = `
        <div class="movie-detail">
          <img class="poster-large" src="${movie.poster}" alt="${movie.title}" />
          <div class="movie-info">
            <h1>${movie.title}</h1>
            <div class="meta">
              <span>${movie.year}</span>
              <span>${movie.language}</span>
              <span>${movie.genre.join(', ')}</span>
            </div>
            <p class="description">${movie.description}</p>
            <p class="director"><strong>Director:</strong> ${movie.director || 'N/A'}</p>
            <p class="cast"><strong>Cast:</strong> ${(movie.cast || []).join(', ') || 'N/A'}</p>
          </div>
        </div>
        <div class="trailer-container">
          <h3>Trailer</h3>
          ${movie.trailerUrl 
            ? `<iframe src="${movie.trailerUrl}" allowfullscreen></iframe>`
            : '<p>No trailer available.</p>'}
        </div>
      `;

      homeView.classList.add('hidden');
      detailView.classList.remove('hidden');
      window.scrollTo(0, 0);
    } catch (err) {
      alert('Could not load movie details.');
      console.error(err);
    }
  }

  backBtn.addEventListener('click', () => {
    detailView.classList.add('hidden');
    homeView.classList.remove('hidden');
  });

  // ------------- Search logic -------------
  function performSearch(query) {
    if (!query) {
      clearSearch();
      return;
    }

    fetch(`/api/search?query=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        const results = data.results || [];
        // Hide normal rows, show search section
        movieRowsContainer.classList.add('hidden');
        searchResultsSection.classList.remove('hidden');
        searchTitle.textContent = `Search Results for "${query}"`;

        searchGrid.innerHTML = results.length 
          ? results.map(m => `
              <div class="movie-card" data-id="${m.id}">
                <img src="${m.poster}" alt="${m.title}" loading="lazy" />
                <div class="card-info">
                  <h3>${m.title}</h3>
                  <p>${m.year} • ${m.language}</p>
                </div>
              </div>
            `).join('')
          : '<p>No movies found.</p>';

        attachCardListeners();
      })
      .catch(err => {
        console.error('Search error:', err);
      });
  }

  function clearSearch() {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchResultsSection.classList.add('hidden');
    movieRowsContainer.classList.remove('hidden');
  }

  // Debounced input
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearSearchBtn.classList.toggle('hidden', val === '');

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(val);
    }, 300); // 300ms debounce
  });

  clearSearchBtn.addEventListener('click', clearSearch);

  // Initial load
  loadHome();
});