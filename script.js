const DATA = window.DATA || [];
const REPORT_EMAIL = ''; // При необходимости укажите e-mail администратора, например: 'name@ascon.ru'
const STORAGE_KEYS = {
  view: 'kbViewMode',
  favorites: 'kbFavorites',
  recent: 'kbRecentMaterials'
};
const state = {
  query: '',
  section: '',
  subsection: '',
  type: '',
  status: '',
  sort: 'default',
  view: localStorage.getItem(STORAGE_KEYS.view) || 'cards',
  favoritesOnly: false
};
const byId = (id) => document.getElementById(id);
let activeDetailsId = null;

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function statusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('актуально')) return 'status-actual';
  if (s.includes('провер')) return 'status-check';
  if (s.includes('устар')) return 'status-old';
  if (s.includes('разработ')) return 'status-dev';
  return '';
}
function safe(text) {
  return String(text || '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function jsLiteral(text) { return JSON.stringify(String(text || '')); }
function isRealLink(url) { return /^https?:\/\//i.test(String(url || '').trim()); }
function hasDSP(x) {
  const blob = [x['ID'], x['Раздел'], x['Подраздел'], x['Название материала'], x['Краткое описание'], x['Сценарий использования'], x['Тип материала'], x['Ключевые слова'], x['Уровень доступа']].join(' ').toUpperCase();
  return blob.includes('ДСП');
}
function compareText(a, b) { return String(a || '').localeCompare(String(b || ''), 'ru', { sensitivity: 'base', numeric: true }); }

function readList(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}
function writeList(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getFavorites() { return readList(STORAGE_KEYS.favorites); }
function setFavorites(ids) { writeList(STORAGE_KEYS.favorites, unique(ids)); }
function isFavorite(id) { return getFavorites().includes(String(id)); }
function toggleFavorite(id, event) {
  if (event) event.stopPropagation();
  id = String(id);
  const ids = getFavorites();
  const next = ids.includes(id) ? ids.filter(x => x !== id) : [id, ...ids];
  setFavorites(next);
  render();
  renderRecent();
  if (activeDetailsId === id) updateModalFavoriteButton(id);
}
function setFavoritesOnly(value) {
  state.favoritesOnly = Boolean(value);
  byId('favoritesOnlyBtn').classList.toggle('active', state.favoritesOnly);
  render();
}
function recordOpen(id) {
  id = String(id || '');
  if (!id) return;
  const next = [id, ...readList(STORAGE_KEYS.recent).filter(x => x !== id)].slice(0, 8);
  writeList(STORAGE_KEYS.recent, next);
  renderRecent();
}
function renderRecent() {
  const box = byId('recentList');
  if (!box) return;
  const ids = readList(STORAGE_KEYS.recent);
  const items = ids.map(id => DATA.find(x => x['ID'] === id)).filter(Boolean).slice(0, 6);
  if (!items.length) {
    box.innerHTML = '<div class="recent-empty">Здесь появятся материалы, которые вы открывали</div>';
    return;
  }
  box.innerHTML = items.map(x => `
    <button type="button" class="recent-item" onclick='openDetails(${jsLiteral(x['ID'])})'>
      <span>${safe(x['Название материала'])}</span>
      <small>${safe(x['Раздел'])}</small>
    </button>`).join('');
}

function setViewMode(view) {
  state.view = view === 'list' ? 'list' : 'cards';
  localStorage.setItem(STORAGE_KEYS.view, state.view);
  document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
  render();
}

function initFilters() {
  const sections = unique(DATA.map(x => x['Раздел']));
  const types = unique(DATA.map(x => x['Тип материала']));
  if (byId('sectionCount')) byId('sectionCount').textContent = sections.length;
  byId('totalCount').textContent = DATA.length;
  if (byId('checkCount')) byId('checkCount').textContent = DATA.filter(x => (x['Статус'] || '').toLowerCase().includes('провер')).length;

  for (const section of sections) byId('sectionFilter').insertAdjacentHTML('beforeend', `<option value="${safe(section)}">${safe(section)}</option>`);
  for (const type of types) byId('typeFilter').insertAdjacentHTML('beforeend', `<option value="${safe(type)}">${safe(type)}</option>`);

  renderSections(sections);
  refreshSubsectionControls();
  renderRecent();
}

function getSubsectionsForCurrentSection() {
  const source = state.section ? DATA.filter(x => x['Раздел'] === state.section) : DATA;
  return unique(source.map(x => x['Подраздел']));
}

function renderSections(sections) {
  const counts = Object.fromEntries(sections.map(s => [s, DATA.filter(x => x['Раздел'] === s).length]));
  byId('sectionList').innerHTML = `
    <div class="section-btn active" data-section=""><span>Все материалы</span><span class="count">${DATA.length}</span></div>
    ${sections.map(s => `<div class="section-btn" data-section="${safe(s)}"><span>${safe(s)}</span><span class="count">${counts[s]}</span></div>`).join('')}
  `;
  document.querySelectorAll('.section-btn').forEach(btn => btn.addEventListener('click', () => {
    state.section = btn.dataset.section;
    state.subsection = '';
    byId('sectionFilter').value = state.section;
    refreshSubsectionControls();
    render();
  }));
}

function refreshSubsectionControls() {
  const subsections = getSubsectionsForCurrentSection();
  const select = byId('subsectionFilter');
  select.innerHTML = '<option value="">Все подразделы</option>' + subsections.map(s => `<option value="${safe(s)}">${safe(s)}</option>`).join('');
  select.value = state.subsection;
  renderSubsections(subsections);
}

function renderSubsections(subsections) {
  const rows = state.section ? DATA.filter(x => x['Раздел'] === state.section) : DATA;
  const counts = Object.fromEntries(subsections.map(s => [s, rows.filter(x => x['Подраздел'] === s).length]));
  const allLabel = state.section ? `Все подразделы ${state.section}` : 'Все подразделы';
  byId('subsectionList').innerHTML = `
    <div class="subsection-btn active" data-subsection=""><span>${safe(allLabel)}</span><span class="count">${rows.length}</span></div>
    ${subsections.map(s => `<div class="subsection-btn" data-subsection="${safe(s)}"><span>${safe(s)}</span><span class="count">${counts[s]}</span></div>`).join('')}
  `;
  document.querySelectorAll('.subsection-btn').forEach(btn => btn.addEventListener('click', () => {
    state.subsection = btn.dataset.subsection;
    byId('subsectionFilter').value = state.subsection;
    render();
  }));
}

function filtered() {
  const q = state.query.trim().toLowerCase();
  const favorites = getFavorites();
  return DATA.filter(x => {
    const blob = [x['ID'], x['Раздел'], x['Подраздел'], x['Название материала'], x['Краткое описание'], x['Сценарий использования'], x['Тип материала'], x['Для кого'], x['Ключевые слова'], x['Статус']].join(' ').toLowerCase();
    return (!q || blob.includes(q)) &&
      (!state.section || x['Раздел'] === state.section) &&
      (!state.subsection || x['Подраздел'] === state.subsection) &&
      (!state.type || x['Тип материала'] === state.type) &&
      (!state.status || x['Статус'] === state.status) &&
      (!state.favoritesOnly || favorites.includes(String(x['ID'])));
  });
}

function sortRows(rows) {
  const arr = [...rows];
  switch (state.sort) {
    case 'title':
      return arr.sort((a, b) => compareText(a['Название материала'], b['Название материала']));
    case 'section':
      return arr.sort((a, b) => compareText(a['Раздел'], b['Раздел']) || compareText(a['Подраздел'], b['Подраздел']) || compareText(a['Название материала'], b['Название материала']));
    case 'type':
      return arr.sort((a, b) => compareText(a['Тип материала'], b['Тип материала']) || compareText(a['Название материала'], b['Название материала']));
    case 'status':
      return arr.sort((a, b) => compareText(a['Статус'], b['Статус']) || compareText(a['Название материала'], b['Название материала']));
    default:
      return arr;
  }
}

function render() {
  document.querySelectorAll('.section-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.section === state.section));
  document.querySelectorAll('.subsection-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.subsection === state.subsection));
  byId('favoritesOnlyBtn').classList.toggle('active', state.favoritesOnly);
  byId('contentTitle').textContent = state.favoritesOnly ? 'Избранное' : (state.subsection || state.section || 'Все материалы');
  if (state.query) {
    byId('contentSub').textContent = `Результаты поиска по запросу: «${state.query}»`;
  } else if (state.favoritesOnly) {
    byId('contentSub').textContent = 'Показаны только материалы, добавленные в избранное на этом ПК.';
  } else if (state.subsection) {
    byId('contentSub').textContent = `Раздел: ${state.section || 'Все разделы'} · Подраздел: ${state.subsection}`;
  } else if (state.section) {
    byId('contentSub').textContent = `Выбран раздел «${state.section}». При необходимости выберите подраздел слева или в верхнем фильтре.`;
  } else {
    byId('contentSub').textContent = 'Выберите раздел, подраздел или воспользуйтесь поиском.';
  }

  const rows = sortRows(filtered());
  byId('visibleCount').textContent = rows.length;
  const cards = byId('cards');
  cards.classList.toggle('list-view', state.view === 'list');
  document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
  if (!rows.length) { cards.innerHTML = '<div class="empty">Ничего не найдено. Попробуйте изменить запрос, сбросить фильтры или отключить режим «Избранное».</div>'; return; }

  if (state.view === 'list') {
    cards.innerHTML = rows.map((x) => renderListCard(x)).join('');
    return;
  }

  cards.innerHTML = rows.map((x) => renderTileCard(x)).join('');
}

function renderFavoriteButton(x, className = '') {
  const active = isFavorite(x['ID']);
  return `<button type="button" class="favorite-btn ${className} ${active ? 'active' : ''}" title="${active ? 'Убрать из избранного' : 'Добавить в избранное'}" onclick='toggleFavorite(${jsLiteral(x['ID'])}, event)'>${active ? '★' : '☆'}</button>`;
}
function renderTileCard(x) {
  const link = x['Ссылка'];
  const linkBtn = isRealLink(link) ? `<a class="primary" href="${safe(link)}" target="_blank" rel="noopener" onclick='recordOpen(${jsLiteral(x['ID'])})'>Открыть ссылку</a>` : `<span class="disabled-link">Ссылка не добавлена</span>`;
  const dspBadge = hasDSP(x) ? `<span class="tag tag-dsp" title="Материал с пометкой ДСП / ограниченного доступа">ДСП</span>` : '';
  return `<article class="card ${hasDSP(x) ? 'card-dsp' : ''}">
    ${renderFavoriteButton(x, 'card-favorite')}
    <div class="card-status pill ${statusClass(x['Статус'])}"><span class="tag-label">Статус:</span> ${safe(x['Статус'])}</div>
    <h3>${safe(x['Название материала'])}</h3>
    <div class="meta meta-structured">
      <span class="tag tag-section"><span class="tag-label">Раздел:</span> ${safe(x['Раздел'])}</span>
      <span class="tag tag-subsection"><span class="tag-label">Подраздел:</span> ${safe(x['Подраздел'])}</span>
      <span class="tag tag-type"><span class="tag-label">Тип:</span> ${safe(x['Тип материала'])}</span>
      ${dspBadge}
    </div>
    <div class="scenario"><strong>Когда использовать:</strong><br>${safe(x['Сценарий использования'])}</div>
    <div class="actions">
      <button class="secondary" onclick='openDetails(${jsLiteral(x['ID'])})'>Подробнее</button>
      ${linkBtn}
    </div>
  </article>`;
}
function renderListCard(x) {
  const link = x['Ссылка'];
  const linkBtn = isRealLink(link) ? `<a class="primary" href="${safe(link)}" target="_blank" rel="noopener" onclick='recordOpen(${jsLiteral(x['ID'])})'>Открыть ссылку</a>` : `<span class="disabled-link">Ссылка не добавлена</span>`;
  const dspBadge = hasDSP(x) ? `<span class="tag tag-dsp" title="Материал с пометкой ДСП / ограниченного доступа">ДСП</span>` : '';
  return `<article class="card list-card ${hasDSP(x) ? 'card-dsp' : ''}">
    ${renderFavoriteButton(x, 'list-favorite')}
    <div class="list-main">
      <h3>${safe(x['Название материала'])}</h3>
      <div class="list-scenario"><strong>Когда использовать:</strong> ${safe(x['Сценарий использования'])}</div>
    </div>
    <div class="list-section">
      <div><span class="tag-label">Раздел:</span> ${safe(x['Раздел'])}</div>
      <div><span class="tag-label">Подраздел:</span> ${safe(x['Подраздел'])}</div>
      <div><span class="tag-label">Тип:</span> ${safe(x['Тип материала'])}</div>
      ${dspBadge ? `<div class="list-dsp-row">${dspBadge}</div>` : ''}
    </div>
    <div class="list-side-actions">
      <div class="list-status"><span class="pill ${statusClass(x['Статус'])}"><span class="tag-label">Статус:</span> ${safe(x['Статус'])}</span></div>
      <div class="actions list-actions">
        <button class="secondary" onclick='openDetails(${jsLiteral(x['ID'])})'>Подробнее</button>
        ${linkBtn}
      </div>
    </div>
  </article>`;
}

function openDetails(id) {
  const x = DATA.find(i => i['ID'] === id);
  if (!x) return;
  activeDetailsId = id;
  recordOpen(id);
  byId('modalTitle').textContent = x['Название материала'];
  const dspBadge = hasDSP(x) ? ` <span class="tag tag-dsp" title="Материал с пометкой ДСП / ограниченного доступа">ДСП</span>` : '';
  byId('modalMeta').innerHTML = `<span class="tag tag-id"><span class="tag-label">ID:</span> ${safe(x['ID'])}</span> <span class="tag tag-section"><span class="tag-label">Раздел:</span> ${safe(x['Раздел'])}</span> <span class="tag tag-subsection"><span class="tag-label">Подраздел:</span> ${safe(x['Подраздел'])}</span> <span class="tag tag-type"><span class="tag-label">Тип:</span> ${safe(x['Тип материала'])}</span> <span class="tag tag-status ${statusClass(x['Статус'])}"><span class="tag-label">Статус:</span> ${safe(x['Статус'])}</span>${dspBadge}`;
  const linkText = isRealLink(x['Ссылка']) ? `<a href="${safe(x['Ссылка'])}" target="_blank" rel="noopener" onclick='recordOpen(${jsLiteral(x['ID'])})'>${safe(x['Ссылка'])}</a>` : safe(x['Ссылка'] || 'Ссылка не добавлена');
  const openBtn = isRealLink(x['Ссылка']) ? `<a class="primary detail-action" href="${safe(x['Ссылка'])}" target="_blank" rel="noopener" onclick='recordOpen(${jsLiteral(x['ID'])})'>Открыть ссылку</a>` : `<span class="disabled-link detail-action">Ссылка не добавлена</span>`;
  byId('modalBody').innerHTML = `
    <div class="modal-actions-top">
      ${renderFavoriteButton(x, 'modal-favorite')}
      ${openBtn}
      <button type="button" class="secondary detail-action" onclick='reportError(${jsLiteral(x['ID'])})'>Сообщить об ошибке</button>
    </div>
    <p class="desc">${safe(x['Краткое описание'])}</p>
    <div class="detail-grid">
      <div>Раздел</div><div>${safe(x['Раздел'])}</div>
      <div>Подраздел</div><div>${safe(x['Подраздел'])}</div>
      <div>Тип материала</div><div>${safe(x['Тип материала'])}</div>
      <div>Для кого</div><div>${safe(x['Для кого'])}</div>
      <div>Сценарий использования</div><div>${safe(x['Сценарий использования'])}</div>
      <div>Ключевые слова</div><div>${safe(x['Ключевые слова'])}</div>
      <div>Ссылка</div><div>${linkText}</div>
      <div>Уровень доступа</div><div>${safe(x['Уровень доступа'])}</div>
      ${hasDSP(x) ? '<div>Пометка</div><div><span class="tag tag-dsp">ДСП / ограниченный доступ</span></div>' : ''}
    </div>`;
  byId('modalBackdrop').style.display = 'block';
}
function updateModalFavoriteButton(id) {
  document.querySelectorAll('.modal-favorite').forEach(btn => {
    const active = isFavorite(id);
    btn.classList.toggle('active', active);
    btn.textContent = active ? '★' : '☆';
    btn.title = active ? 'Убрать из избранного' : 'Добавить в избранное';
  });
}
async function copyMaterialLink(id) {
  const x = DATA.find(i => i['ID'] === id);
  const url = x ? String(x['Ссылка'] || '').trim() : '';
  if (!isRealLink(url)) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Ссылка скопирована');
  } catch (e) {
    const helper = document.createElement('textarea');
    helper.value = url;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    document.body.removeChild(helper);
    showToast('Ссылка скопирована');
  }
}
function reportError(id) {
  const x = DATA.find(i => i['ID'] === id);
  if (!x) return;
  const subject = `Ошибка в базе знаний: ${x['ID']} — ${x['Название материала']}`;
  const body = [
    'Здравствуйте!',
    '',
    'Сообщаю об ошибке в базе знаний.',
    '',
    `ID: ${x['ID']}`,
    `Материал: ${x['Название материала']}`,
    `Раздел: ${x['Раздел']}`,
    `Подраздел: ${x['Подраздел']}`,
    `Ссылка: ${x['Ссылка'] || 'ссылка не добавлена'}`,
    '',
    'Описание проблемы:',
    ''
  ].join('\n');
  const mailto = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}
function showToast(text) {
  let toast = byId('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

byId('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
byId('sectionFilter').addEventListener('change', (e) => {
  state.section = e.target.value;
  state.subsection = '';
  refreshSubsectionControls();
  render();
});
byId('subsectionFilter').addEventListener('change', (e) => { state.subsection = e.target.value; render(); });
byId('typeFilter').addEventListener('change', (e) => { state.type = e.target.value; render(); });
byId('statusFilter').addEventListener('change', (e) => { state.status = e.target.value; render(); });
byId('sortFilter').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => setViewMode(btn.dataset.view)));
byId('favoritesOnlyBtn').addEventListener('click', () => setFavoritesOnly(!state.favoritesOnly));
byId('resetBtn').addEventListener('click', () => {
  state.query = ''; state.section = ''; state.subsection = ''; state.type = ''; state.status = ''; state.sort = 'default'; state.favoritesOnly = false;
  byId('search').value = ''; byId('sectionFilter').value = ''; byId('subsectionFilter').value = ''; byId('typeFilter').value = ''; byId('statusFilter').value = ''; byId('sortFilter').value = 'default';
  refreshSubsectionControls();
  render();
});
byId('closeModal').addEventListener('click', () => byId('modalBackdrop').style.display = 'none');
byId('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') byId('modalBackdrop').style.display = 'none'; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') byId('modalBackdrop').style.display = 'none'; });

initFilters();
render();
