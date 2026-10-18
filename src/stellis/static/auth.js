const form = document.querySelector('#auth-form');
const error = document.querySelector('#auth-error');
const signIn = document.querySelector('#sign-in-tab');
const signUp = document.querySelector('#sign-up-tab');
let registration = false;
let registrationOpen = false;

function showMode(createAccount) {
  registration = createAccount && registrationOpen;
  createAccount = registration;
  signIn.setAttribute('aria-current', createAccount ? 'false' : 'page');
  signUp.setAttribute('aria-current', createAccount ? 'page' : 'false');
  document.querySelector('#auth-title').textContent = createAccount ? 'Sign up' : 'Sign in';
  document.querySelector('#auth-submit').textContent = createAccount ? 'Sign up' : 'Sign in';
  document.querySelector('#username').minLength = createAccount ? 3 : 1;
  document.querySelector('#password').minLength = createAccount ? 12 : 1;
  document.querySelector('#password').autocomplete = createAccount ? 'new-password' : 'current-password';
  error.textContent = '';
}

signIn.addEventListener('click', () => showMode(false));
signUp.addEventListener('click', () => showMode(true));

(async () => {
  try {
    const response = await fetch('/api/v1/auth/status');
    if (!response.ok) throw new Error();
    const status = await response.json();
    if (!status.required || status.username) { location.replace('/'); return; }
    registrationOpen = status.registration_open;
    document.querySelector('.auth-modes').hidden = !registrationOpen;
    showMode(registrationOpen);
  } catch { error.textContent = 'Could not load account status.'; }
})();

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (registration && !registrationOpen) return;
  error.textContent = '';
  const button = document.querySelector('#auth-submit');
  button.disabled = true;
  try {
    const response = await fetch(`/api/v1/auth/${registration ? 'register' : 'login'}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: document.querySelector('#username').value,
        password: document.querySelector('#password').value}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Sign in failed');
    // A new account starts the first-run tour on its first load of the app.
    if (registration) { try { window.StellisTour?.markSignup(localStorage, result.username); } catch {} }
    location.replace('/');
  } catch (problem) { error.textContent = problem.message; }
  finally { button.disabled = false; }
});
