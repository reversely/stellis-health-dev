// Both entry points open the real onboarding flow. The retired spotlight tour never resumes.
(() => {
  for (const id of ['take-tour', 'workspace-setup']) {
    document.getElementById(id)?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const response = await fetch('/api/v1/onboarding/reopen', {method:'POST'});
        const data = await response.json();
        if (!response.ok) throw Error(data.detail || 'Could not open setup. Try again.');
        location.assign('/onboarding');
      } catch (error) {
        const message = document.querySelector('#status');
        message.textContent = error.message; message.setAttribute('role', 'alert');
        button.disabled = false;
      }
    });
  }
})();
