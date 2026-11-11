const $ = id => document.getElementById(id);
let mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login';
async function request(action, body) {
  const response = await fetch(`/api/auth?action=${action}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Accounts are temporarily unavailable. Please try again shortly.'); }
  if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
  return data;
}
function setMode() {
  const signup = mode === 'signup';
  $('panel-title').textContent = signup ? 'Make yourself at home.' : 'Welcome back.';
  $('form-intro').textContent = signup ? 'Create your free WristWise account.' : 'Log in to your WristWise account.';
  $('submit').textContent = signup ? 'Create account ↗' : 'Log in ↗';
  $('switch-prompt').textContent = signup ? 'Already have an account?' : 'New to WristWise?';
  $('switch').textContent = signup ? 'Log in' : 'Create an account';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('password').value = '';
  $('message').textContent = '';
}
function showUser(user) {
  $('loading').hidden = true;
  $('signed-out').hidden = Boolean(user);
  $('signed-in').hidden = !user;
  if (user) $('user-email').textContent = user.email;
  document.dispatchEvent(new CustomEvent('account-state', { detail: { user } }));
}
async function load() {
  $('retry').hidden = true;
  $('message').textContent = '';
  try { showUser((await request('me')).user); }
  catch (error) {
    if (error.status === 401) showUser(null);
    else { $('loading').hidden = true; $('message').textContent = error.message; $('retry').hidden = false; }
  }
}
$('retry').addEventListener('click', load);
$('switch').addEventListener('click', () => { mode = mode === 'signup' ? 'login' : 'signup'; setMode(); });
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('submit').disabled = true; $('switch').disabled = true; $('message').textContent = '';
  try {
    const data = await request(mode, { email: $('email').value, password: $('password').value });
    $('password').value = ''; showUser(data.user);
    history.replaceState(null, '', '/account.html');
  } catch (error) { $('message').textContent = error.message; }
  finally { $('submit').disabled = false; $('switch').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true; $('message').textContent = '';
  try { await request('logout', {}); mode = 'login'; setMode(); showUser(null); }
  catch (error) { $('message').textContent = error.message; }
  finally { $('logout').disabled = false; }
});
setMode(); load();
