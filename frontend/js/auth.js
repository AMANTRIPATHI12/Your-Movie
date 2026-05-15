import { token, currentUser, checkAuth, logout as logoutUtil } from './utils.js';

// DOM references (set by home.js on load)
let dom = {};

export function initAuth(elements, onAuthSuccess) {
  dom = elements;
  dom.loginBtn.addEventListener('click', () => showModal(true));
  dom.logoutBtn.addEventListener('click', () => {
    logoutUtil();
    onAuthSuccess(null);
  });
  dom.closeModal.addEventListener('click', hideModal);
  window.addEventListener('click', e => { if (e.target === dom.authModal) hideModal(); });

  dom.toggleAuth.addEventListener('click', e => {
    if (e.target.tagName === 'A') {
      e.preventDefault();
      dom.isLoginMode = !dom.isLoginMode;
      dom.authTitle.textContent = dom.isLoginMode ? 'Login' : 'Sign Up';
      dom.toggleAuth.innerHTML = dom.isLoginMode
        ? `Don't have an account? <a href="#">Sign up</a>`
        : `Already have an account? <a href="#">Login</a>`;
      dom.authError.textContent = '';
    }
  });

  dom.authForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = dom.authEmail.value.trim();
    const password = dom.authPassword.value;
    const endpoint = dom.isLoginMode ? '/api/login' : '/api/signup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      localStorage.setItem('token', data.token);
      // refresh the token in utils
      import('./utils.js').then(m => { m.token = data.token; });
      hideModal();
      const user = await checkAuth();
      onAuthSuccess(user);
    } catch (err) {
      dom.authError.textContent = err.message;
    }
  });

  // Login prompt link
  document.getElementById('login-prompt-link')?.addEventListener('click', e => {
    e.preventDefault();
    showModal(true);
  });
}

function showModal(loginMode = true) {
  dom.isLoginMode = loginMode;
  dom.authTitle.textContent = loginMode ? 'Login' : 'Sign Up';
  dom.toggleAuth.innerHTML = loginMode
    ? `Don't have an account? <a href="#">Sign up</a>`
    : `Already have an account? <a href="#">Login</a>`;
  dom.authError.textContent = '';
  dom.authModal.classList.remove('hidden');
}

function hideModal() {
  dom.authModal.classList.add('hidden');
}