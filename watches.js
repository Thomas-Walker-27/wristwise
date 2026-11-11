(() => {
  const $ = id => document.getElementById(id);
  let controller;
  let revision = 0;
  let saved = [];
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render() {
    $('watch-results').replaceChildren();
    for (const record of saved) {
      const section = element('section', undefined, 'shortlist');
      section.append(element('p', new Date(record.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), 'saved-date'));
      section.append(element('h3', `${record.preferences.style} · ${money(record.preferences.minBudget)}–${money(record.preferences.maxBudget)}`));
      section.append(element('p', record.result.introduction));
      const grid = element('div', undefined, 'watch-grid');
      for (const [index, watch] of record.result.watches.entries()) {
        const card = element('article', undefined, 'watch-card');
        card.append(element('span', `0${index + 1} / YOUR SHORTLIST`, 'eyebrow'));
        card.append(element('h4', watch.name));
        card.append(element('p', `About ${money(watch.estimated_price_usd)}`, 'price'));
        for (const [label, value] of [['Why it fits', watch.why_it_fits], ['The movement', watch.movement], ['A little watch knowledge', watch.learn], ['Keep in mind', watch.tradeoff]]) {
          card.append(element('strong', label, 'detail-label'), element('p', value));
        }
        grid.append(card);
      }
      section.append(grid); $('watch-results').append(section);
    }
  }
  async function request(body, signal) {
    const response = await fetch('/api/recommendations', {
      signal, credentials: 'same-origin',
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('Recommendations are temporarily unavailable. Please try again.'); }
    if (!response.ok) throw new Error(data.error || 'We couldn’t complete your request. Please try again.');
    return data;
  }
  async function history() {
    const current = ++revision;
    $('history-status').textContent = 'Loading your saved field notes…';
    $('reload-history').hidden = true;
    try {
      const data = await request(null, controller.signal);
      if (current !== revision) return;
      saved = data.recommendations; render();
      $('history-status').textContent = saved.length ? 'Your five most recent shortlists appear here.' : 'Your first shortlist will appear here. Start with your preferences above.';
    } catch (error) {
      if (current !== revision || error.name === 'AbortError') return;
      $('history-status').textContent = error.message;
      $('reload-history').hidden = false;
    }
  }
  document.addEventListener('account-state', event => {
    controller?.abort(); controller = new AbortController(); ++revision;
    saved = []; render(); $('watch-status').textContent = ''; $('history-status').textContent = '';
    $('discovery').hidden = !event.detail.user;
    $('find-watches').disabled = false;
    $('find-watches').textContent = 'Find my watches ↗';
    if (event.detail.user) history();
  });
  $('reload-history').addEventListener('click', history);
  $('watch-form').addEventListener('submit', async event => {
    event.preventDefault();
    const minBudget = Number($('min-budget').value), maxBudget = Number($('max-budget').value);
    if (maxBudget < minBudget) { $('watch-status').textContent = 'Your maximum budget must be at least your minimum.'; return; }
    const current = ++revision;
    $('reload-history').hidden = true;
    $('history-status').textContent = saved.length ? 'Your earlier shortlists are below.' : '';
    $('find-watches').disabled = true; $('find-watches').textContent = 'Building your shortlist…';
    $('watch-status').textContent = 'Finding three matches and the stories behind them. This may take a few moments.';
    try {
      const data = await request({ minBudget, maxBudget, style: $('style').value, brands: $('brands').value, interests: $('interests').value }, controller.signal);
      if (current !== revision) return;
      saved = [data.recommendation, ...saved].slice(0, 5); render();
      $('watch-status').textContent = 'Your shortlist is ready and saved to your account.';
      $('history-status').textContent = 'Your five most recent shortlists appear here.';
      $('reload-history').hidden = true;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $('watch-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (current === revision && error.name !== 'AbortError') $('watch-status').textContent = error.message;
    } finally {
      if (current === revision) { $('find-watches').disabled = false; $('find-watches').textContent = 'Find my watches ↗'; }
    }
  });
})();
