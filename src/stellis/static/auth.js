const form = document.querySelector('#auth-form');
const recoveryForm = document.querySelector('#recovery-form');
const recoveryPanel = document.querySelector('#recovery-code-panel');
const recoveryLink = document.querySelector('#show-recovery');
const error = document.querySelector('#auth-error');
let registration = false;

(async () => {
  try {
    const response = await fetch('/api/v1/auth/status');
    if (!response.ok) throw new Error();
    const status = await response.json();
    if (!status.required || status.username) { location.replace('/'); return; }
    registration = status.registration_open;
    document.querySelector('#auth-title').textContent = registration ? 'Create account' : 'Sign in';
    document.querySelector('#auth-submit').textContent = registration ? 'Create account' : 'Sign in';
    document.querySelector('#password').autocomplete = registration ? 'new-password' : 'current-password';
    recoveryLink.hidden = registration;
  } catch { error.textContent = 'Could not load login.'; }
})();

form.addEventListener('submit', async event => {
  event.preventDefault(); error.classList.remove('success'); error.textContent = '';
  const button = document.querySelector('#auth-submit'); button.disabled = true;
  try {
    const response = await fetch(`/api/v1/auth/${registration ? 'register' : 'login'}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:document.querySelector('#username').value,
        password:document.querySelector('#password').value}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Sign in failed');
    if (result.recovery_code) {
      form.reset();
      form.hidden = true;
      recoveryPanel.hidden = false;
      document.querySelector('#auth-title').textContent = 'Save recovery code';
      document.querySelector('#recovery-code').textContent = result.recovery_code;
      document.querySelector('#copy-recovery-code').focus();
    } else location.replace('/');
  } catch (problem) { error.textContent = problem.message; }
  finally { button.disabled = false; }
});

recoveryLink.addEventListener('click', () => {
  form.hidden = true; recoveryLink.hidden = true; recoveryForm.hidden = false; error.classList.remove('success'); error.textContent = '';
  document.querySelector('#auth-title').textContent = 'Reset password';
  document.querySelector('#recovery-username').focus();
});
document.querySelector('#back-to-login').addEventListener('click', () => {
  recoveryForm.hidden = true; form.hidden = false; recoveryLink.hidden = false; error.classList.remove('success'); error.textContent = '';
  document.querySelector('#auth-title').textContent = 'Sign in';
  document.querySelector('#username').focus();
});
recoveryForm.addEventListener('submit', async event => {
  event.preventDefault(); error.classList.remove('success'); error.textContent = '';
  const button = recoveryForm.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const response = await fetch('/api/v1/auth/recover', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:document.querySelector('#recovery-username').value,
        recovery_code:document.querySelector('#recovery-code-input').value,
        new_password:document.querySelector('#new-password').value}),
    });
    if (!response.ok) throw new Error((await response.json()).detail || 'Password reset failed');
    recoveryForm.reset(); form.reset(); recoveryForm.hidden = true; form.hidden = false; recoveryLink.hidden = false;
    document.querySelector('#auth-title').textContent = 'Sign in';
    error.classList.add('success'); error.textContent = 'Password reset. Sign in with your new password.';
    document.querySelector('#username').focus();
  } catch (problem) { error.textContent = problem.message; }
  finally { button.disabled = false; }
});
document.querySelector('#copy-recovery-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#recovery-code').textContent);
    error.classList.add('success'); error.textContent = 'Code copied.';
  } catch { error.textContent = 'Select and copy the code above.'; }
});
document.querySelector('#continue-to-app').addEventListener('click', () => location.replace('/'));
