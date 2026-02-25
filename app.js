const STORAGE_KEY = 'oneshelf_v2';

const TYPE_CONFIG = {
  video: { label: 'Video',          icon: 'play-circle', emoji: '▶️' },
  movie: { label: 'Movie / Series', icon: 'film',        emoji: '🎬' },
  image: { label: 'Image',          icon: 'image',       emoji: '🖼️' },
  music: { label: 'Music',          icon: 'music',       emoji: '🎵' },
  url:   { label: 'URL',            icon: 'globe',       emoji: '🌐' },
  note:  { label: 'Note',           icon: 'file-text',   emoji: '📝' },
};

const FILTER_TITLES = {
  all:   'All Items',
  video: 'Videos',
  movie: 'Movies & Series',
  image: 'Images',
  music: 'Music',
  url:   'URLs',
  note:  'Notes',
};

let items         = [];
let currentFilter = 'all';
let currentSort   = 'newest';
let currentSearch = '';
let currentMode   = 'url';
let openItemId    = null;

const $ = id => document.getElementById(id);

const urlInput       = $('urlInput');
const saveUrlBtn     = $('saveUrlBtn');
const noteTitleInput = $('noteTitleInput');
const noteBodyInput  = $('noteBodyInput');
const saveNoteBtn    = $('saveNoteBtn');
const errorMsg       = $('errorMsg');
const errorText      = $('errorText');
const grid           = $('grid');
const emptyState     = $('emptyState');
const searchInput    = $('searchInput');
const sortSelect     = $('sortSelect');
const sectionTitle   = $('sectionTitle');
const itemCount      = $('itemCount');
const sidebar        = $('sidebar');
const overlay        = $('overlay');
const menuBtn        = $('menuBtn');
const sidebarClose   = $('sidebarClose');
const importBtn      = $('importBtn');
const exportBtn      = $('exportBtn');
const importFile     = $('importFile');
const modalBackdrop  = $('modalBackdrop');
const modalClose     = $('modalClose');
const modalTitle     = $('modalTitle');
const modalDesc      = $('modalDesc');
const modalBadge     = $('modalBadge');
const modalOpenBtn   = $('modalOpenBtn');
const modalDeleteBtn = $('modalDeleteBtn');
const modalThumbWrap = $('modalThumbWrap');
const urlModeEl      = $('urlMode');
const noteModeEl     = $('noteMode');

function detectType(url) {
  let hostname, pathname, href;
  try {
    const u = new URL(url);
    hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    pathname = u.pathname.toLowerCase();
    href     = u.href.toLowerCase();
  } catch {
    return 'url';
  }

  const ytHosts   = ['youtube.com', 'youtu.be', 'm.youtube.com', 'youtube-nocookie.com'];
  const imdbHosts = ['imdb.com', 'm.imdb.com'];
  const musicHosts = [
    'open.spotify.com', 'spotify.com',
    'music.apple.com', 'itunes.apple.com',
    'soundcloud.com', 'tidal.com',
    'deezer.com', 'bandcamp.com',
    'music.youtube.com',
  ];
  const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp'];
  const imgHosts = ['imgur.com', 'i.imgur.com', 'flickr.com', 'unsplash.com', 'pexels.com', 'pixabay.com'];

  if (ytHosts.some(h => hostname === h || hostname.endsWith('.' + h))) return 'video';
  if (imdbHosts.some(h => hostname === h)) return 'movie';
  if (musicHosts.some(h => hostname === h || hostname.endsWith('.' + h))) return 'music';
  if (imgExts.some(ext => pathname.endsWith(ext))) return 'image';
  if (imgHosts.some(h => hostname === h || hostname.endsWith('.' + h))) return 'image';

  return 'url';
}

function getThumbnail(url, type) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '').toLowerCase();

    if (type === 'video') {
      const ytHosts = ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'];
      if (ytHosts.some(h => hostname === h)) {
        const vid = u.searchParams.get('v');
        if (vid) return `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      }
      if (hostname === 'youtu.be') {
        const vid = u.pathname.slice(1).split('/')[0];
        if (vid) return `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      }
    }

    if (type === 'image') {
      const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp'];
      if (imgExts.some(ext => u.pathname.toLowerCase().endsWith(ext))) return url;
    }
  } catch {}
  return null;
}

