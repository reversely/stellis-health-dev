const form = document.querySelector('#auth-form');
const error = document.querySelector('#auth-error');
let registration = false;
(async () => {
  try {
    const status = await (await fetch('/api/v1/auth/status')).json();
    if (!status.required || status.username) { location.replace('/'); return; }
    registration = status.registration_open;
    document.querySelector('#auth-title').textContent = registration ? 'Create account' : 'Sign in';
    document.querySelector('#auth-submit').textContent = registration ? 'Create account' : 'Sign in';
    document.querySelector('#password').autocomplete = registration ? 'new-password' : 'current-password';
  } catch { error.textContent = 'Could not load login.'; }
})();
form.addEventListener('submit', async event => {
  event.preventDefault(); error.textContent = '';
  const button = document.querySelector('#auth-submit'); button.disabled = true;
  try {
    const response = await fetch(`/api/v1/auth/${registration ? 'register' : 'login'}`, {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:document.querySelector('#username').value,password:document.querySelector('#password').value}),
    });
    if (!response.ok) throw new Error((await response.json()).detail || 'Sign in failed');
    location.replace('/');
  } catch (problem) { error.textContent = problem.message; button.disabled = false; }
});
