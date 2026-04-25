// config
const STORAGE_KEY = 'oneshelf_v2';
const TYPE_CONFIG = {
  video: { label: 'Video',          icon: 'play-circle' },
  movie: { label: 'Movie / Series', icon: 'film'        },
  image: { label: 'Image',          icon: 'image'       },
  music: { label: 'Music',          icon: 'music'       },
  url:   { label: 'URL',            icon: 'globe'       },
  note:  { label: 'Note',           icon: 'file-text'   },
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

// state
let currentFilter = 'all'; 
let currentSort   = 'newest';
let currentSearch = '';
let currentMode   = 'url';
let items         = [];
// let previewAudio = null;

// dom
const $ = id => document.getElementById(id);
const addBtn         = $('addBtn');
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
const settingsBtn    = $('settingsBtn');
const importFile     = $('importFile');
let openItemId    = null;
const modal          = $('modal');
const modalBackdrop  = $('modalBackdrop');
const modalClose     = $('modalClose');
const modalTitle     = $('modalTitle');
const modalDesc      = $('modalDesc');
const modalContentBar = $('modalContentBar');

const modalOpenBtn   = $('modalOpenBtn');
const modalDeleteBtn = $('modalDeleteBtn');
const modalThumbWrap = $('modalThumbWrap');
const toastContainer = $('toastContainer');

// feedback
function showToast(msg, type = 'success') {
  const icons = { success: 'check-circle-2', error: 'alert-circle', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i data-lucide="${icons[type] || icons.info}"></i><span>${escHtml(msg)}</span>`;
  toastContainer.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3600);
}
function confirmCardDelete(itemTitle, onConfirm) {
  if (confirm(`Remove "${itemTitle}"?`)) onConfirm();
}

// detection
function detectType(url) {
  let hostname, pathname;
  try {
    const u = new URL(url);
    hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    pathname = u.pathname.toLowerCase();
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
  const imgExts  = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp'];
  const imgHosts = ['imgur.com', 'i.imgur.com', 'flickr.com', 'unsplash.com', 'pexels.com', 'pixabay.com'];

  if (ytHosts.some(h => hostname === h || hostname.endsWith('.' + h))) return 'video';
  if (imdbHosts.some(h => hostname === h)) return 'movie';
  if (musicHosts.some(h => hostname === h || hostname.endsWith('.' + h))) return 'music';
  if (imgExts.some(ext => pathname.endsWith(ext))) return 'image';
  if (imgHosts.some(h => hostname === h || hostname.endsWith('.' + h))) return 'image';

  return 'url';
}

// assets
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
      if (hostname.toLowerCase() === 'youtu.be') return `YouTube Video`;
    }

    if (type === 'movie') return `IMDB — ${u.pathname.split('/').filter(Boolean).join(' / ')}`;
    if (type === 'music') return `${hostname} — ${u.pathname.split('/').filter(Boolean).join(' / ')}`;
    if (type === 'image') return u.pathname.split('/').pop() || hostname;

    return hostname;
  } catch {
  }
}

function getRootDomain(domain) {
  const parts = domain.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : domain;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.hidden = false;
  setTimeout(() => { errorMsg.hidden = true; }, 4000);
}

// data
function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch { items = []; }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// scrapers
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
      title: data.Title || null,
      description: data.Plot !== 'N/A' ? data.Plot : null,
      thumbnail: data.Poster !== 'N/A' ? data.Poster : null,
      publisher: data.Director !== 'N/A' ? data.Director : (data.Genre || null),
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

// storage actions
async function addUrl(customInput) {
  const input = customInput || document.getElementById('urlInput');
  const raw = input.value.trim();
  if (!raw) return;
  const saveBtn = document.getElementById('saveUrlBtn');

  let href;
  try {
    href = new URL(raw.startsWith('http') ? raw : 'https://' + raw).href;
  } catch {
    showError("Please enter a valid URL.");
    return;
  }

  const type    = detectType(href);

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
    lucide.createIcons({ nodes: [saveBtn] });
  }

  const ytThumb = getThumbnail(href, type);
  const meta    = await fetchMetadata(href, type);

  const thumbnail = ytThumb || meta.thumbnail || null;
  const title     = meta.title || getTitle(href, type);
  const desc      = meta.description || '';
  const publisher = meta.publisher || getDomain(href);

  const item = {
    id:          uid(),
    url:         href,
    title:       title || 'Untitled',
    description: desc,
    publisher,
    type,
    thumbnail,
    isNote:      false,
    savedAt:     new Date().toISOString(),
  };

  items.unshift(item);
  saveItems();
  input.value = '';
  render(item.id);
  updateCounts();
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="plus"></i>';
    lucide.createIcons({ nodes: [saveBtn] });
  }
  closeModal();
  showToast('Saved to shelf!');
}
function addNote() {
  const titleInput = document.getElementById('noteTitleInput');
  const bodyInput = document.getElementById('noteBodyInput');
  const body = bodyInput ? bodyInput.value.trim() : '';
  if (!body) { showError('Please enter some content before saving.'); return; }
  const title = titleInput && titleInput.value.trim() ? titleInput.value.trim() : 'Untitled Note';

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
  render(item.id); 
  updateCounts(); 
  closeModal();
  showToast('Note saved!');
}
function deleteItem(id) {
  if (id === 'all') {
    if (confirm('Are you sure you want to delete ALL your saved data? This action cannot be undone.')) {
      items = [];
      saveItems();
      render();
      updateCounts();
      closeModal();
      showToast('All data deleted!', 'info');
    }
    return;
  }
  const item = items.find(i => i.id === id);
  items = items.filter(i => i.id !== id);
  saveItems();
  render();
  updateCounts();
  closeModal();
  if (item) showToast(`"${item.title}" removed`, 'info');
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
    case 'az':     list.sort((a, b) => a.title.localeCompare(b.title));     break;
    case 'type':   list.sort((a, b) => a.type.localeCompare(b.type));       break;
    default:       list.sort((a, b) => b.savedAt.localeCompare(a.savedAt)); break;
  }

  return list;
}
function render(newItemId = null) {
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
    const card = buildCard(item, i, item.id === newItemId);
    grid.appendChild(card);
  });

  lucide.createIcons();
}
function buildCard(item, index, isNew = false) {
  const cfg    = TYPE_CONFIG[item.type] || TYPE_CONFIG.url;
  const domain = item.url ? getDomain(item.url) : null;

  const card = document.createElement('div');
  card.className = isNew ? 'card card-new' : 'card';
  card.style.animationDelay = `${Math.min(index, 10) * 38}ms`;
  card.dataset.id   = item.id;
  card.dataset.type = item.type;

  let mediaHTML = '';
  if (item.isNote) {
    mediaHTML = `<div class="card-thumb-placeholder card-note-bg"><i data-lucide="${cfg.icon}"></i></div>`;
  } else if (item.thumbnail) {
    mediaHTML = `<img class="card-thumb" src="${escHtml(item.thumbnail)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'card-thumb-placeholder\\'><i data-lucide=\\'${cfg.icon}\\'></i></div>'; lucide.createIcons();" />`;
  } else {
    mediaHTML = `<div class="card-thumb-placeholder"><i data-lucide="${cfg.icon}"></i></div>`;
  }

  const notePreview = item.isNote
    ? `<div class="card-note-preview">${escHtml(item.body)}</div>`
    : '';

  const subLine = item.publisher
    ? `<div class="card-sub">${escHtml(item.publisher)}</div>`
    : domain ? `<div class="card-sub">${escHtml(domain)}</div>` : '';

  card.innerHTML = `
    ${mediaHTML}
    <div class="card-top">
      <span class="badge badge-${item.type}">
        <i data-lucide="${cfg.icon}"></i> ${cfg.label}
      </span>
      <button class="card-del-btn" title="Remove">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
    ${notePreview}
    <div class="card-body">
      <div class="card-title">${escHtml(item.title)}</div>
      ${subLine}
      <div class="card-footer">
        <div class="card-domain">
          ${domain
            ? `<img class="card-favicon" src="https://${escHtml(getRootDomain(domain))}/favicon.ico"
                alt="" onerror="this.style.display='none'" />${escHtml(domain)}`
            : '<span>📝 Note</span>'}
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
    confirmCardDelete(item.title, () => deleteItem(item.id));
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

// audio
// function stopPreview() {
//   if (previewAudio) {
//     previewAudio.pause();
//     previewAudio.src = '';
//     previewAudio = null;
//   }
//   const wrap = document.getElementById('modalThumbWrap');
//   if (wrap) wrap.classList.remove('preview-playing');
// }

// async function getPreviewUrl(item) {
//   const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
//   const ITUNES_SEARCH = 'https://itunes.apple.com/search';
//
//   const clean = (s = '') =>
//     s
//       .replace(/\(.*?(official|lyric).*?\)|\[.*?(official|lyric).*?\]|remastered|full audio|video/gi, '')
//       .replace(/\s+/g, ' ')
//       .trim();
//
//   const lower = (s = '') => s.toLowerCase();
//
//   const rawTitle = item.title || '';
//   const rawPub = item.publisher || '';
//
//   const titlePart = clean(rawTitle);
//   const artistPart = (() => {
//     const ignored = ['spotify', 'soundcloud', 'youtube', 'apple music', 'itunes', 'tidal', 'deezer'];
//     const pub = clean(rawPub);
//     const pubLower = lower(pub);
//
//     if (!pub || pub.includes('.') || ignored.includes(pubLower)) return '';
//     return pub;
//   })();
//
//   const itemTitleLower = lower(rawTitle);
//   const itemPubLower = lower(rawPub);
//
//   // apple music direct lookup
//   if (item.url) {
//     try {
//       const u = new URL(item.url);
//       const host = lower(u.hostname.replace(/^www\./, ''));
//
//       if (host === 'music.apple.com' || host === 'itunes.apple.com') {
//         const match = u.pathname.match(/\/(\d{6,})(?:[/?]|$)/);
//
//         if (match) {
//           const res = await fetch(`${ITUNES_LOOKUP}?id=${match[1]}&limit=1`);
//           const data = await res.json();
//           return data.results?.[0]?.previewUrl || null;
//         }
//       }
//     } catch {}
//   }
//
//   // build search query
//   const query = [artistPart, titlePart].filter(Boolean).join(' ').trim();
//   if (query.length < 2) return null;
//
//   try {
//     const res = await fetch(
//       `${ITUNES_SEARCH}?term=${encodeURIComponent(query)}&media=music&entity=musicTrack&limit=5`
//     );
//     const data = await res.json();
//     if (!data.results?.length) return null;
//
//     const score = (r) => {
//       const resTrack = lower(r.trackName);
//       const resArtist = lower(r.artistName);
//
//       let s = 0;
//
//       // artist match
//       if (itemPubLower.includes(resArtist) || resArtist.includes(itemPubLower)) s += 30;
//       else if (itemTitleLower.includes(resArtist)) s += 20;
//       else s -= 50;
//
//       // title match
//       if (itemTitleLower.includes(resTrack) || resTrack.includes(itemTitleLower)) s += 20;
//
//       // exact matches
//       if (resTrack === lower(titlePart)) s += 15;
//       if (artistPart && resArtist === lower(artistPart)) s += 15;
//
//       // partial match
//       const titleTokens = lower(titlePart).split(' ');
//       const matchCount = titleTokens.filter(t => resTrack.includes(t)).length;
//       s += matchCount * 2;
//
//       // artist heuristic
//       if (artistPart && lower(artistPart).split(' ')[0] === resArtist.split(' ')[0]) {
//         s += 8;
//       }
//
//       return s;
//     };
//
//     const best = data.results.reduce((a, b) => (score(b) > score(a) ? b : a));
//
//     return best.previewUrl || null;
//   } catch {
//     return null;
//   }
// }

// async function startPreview(item) {
//   stopPreview();
//   const url = await getPreviewUrl(item);
//   if (!url) return;
//   const wrap = document.getElementById('modalThumbWrap');
//   if (wrap) wrap.classList.add('preview-playing');
//   previewAudio = new Audio(url);
//   previewAudio.volume = 0.55;
//   previewAudio.play().catch(() => {});
//   previewAudio.addEventListener('ended', () => {
//     if (wrap) wrap.classList.remove('preview-playing');
//   });
// }

// modals
function openModal(id) {
  if (addBtn) addBtn.classList.add('hidden');
  modalDeleteBtn.classList.remove('hidden');
  if (id === 'settings') return openSettings();
  const item = items.find(i => i.id === id);
  if (!item) return;
  openItemId = id;

  if (!modalContentBar) {
    console.error("Error: modalContentBar element not found in the DOM.");
    return;
  }
  document.querySelectorAll('.modal-note-body, .modal-add-container, .modal-sub, .modal-footer').forEach(el => el.remove());
  modalDesc.style.display = 'none';

  const domain = item.url ? getDomain(item.url) : null;
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.url;

  modalBadge.innerHTML = `<span class="badge badge-${item.type}"><i data-lucide="${cfg.icon}"></i> ${cfg.label}</span>`;
  modalTitle.textContent = item.title;

  const subline = document.createElement('div');
  subline.className = 'modal-sub';
  subline.textContent = item.publisher || domain || (item.isNote ? 'Private Note' : '');
  modalTitle.insertAdjacentElement('afterend', subline);

  if (item.isNote) {
    modalThumbWrap.innerHTML = `<div class="modal-note-bg modal-placeholder"><i data-lucide="${cfg.icon}"></i><span class="modal-note-bg-label">Note</span></div>`;
    const noteBody = document.createElement('div');
    noteBody.className = 'modal-note-body';
    noteBody.textContent = item.body;
    const modalActionsElement = modalOpenBtn.closest('.modal-actions');
    if (modalActionsElement) {
      modalContentBar.insertBefore(noteBody, modalActionsElement);
    } else {
      modalContentBar.appendChild(noteBody);
    }
    modalOpenBtn.classList.add('note-only');
  } else {
    if (item.thumbnail) {
      modalThumbWrap.innerHTML = `<img src="${escHtml(item.thumbnail)}" alt=""
        onerror="this.outerHTML='<div class=\\'modal-placeholder\\'><i data-lucide=\\'${cfg.icon}\\'></i></div>'; lucide.createIcons();" />`;
    } else {
      modalThumbWrap.innerHTML = `<div class="modal-placeholder"><i data-lucide="${cfg.icon}"></i></div>`;
    }
    modalOpenBtn.classList.remove('note-only');
    modalOpenBtn.href = item.url;

    if (item.description) {
      modalDesc.textContent = item.description;
      modalDesc.style.display = 'block';
    }
  }
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.innerHTML = `
    <div class="modal-domain">
      ${domain 
        ? `<img class="card-favicon" src="https://${escHtml(getRootDomain(domain))}/favicon.ico" onerror="this.style.display='none'" /> ${escHtml(domain)}`
        : '<span><i data-lucide="file-text" style="width:12px;height:12px"></i> Shelf Note</span>'}
    </div>
    <div class="modal-date">${fmtDate(item.savedAt)}</div>
  `;
  const modalActionsElement = modalOpenBtn.closest('.modal-actions');
  if (modalActionsElement) {
    modalContentBar.insertBefore(footer, modalActionsElement);
  } else {
    modalContentBar.appendChild(footer);
  }

  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  lucide.createIcons();
  // if (item.type === 'music') startPreview(item); 
}


function openAddModal() {
  openItemId = 'add';
  if (modal) modal.classList.add('modal-add-mode');
  if (addBtn) addBtn.classList.add('hidden');
  modalDeleteBtn.classList.add('hidden');
  modalThumbWrap.innerHTML = '';
  modalBadge.innerHTML = '';
  modalTitle.textContent = '';
  if (modalDesc) modalDesc.style.display = 'none';
  modalOpenBtn.classList.add('note-only');

  if (!modalContentBar) return;
  document.querySelectorAll('#modalContentBar .modal-note-body, .modal-add-container, .modal-sub, .modal-footer').forEach(el => el.remove());

  const container = document.createElement('div');
  container.className = 'modal-add-container';
  container.innerHTML = `
    <div class="modal-tabs">
      <button type="button" class="modal-tab active" data-tab="url">
        <i data-lucide="link-2"></i><span>URL</span>
      </button>
      <button type="button" class="modal-tab" data-tab="note">
        <i data-lucide="file-text"></i><span>Note</span>
      </button>
    </div>
    <div id="modalUrlSection" class="modal-section">
      <div class="input-group">
        <label>Paste Link</label>
        <div style="display:flex; gap:8px; width:100%">
          <input type="url" id="urlInput" class="search-input" placeholder="https://..." style="flex:1; background:var(--bg2)">
          <button class="modal-open-btn" id="saveUrlBtn" style="flex:0; padding:0 15px; background:var(--accent); border:none; color:white;"><i data-lucide="plus"></i></button>
        </div>
      </div>
    </div>
    <div id="modalNoteSection" class="modal-section hidden">
      <div class="input-group">
        <label>Note Title</label>
        <input type="text" id="noteTitleInput" class="search-input" placeholder="Title (optional)" style="width:100%; background:var(--bg2)">
      </div>
      <div class="input-group" style="margin-top:12px">
        <label>Content</label>
        <textarea id="noteBodyInput" class="note-body-input" placeholder="Write something..." style="width:100%; min-height:100px; background:var(--bg2); border:1px solid var(--glass-border); border-radius:10px; color:var(--text); padding:12px; font-family:var(--font-body); outline:none; resize:none;"></textarea>
      </div>
      <button class="modal-open-btn" id="saveNoteBtn" style="width:100%; background:var(--accent); border:none; color:white; margin-top:16px;"><i data-lucide="plus"></i> Save Note</button>
    </div>
  `;
  modalContentBar.insertBefore(container, modalOpenBtn.closest('.modal-actions'));
  modalBackdrop.hidden = false;
  lucide.createIcons();

  const tabs = container.querySelectorAll('.modal-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isUrl = tab.dataset.tab === 'url';
      const urlSec = container.querySelector('#modalUrlSection');
      const noteSec = container.querySelector('#modalNoteSection');
      urlSec.classList.toggle('hidden', !isUrl);
      noteSec.classList.toggle('hidden', isUrl);
      if(isUrl) container.querySelector('#urlInput')?.focus(); 
      else container.querySelector('#noteBodyInput')?.focus();
    };
  });

  const saveUrlBtn = document.getElementById('saveUrlBtn');
  const urlInput = document.getElementById('urlInput');
  const saveNoteBtn = document.getElementById('saveNoteBtn');

  if (saveUrlBtn) saveUrlBtn.onclick = () => addUrl(urlInput);
  if (urlInput) urlInput.onkeydown = e => { if (e.key === 'Enter') addUrl(e.target); };
  if (saveNoteBtn) saveNoteBtn.onclick = () => addNote();
  
  setTimeout(() => { urlInput?.focus(); }, 100);
}

function closeModal() { 
  // stopPreview();
  if (modal) modal.classList.remove('modal-add-mode');
  if (addBtn) addBtn.classList.remove('hidden');
  modalBackdrop.hidden = true; 
  document.body.style.overflow = '';
  modalThumbWrap.innerHTML = '';
}

// settings
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

function handleExport() {
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
  showToast('Exported successfully!');
}

function openSettings() {
  if (addBtn) addBtn.classList.add('hidden');
  openItemId = 'settings';
  modalDeleteBtn.classList.add('hidden');
  modalThumbWrap.innerHTML = '';
  modalBadge.innerHTML = '';
  modalTitle.textContent = 'Settings';
  modalDesc.style.display = 'none';
  modalDesc.textContent = '';
  modalOpenBtn.classList.add('note-only');

  if (!modalContentBar) {
    console.error("Error: modalContentBar element not found in the DOM for settings.");
    return;
  }
  document.querySelectorAll('#modalContentBar .modal-note-body, .modal-add-container, .modal-sub, .modal-footer').forEach(el => el.remove());

  const container = document.createElement('div');
  container.className = 'modal-note-body settings-group';
  container.style.cssText = 'background:transparent; border:none; font-style:normal; margin-top:12px; display:flex; flex-direction:column; gap:8px;';

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  container.innerHTML = `
    <div class="settings-row">
      <span>Dark Appearance</span>
      <input type="checkbox" class="toggle-switch" id="themeToggle" ${isDark ? 'checked' : ''}>
    </div>
    <div class="settings-row">
      <span>Export Library</span>
      <button class="action-btn" id="modalExport" style="width:auto; background:var(--bg3); color:var(--text1); border:1px solid var(--glass-border); padding: 7px 14px; border-radius: 9px; font-size: 12px;">
        <i data-lucide="download"></i> <span>Export</span>
      </button>
    </div>
    <div class="settings-row">
      <span>Import Library</span>
      <button class="action-btn" id="modalImport" style="width:auto; background:var(--bg3); color:var(--text1); border:1px solid var(--glass-border); padding: 7px 14px; border-radius: 9px; font-size: 12px;">
        <i data-lucide="upload"></i> <span>Import</span>
      </button>
    </div>
    <div class="settings-row" style="border-color: rgba(239, 68, 68, 0.2); margin-top: 4px;">
      <span style="color: #f87171;">Danger Zone</span>
      <button class="action-btn" id="deleteAllDataBtn" style="width:auto; background:rgba(239, 68, 68, 0.1); color:#f87171; border:1px solid rgba(239, 68, 68, 0.2); padding: 7px 14px; border-radius: 9px; font-size: 12px;">
        <i data-lucide="trash-2"></i> <span>Clear All</span>
      </button>
    </div>
  `;

  const modalActionsElement = modalOpenBtn.closest('.modal-actions');
  if (modalActionsElement) {
    modalContentBar.insertBefore(container, modalActionsElement);
  } else {
    modalContentBar.appendChild(container);
  }
  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  lucide.createIcons();

  $('themeToggle').addEventListener('change', toggleTheme);
  $('modalExport').addEventListener('click', handleExport);
  $('modalImport').addEventListener('click', () => importFile.click());
  $('deleteAllDataBtn').addEventListener('click', () => deleteItem('all'));
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.paste-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  urlModeEl.classList.toggle('hidden', mode !== 'url');
  noteModeEl.classList.toggle('hidden', mode !== 'note');
  errorMsg.hidden = true;
}

// mobile nav
function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('visible'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); }

// utils
function escHtml(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function getDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
 
// events
addBtn.addEventListener('click', openAddModal);

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => { setFilter(btn.dataset.filter); closeSidebar(); });
});

searchInput.addEventListener('input', () => { currentSearch = searchInput.value; render(); });
sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; render(); });

menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

settingsBtn.addEventListener('click', () => { closeSidebar(); openSettings(); });

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

modalDeleteBtn.addEventListener('click', (e) => {
  if (openItemId === 'settings') { closeModal(); return; }
  const item = items.find(i => i.id === openItemId);
  if (!item) return;
  confirmCardDelete(item.title, () => deleteItem(openItemId));
});

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
      showToast(`Imported ${fresh.length} new item${fresh.length !== 1 ? 's' : ''}!`);
    } catch {
      showToast('Could not read file — make sure it is a valid OneShelf export.', 'error');
    }
    importFile.value = '';
  };
  reader.readAsText(file);
});

// keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!modalBackdrop.hidden) { closeModal(); return; }
    if (sidebar.classList.contains('open')) { closeSidebar(); return; }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// start
(function init() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  loadItems();
  render();
  updateCounts();
  lucide.createIcons();
})();