function getTitle(url, type) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');

    if (type === 'video') {
      const ytHosts = ['youtube.com', 'm.youtube.com'];
      if (ytHosts.some(h => hostname.toLowerCase() === h)) {
        const vid = u.searchParams.get('v');
        return vid ? `YouTube Video (${vid})` : 'YouTube Video';
      }
      if (hostname.toLowerCase() === 'youtu.be') {
        return `YouTube Video`;
      }
    }

    if (type === 'movie') return `IMDB — ${u.pathname.split('/').filter(Boolean).join(' / ')}`;
    if (type === 'music') return `${hostname} — ${u.pathname.split('/').filter(Boolean).join(' / ')}`;
    if (type === 'image') return u.pathname.split('/').pop() || hostname;

    return hostname;
  } catch {
    return url;
  }
}

function getRootDomain(domain) {
  const parts = domain.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : domain;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.hidden = false;
  setTimeout(() => { errorMsg.hidden = true; }, 4000);
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch { items = []; }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function fetchIMDBData(href) {
  try {
    const match = href.match(/\/title\/(tt\d+)/i);
    if (!match) throw new Error();
    const id = match[1];
    const res = await fetch(`https://www.omdbapi.com/?i=${id}&apikey=trilogy`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.Response === 'False') throw new Error();
    return {
      title:       data.Title || null,
      description: data.Plot && data.Plot !== 'N/A' ? data.Plot : null,
      thumbnail:   data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
      publisher:   data.Director && data.Director !== 'N/A' ? data.Director : (data.Genre || null),
    };
  } catch {
    return { title: null, description: null, thumbnail: null, publisher: null };
  }
}

async function fetchYouTubeTitle(href) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(href)}&format=json`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { title: data.title || null, publisher: data.author_name || null };
  } catch {
    return { title: null, publisher: null };
  }
}

async function fetchMetadata(href, type) {
  if (type === 'video') {
    const yt = await fetchYouTubeTitle(href);
    if (yt.title) return { title: yt.title, description: null, thumbnail: null, publisher: yt.publisher };
  }

  if (type === 'movie') {
    const imdb = await fetchIMDBData(href);
    if (imdb.title) return imdb;
  }

  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(href)}&screenshot=false`);
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    return {
      title:       data.title || null,
      description: data.description || null,
      thumbnail:   data.image?.url || data.logo?.url || null,
      publisher:   data.publisher || null,
    };
  } catch {
    return { title: null, description: null, thumbnail: null, publisher: null };
  }
}

async function addUrl() {
  const raw = urlInput.value.trim();
  if (!raw) return;

  let href;
  try {
    href = new URL(raw.startsWith('http') ? raw : 'https://' + raw).href;
  } catch {
    showError("That doesn't look like a valid URL.");
    return;
  }

  saveUrlBtn.disabled = true;
  saveUrlBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Fetching…</span>';
  lucide.createIcons();
  errorMsg.hidden = true;

  const type    = detectType(href);
  const ytThumb = getThumbnail(href, type);
  const meta    = await fetchMetadata(href, type);

  const thumbnail = ytThumb || meta.thumbnail || null;
  const title     = meta.title || getTitle(href, type);
  const desc      = meta.description || '';
  const publisher = meta.publisher || getDomain(href);

  const item = {
    id:          uid(),
    url:         href,
    title,
    description: desc,
    publisher,
    type,
    thumbnail,
    isNote:      false,
    savedAt:     new Date().toISOString(),
  };

  items.unshift(item);
  saveItems();
  urlInput.value = '';
  render();
  updateCounts();

  saveUrlBtn.disabled = false;
  saveUrlBtn.innerHTML = '<i data-lucide="plus"></i><span>Save</span>';
  lucide.createIcons();
  urlInput.focus();
}

function addNote() {
  const body = noteBodyInput.value.trim();
  if (!body) { showError('Write something before saving.'); return; }

  const title = noteTitleInput.value.trim() || 'Untitled Note';

  const item = {
    id:      uid(),
    url:     null,
    title,
    body,
    type:    'note',
    isNote:  true,
    savedAt: new Date().toISOString(),
  };

  items.unshift(item);
  saveItems();
  noteTitleInput.value = '';
  noteBodyInput.value  = '';
  render();
  updateCounts();
}

function deleteItem(id) {
  items = items.filter(i => i.id !== id);
  saveItems();
  render();
  updateCounts();
  closeModal();
}

function getVisible() {
  let list = [...items];

  if (currentFilter !== 'all') list = list.filter(i => i.type === currentFilter);

  const q = currentSearch.toLowerCase().trim();
  if (q) {
    list = list.filter(i =>
      i.title?.toLowerCase().includes(q) ||
      i.body?.toLowerCase().includes(q) ||
      i.description?.toLowerCase().includes(q) ||
      i.publisher?.toLowerCase().includes(q) ||
      (i.url && getDomain(i.url).includes(q))
    );
  }

  switch (currentSort) {
    case 'oldest': list.sort((a, b) => a.savedAt.localeCompare(b.savedAt)); break;
    case 'az':     list.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'type':   list.sort((a, b) => a.type.localeCompare(b.type)); break;
    default:       list.sort((a, b) => b.savedAt.localeCompare(a.savedAt)); break;
  }

  return list;
}

function render() {
  const visible = getVisible();

  Array.from(grid.children).forEach(el => { if (el !== emptyState) el.remove(); });

  if (visible.length === 0) {
    emptyState.hidden = false;
    itemCount.textContent = '0 items';
    return;
  }

  emptyState.hidden = true;
  itemCount.textContent = `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`;

  visible.forEach((item, i) => {
    const card = buildCard(item, i);
    grid.appendChild(card);
  });

  lucide.createIcons();
}

function buildCard(item, index) {
  const cfg    = TYPE_CONFIG[item.type] || TYPE_CONFIG.url;
  const domain = item.url ? getDomain(item.url) : null;

  const card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = `${Math.min(index, 10) * 40}ms`;
  card.dataset.id = item.id;

  let mediaHTML = '';
  if (item.isNote) {
    mediaHTML = '';
  } else if (item.thumbnail) {
    mediaHTML = `<img class="card-thumb" src="${escHtml(item.thumbnail)}" alt="" loading="lazy"
      onerror="this.outerHTML='<div class=\\'card-thumb-placeholder\\'>${cfg.emoji}</div>'" />`;
  } else {
    mediaHTML = `<div class="card-thumb-placeholder">${cfg.emoji}</div>`;
  }

  const notePreview = item.isNote
    ? `<div class="card-note-preview">${escHtml(item.body)}</div>`
    : '';

  const subLine = item.publisher
    ? `<div class="card-sub">${escHtml(item.publisher)}</div>`
    : domain ? `<div class="card-sub">${escHtml(domain)}</div>` : '';

  const descLine = (!item.isNote && item.description)
    ? `<div class="card-desc">${escHtml(item.description)}</div>`
    : '';

  card.innerHTML = `
    ${mediaHTML}
    <div class="card-body">
      <div class="card-top">
        <span class="badge badge-${item.type}">
          <i data-lucide="${cfg.icon}"></i> ${cfg.label}
        </span>
        <button class="card-del-btn" title="Remove">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <div class="card-title">${escHtml(item.title)}</div>
      ${notePreview}
      ${subLine}
      ${descLine}
      <div class="card-footer">
        <div class="card-domain">
          ${domain ? `<img class="card-favicon" src="https://${escHtml(getRootDomain(domain))}/favicon.ico"
            alt="" onerror="this.style.display='none'" />${escHtml(domain)}` : '<span>Note</span>'}
        </div>
        <div class="card-date">${fmtDate(item.savedAt)}</div>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-del-btn')) return;
    openModal(item.id);
  });

  card.querySelector('.card-del-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Remove "${item.title}"?`)) deleteItem(item.id);
  });

  return card;
}

function updateCounts() {
  const types = ['all', 'video', 'movie', 'image', 'music', 'url', 'note'];
  types.forEach(t => {
    const el = $(`count-${t}`);
    if (el) el.textContent = t === 'all' ? items.length : items.filter(i => i.type === t).length;
  });
}

function setFilter(f) {
  currentFilter = f;
  sectionTitle.textContent = FILTER_TITLES[f] || 'Items';

  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.filter === f));
  document.querySelectorAll('.chip').forEach(el => el.classList.toggle('active', el.dataset.filter === f));

  render();
}

function openModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  openItemId = id;

  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.url;

  modalBadge.innerHTML = `<span class="badge badge-${item.type}"><i data-lucide="${cfg.icon}"></i> ${cfg.label}</span>`;
  modalTitle.textContent = item.title;

  if (item.isNote) {
    modalThumbWrap.innerHTML = '';
    const noteBody = document.createElement('div');
    noteBody.className = 'modal-note-body';
    noteBody.textContent = item.body;
    modalTitle.insertAdjacentElement('afterend', noteBody);
    modalOpenBtn.classList.add('note-only');
  } else {
    document.querySelector('.modal-note-body')?.remove();
    if (item.thumbnail) {
      modalThumbWrap.innerHTML = `<img src="${escHtml(item.thumbnail)}" alt=""
        onerror="this.outerHTML='<div class=\\'modal-placeholder\\'>${cfg.emoji}</div>'" />`;
    } else {
      modalThumbWrap.innerHTML = `<div class="modal-placeholder">${cfg.emoji}</div>`;
    }
    modalOpenBtn.classList.remove('note-only');
    modalOpenBtn.href = item.url;
  }

  if (item.description) {
    modalDesc.textContent = item.description;
    modalDesc.hidden = false;
  } else {
    modalDesc.hidden = true;
  }

  modalBackdrop.hidden = false;
  lucide.createIcons();
}

function closeModal() {
  modalBackdrop.hidden = true;
  openItemId = null;
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.paste-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  urlModeEl.classList.toggle('hidden', mode !== 'url');
  noteModeEl.classList.toggle('hidden', mode !== 'note');
  errorMsg.hidden = true;
}

document.querySelectorAll('.paste-tab').forEach(btn => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

saveUrlBtn.addEventListener('click', addUrl);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(); });

saveNoteBtn.addEventListener('click', addNote);
noteBodyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote();
});

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => { setFilter(btn.dataset.filter); closeSidebar(); });
});
document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
});

searchInput.addEventListener('input', () => { currentSearch = searchInput.value; render(); });
sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; render(); });

function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('visible'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); }

menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
modalDeleteBtn.addEventListener('click', () => {
  const item = items.find(i => i.id === openItemId);
  if (item && confirm(`Remove "${item.title}"?`)) deleteItem(openItemId);
});

exportBtn.addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), items }, null, 2)],
    { type: 'application/json' }
  );
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `oneshelf-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed   = JSON.parse(ev.target.result);
      const incoming = Array.isArray(parsed) ? parsed : (parsed.items || []);
      if (!Array.isArray(incoming)) throw new Error();
      const existing = new Set(items.map(i => i.id));
      const fresh    = incoming.filter(i => !existing.has(i.id));
      items = [...fresh, ...items];
      saveItems();
      render();
      updateCounts();
      alert(`Imported ${fresh.length} new item${fresh.length !== 1 ? 's' : ''}.`);
    } catch {
      alert('Could not read file — make sure it is a valid OneShelf export.');
    }
    importFile.value = '';
  };
  reader.readAsText(file);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!modalBackdrop.hidden) { closeModal(); return; }
    if (sidebar.classList.contains('open')) { closeSidebar(); return; }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
  }
});

(function init() {
  loadItems();
  render();
  updateCounts();
  lucide.createIcons();
  urlInput.focus();
})();