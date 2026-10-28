const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let siteData = { settings: {}, shows: [], news: [] };
let showFilter = 'all';
let toastTimer;
let activePlayerItem = null;
let activeHls = null;
const DEFAULT_IDN_SESSION_API = 'https://ap.harukaze48.my.id/session';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function dateObj(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function formatDate(value, opts = {}) {
  const d = dateObj(value);
  if (!d) return 'Tanggal belum ditentukan';
  return new Intl.DateTimeFormat('id-ID', { day:'numeric', month:'short', year:'numeric', ...opts, timeZone: 'Asia/Jakarta' }).format(d);
}
function formatDateLong(value) { return formatDate(value, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); }
function formatTime(value) {
  const d = dateObj(value); if (!d) return 'Jam menyusul';
  return new Intl.DateTimeFormat('id-ID', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Jakarta' }).format(d) + ' WIB';
}
function relativeType(type) { return type === 'live' ? 'LIVE NOW' : type === 'replay' ? 'REPLAY ARCHIVE' : 'UPCOMING SHOW'; }
function thumbInside(url) { return url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : ''; }
function showCard(item, compact = false) {
  const typeLabel = item.type === 'live' ? 'LIVE' : item.type === 'replay' ? 'REPLAY' : 'UPCOMING';
  const statusLabel = item.type === 'live' ? '<span class="cover-status"><span class="live-dot"></span> ON AIR</span>' : item.type === 'replay' ? '<span class="cover-status">REPLAY</span>' : `<span class="cover-status" style="background:#9364bf">SOON</span>`;
  const timeLabel = item.type === 'live' ? 'Sedang berlangsung' : item.type === 'replay' ? formatDate(item.dateTime || item.createdAt) : formatDate(item.dateTime);
  const coverClass = compact ? 'replay-cover' : 'show-cover';
  const playLabel = item.stageAvailable ? 'Buka Live Stage' : 'Detail show';
  return `<article class="${compact ? 'replay-card' : 'show-card'}">
    <div class="${coverClass}">${thumbInside(item.thumbnail)}<span class="cover-type">${esc(typeLabel)}</span>${statusLabel}<div class="cover-wordmark">JKT<span>48</span></div>${!compact && item.type !== 'live' ? `<span class="cover-date">${esc(timeLabel)}</span>` : ''}</div>
    <div class="${compact ? 'replay-card-body' : 'show-card-body'}"><div class="card-meta"><span>${esc(item.category || 'Theater')}</span><span class="meta-dot"></span><span>${esc(timeLabel)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.summary || 'Temukan detail show dan informasi selengkapnya di sini.')}</p><div class="card-footer"><span class="member-short">${esc(item.members || 'JKT48')}</span><button class="round-play" data-open-show="${esc(item.id)}" aria-label="${esc(playLabel)}">▷</button></div></div>
  </article>`;
}
function renderShows() {
  const liveAll = siteData.shows.filter(x => x.type === 'live').sort((a,b)=>Number(b.featured)-Number(a.featured));
  const upcomingAll = siteData.shows.filter(x => x.type === 'upcoming').sort((a,b)=>Number(b.featured)-Number(a.featured) || (Date.parse(a.dateTime)||Infinity)-(Date.parse(b.dateTime)||Infinity));
  const replays = siteData.shows.filter(x => x.type === 'replay').sort((a,b)=>(Date.parse(b.dateTime || b.createdAt)||0)-(Date.parse(a.dateTime || a.createdAt)||0));
  $('#liveCount').textContent = String(liveAll.length).padStart(2,'0');
  $('#upcomingCount').textContent = String(upcomingAll.length).padStart(2,'0');
  $('#replayCount').textContent = String(replays.length).padStart(2,'0');
  const filtered = showFilter === 'all' ? [...liveAll, ...upcomingAll] : showFilter === 'live' ? liveAll : upcomingAll;
  $('#liveGrid').innerHTML = filtered.map(x => showCard(x)).join('');
  $('#liveGrid').classList.toggle('hidden', filtered.length === 0);
  $('#liveEmpty').classList.toggle('hidden', filtered.length > 0);
  const query = ($('#replaySearch').value || '').toLocaleLowerCase('id-ID').trim();
  const searched = replays.filter(x => [x.title,x.summary,x.members,x.category].join(' ').toLocaleLowerCase('id-ID').includes(query));
  $('#replayGrid').innerHTML = searched.map(x => showCard(x, true)).join('');
  $('#replayGrid').classList.toggle('hidden', searched.length === 0);
  $('#replayEmpty').classList.toggle('hidden', searched.length > 0);
  renderSchedule(upcomingAll);
}
function renderSchedule(items) {
  const upcoming = items.filter(x => !x.dateTime || Date.parse(x.dateTime) >= Date.now()).sort((a,b)=>(Date.parse(a.dateTime)||Infinity)-(Date.parse(b.dateTime)||Infinity)).slice(0,8);
  $('#scheduleList').innerHTML = upcoming.map(item => {
    const d = dateObj(item.dateTime);
    return `<div class="schedule-row"><div class="date-block"><strong>${d ? new Intl.DateTimeFormat('id-ID',{day:'2-digit',timeZone:'Asia/Jakarta'}).format(d) : '—'}</strong><span>${d ? new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'Asia/Jakarta'}).format(d).toUpperCase() : 'SOON'}</span></div><div class="schedule-info"><small>${esc(item.category || 'THEATER')}</small><h4>${esc(item.title)}</h4><p>${esc(item.members || item.summary || 'JKT48')}</p></div><div class="schedule-time">${d ? esc(formatTime(item.dateTime)) : 'Jadwal menyusul'}<span>${d ? esc(formatDate(item.dateTime,{day:'numeric',month:'short',year:'numeric'})) : 'Info segera diperbarui'}</span></div></div>`;
  }).join('');
  $('#scheduleEmpty').classList.toggle('hidden', upcoming.length > 0);
}
function renderNews() {
  const news = siteData.news.slice(0,6);
  $('#newsGrid').innerHTML = news.map(item => `<article class="news-card"><div class="news-cover">${thumbInside(item.thumbnail)}<span class="news-category">${esc(item.category || 'UPDATE')}</span></div><div class="news-card-body"><span class="news-date">${esc(formatDateLong(item.date))}</span><h3>${esc(item.title)}</h3><p>${esc(item.summary || 'Baca informasi lengkap mengenai update ini.')}</p>${item.link ? `<a class="text-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Baca selengkapnya <span>↗</span></a>` : ''}</div></article>`).join('');
  $('#newsGrid').classList.toggle('hidden', news.length === 0);
  $('#newsEmpty').classList.toggle('hidden', news.length > 0);
}
function applySettings(settings) {
  const s = settings || {};
  document.title = `${s.siteName || 'JKT48HUB'} | Live & Replay`;
  $('#brandName').textContent = s.siteName || 'JKT48HUB';
  $('#footerBrandName').textContent = s.siteName || 'JKT48HUB';
  $('#brandTagline').textContent = s.tagline || 'YOUR IDOL. YOUR MOMENTS.';
  $('#footerTagline').textContent = s.tagline || 'YOUR IDOL. YOUR MOMENTS.';
  $('#heroTitle').textContent = s.heroTitle || 'Semua momen JKT48, dalam satu hub.';
  $('#heroText').textContent = s.heroText || 'Temukan update live, jadwal theater, replay, dan kabar terbaru seputar JKT48 di satu tempat.';
  $('#footerText').textContent = s.footerText || 'Dibuat oleh fans, untuk fans. Tidak berafiliasi dengan JKT48 atau pihak manajemen resmi.';
  const bar = $('#announcementBar');
  if (s.announcementEnabled && s.announcement) { $('#announcementText').textContent = s.announcement; bar.classList.remove('hidden'); }
  else bar.classList.add('hidden');
  const footerLinks = $('.footer-links');
  if (s.contactUrl) footerLinks.insertAdjacentHTML('afterbegin', `<a href="${esc(s.contactUrl)}" target="_blank" rel="noopener noreferrer">Kontak ↗</a>`);
  if (s.instagramUrl) footerLinks.insertAdjacentHTML('afterbegin', `<a href="${esc(s.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram ↗</a>`);
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function youtubeEmbed(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname)) {
      const id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|live|shorts)\/([^/?]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
  } catch {}
  return null;
}
function closePlayer() {
  if (activeHls) { activeHls.destroy(); activeHls = null; }
  const stage = $('#playerStage'); stage.innerHTML = '<div class="player-placeholder">Pilih show untuk mulai menonton.</div>';
  $('#playerModal').classList.add('hidden'); document.body.style.overflow = '';
}
function setupStreamLayout() {
  const dialog = $('.modal-dialog');
  dialog.className = 'modal-dialog stream-dialog';
  dialog.innerHTML = `<button class="stream-close icon-button" data-close-modal aria-label="Tutup">&times;</button><div class="stream-layout"><div class="stream-main"><div id="playerStage" class="player-stage"><div class="player-placeholder">Pilih show untuk mulai menonton.</div></div><div class="stream-servers" role="group" aria-label="Pilih server streaming"><button class="server-button active" data-server="primary"><span>▣</span> Server 1 <small>(Utama)</small></button><button class="server-button" data-server="backup"><span>▣</span> Server 2 <small>(Cadangan)</small></button></div><article class="stream-details"><div id="streamPoster" class="stream-poster"><span>48</span></div><div class="stream-copy"><span class="panel-kicker" id="playerType">NOW PLAYING</span><h3 id="playerTitle">Show title</h3><p id="streamSummary">Nikmati siaran langsung bersama JKT48HUB.</p><div class="stream-meta"><span id="playerMembers"></span><span id="playerDate"></span></div></div><div class="live-badge"><span class="live-dot"></span> LIVE</div></article></div><aside class="stream-side"><div class="stream-tabs" role="tablist"><button class="stream-tab active" data-stream-tab="chat" role="tab" aria-selected="true">Live Chat</button><button class="stream-tab" data-stream-tab="lineup" role="tab" aria-selected="false">Lineup</button></div><div class="stream-tab-content" data-stream-panel="chat"><div class="chat-placeholder"><span class="chat-icon">●</span><strong>Live chat belum tersedia.</strong><p>Ikuti percakapan dan dukung oshimu di sini.</p></div></div><div class="stream-tab-content hidden" data-stream-panel="lineup"><div class="chat-placeholder"><span class="chat-icon">♟</span><strong id="lineupStatus">Lineup belum tersedia.</strong><p>Informasi member akan diperbarui oleh admin.</p></div></div></aside></div><p class="player-disclaimer">Pastikan kamu hanya menggunakan stream yang kamu miliki atau memiliki izin untuk ditayangkan.</p>`;
  const idnButton = $('[data-server="backup"]');
  idnButton.dataset.server = 'idn'; idnButton.innerHTML = '<span>▣</span> Server IDN <small>(IDN Live)</small>';
  $('.stream-servers').insertAdjacentHTML('afterend', '<div id="streamQuality" class="stream-quality hidden" aria-label="Pilih kualitas"></div>');
  $$('[data-stream-tab]').forEach(tab => tab.addEventListener('click', () => {
    $$('[data-stream-tab]').forEach(x => { x.classList.toggle('active', x === tab); x.setAttribute('aria-selected', x === tab ? 'true' : 'false'); });
    $$('[data-stream-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.streamPanel !== tab.dataset.streamTab));
  }));
  $$('[data-server]').forEach(button => button.addEventListener('click', () => {
    $$('[data-server]').forEach(x => x.classList.toggle('active', x === button));
    if (!activePlayerItem) return;
    if (button.dataset.server === 'idn') startIdnStream(activePlayerItem);
    else openPlayer(activePlayerItem, false);
  }));
}
function mountProtectedHls(source, headerName, headerValue, title) {
  const stage = $('#playerStage');
  if (activeHls) { activeHls.destroy(); activeHls = null; }
  stage.innerHTML = '';
  if (!window.Hls || !window.Hls.isSupported()) {
    stage.innerHTML = '<div class="player-placeholder">Server IDN memerlukan browser yang mendukung hls.js untuk mengirim header sesi.</div>';
    return;
  }
  const video = document.createElement('video');
  video.controls = true; video.playsInline = true; video.autoplay = true; video.preload = 'metadata'; video.title = title;
  stage.appendChild(video);
  const hls = new window.Hls({
    xhrSetup: xhr => { xhr.withCredentials = true; xhr.setRequestHeader(headerName, headerValue); },
    fetchSetup: (context, initParams) => new Request(context.url, { ...initParams, credentials: 'include', headers: { ...(initParams.headers || {}), [headerName]: headerValue } })
  });
  activeHls = hls;
  hls.loadSource(source); hls.attachMedia(video);
  hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
  hls.on(window.Hls.Events.ERROR, (_, data) => {
    if (!data.fatal) return;
    if ((data.response?.code === 401 || data.response?.code === 403) && activePlayerItem?.idnShowSlug) { startIdnStream(activePlayerItem); return; }
    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else toast('Sesi Server IDN berakhir. Pilih Server IDN lagi untuk menyegarkan.');
  });
}
async function startIdnStream(item) {
  const stage = $('#playerStage');
  const quality = $('#streamQuality');
  if (!item.idnShowSlug) {
    stage.innerHTML = '<div class="player-placeholder">Slug show IDN belum dikonfigurasi admin untuk show ini.</div>';
    quality.classList.add('hidden'); return;
  }
  stage.innerHTML = '<div class="player-placeholder">Menghubungkan ke Server IDN...</div>';
  quality.classList.add('hidden');
  try {
    const sessionApi = item.idnSessionUrl || DEFAULT_IDN_SESSION_API;
    const sessionRes = await fetch(sessionApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_slug: item.idnShowSlug, viewer_id: null, ttl: 120 }) });
    const session = await sessionRes.json();
    if (!sessionRes.ok || !session.ok || !session.playback_url) throw new Error(session.message || 'Gagal membuat sesi IDN.');
    const playbackRes = await fetch(session.playback_url, { credentials: 'include' });
    const playback = await playbackRes.json();
    if (!playbackRes.ok || !playback.ok || !playback.playlist_url || !playback.play_header_value) throw new Error(playback.message || 'Data playback IDN tidak valid.');
    const headerName = playback.play_header_name || 'X-Play-Key';
    const start = source => mountProtectedHls(source, headerName, playback.play_header_value, item.title);
    start(playback.auto_playlist_url || playback.playlist_url);
    const choices = [{ label: 'Auto', url: playback.auto_playlist_url || playback.playlist_url }, ...(Array.isArray(playback.qualities) ? playback.qualities.map(q => ({ label: q.label, url: q.playlist_url })) : [])].filter(q => q.url);
    quality.innerHTML = choices.map((q, index) => `<button class="quality-button${index === 0 ? ' active' : ''}" data-quality="${index}">${esc(q.label)}</button>`).join('');
    quality.classList.toggle('hidden', choices.length < 2);
    $$('.quality-button', quality).forEach(button => button.addEventListener('click', () => { const selected = choices[Number(button.dataset.quality)]; $$('.quality-button', quality).forEach(x => x.classList.toggle('active', x === button)); start(selected.url); }));
  } catch (error) {
    stage.innerHTML = `<div class="player-placeholder"><strong>Server IDN belum dapat dimuat.</strong><br><br>${esc(error.message || 'Coba lagi beberapa saat lagi.')}</div>`;
    toast(error.message || 'Gagal memuat Server IDN.');
  }
}
function openPlayer(item, showModal = true) {
  activePlayerItem = item;
  if (activeHls) { activeHls.destroy(); activeHls = null; }
  $('#playerTitle').textContent = item.title;
  $('#playerType').textContent = relativeType(item.type);
  $('#playerMembers').textContent = item.members || item.category || 'JKT48';
  $('#playerDate').textContent = item.dateTime ? `${formatDateLong(item.dateTime)} · ${formatTime(item.dateTime)}` : (item.type === 'live' ? 'Sedang berlangsung' : 'Tanggal belum ditentukan');
  $('#streamSummary').textContent = item.summary || 'Saksikan momen spesial ini bersama JKT48HUB.';
  const poster = $('#streamPoster');
  poster.style.backgroundImage = item.thumbnail ? `linear-gradient(90deg, rgba(14,10,13,.2), rgba(14,10,13,.65)), url("${String(item.thumbnail).replace(/["\\]/g, '\\$&')}")` : '';
  poster.classList.toggle('has-image', Boolean(item.thumbnail));
  $('#lineupStatus').textContent = item.members || 'Lineup belum tersedia.';
  $('.live-badge').classList.toggle('hidden', item.type !== 'live');
  $('[data-server="idn"]').disabled = !item.idnShowSlug;
  $('[data-server="idn"]').title = $('[data-server="idn"]').disabled ? 'Masukkan slug show IDN terlebih dahulu.' : 'Putar lewat Server IDN';
  $('#streamQuality').classList.add('hidden'); $('#streamQuality').innerHTML = '';
  const stage = $('#playerStage');
  stage.innerHTML = '';
  if (item.streamUrl) {
    const yt = youtubeEmbed(item.streamUrl);
    if (yt) {
      const iframe = document.createElement('iframe'); iframe.src = yt; iframe.title = item.title; iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; iframe.allowFullscreen = true; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; stage.appendChild(iframe);
    } else if (/\.(m3u8|mp4|webm|ogg)(\?|#|$)/i.test(item.streamUrl)) {
      const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.autoplay = true; video.preload = 'metadata'; stage.appendChild(video);
      if (/\.m3u8(\?|#|$)/i.test(item.streamUrl) && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls(); activeHls = hls; hls.loadSource(item.streamUrl); hls.attachMedia(video); video.addEventListener('emptied', () => { hls.destroy(); if (activeHls === hls) activeHls = null; }, { once: true });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || !/\.m3u8(\?|#|$)/i.test(item.streamUrl)) video.src = item.streamUrl;
      else { stage.innerHTML = `<div class="player-placeholder">Browser ini tidak mendukung pemutaran HLS. <a class="text-link" href="${esc(item.streamUrl)}" target="_blank" rel="noopener noreferrer">Buka stream di tab baru ↗</a></div>`; }
    } else {
      stage.innerHTML = `<div class="player-placeholder">Tautan ini bukan format embed yang didukung.<br><br><a class="button button-primary" href="${esc(item.streamUrl)}" target="_blank" rel="noopener noreferrer">Buka tautan stream ↗</a><br><br><small>Gunakan tautan YouTube, HLS (.m3u8), MP4, atau WebM agar dapat diputar di halaman ini.</small></div>`;
    }
  } else {
    stage.innerHTML = `<div class="player-placeholder"><div class="empty-symbol">▷</div><strong>Player belum tersedia</strong><br><br>Admin belum menambahkan tautan stream untuk show ini.</div>`;
  }
  if (showModal) { $('#playerModal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}
async function init() {
  setupStreamLayout();
  $('#yearNow').textContent = new Date().getFullYear();
  try {
    const response = await fetch('/api/content', { cache: 'no-store' });
    if (!response.ok) throw new Error('Gagal memuat konten.');
    siteData = await response.json();
    applySettings(siteData.settings); renderShows(); renderNews();
  } catch (error) {
    toast('Konten belum bisa dimuat. Periksa koneksi server.');
    $('#liveEmpty').classList.remove('hidden'); $('#liveGrid').classList.add('hidden');
    $('#liveEmpty h3').textContent = 'Konten belum bisa dimuat';
    $('#liveEmpty p').textContent = 'Pastikan server website sedang berjalan, lalu muat ulang halaman.';
  }
}

$$('[data-show-filter]').forEach(button => button.addEventListener('click', () => {
  showFilter = button.dataset.showFilter;
  $$('[data-show-filter]').forEach(b => b.classList.toggle('active', b === button));
  renderShows();
}));
$('#replaySearch').addEventListener('input', () => renderShows());
document.addEventListener('click', event => {
  const target = event.target.closest('[data-open-show]');
  if (target) { const item = siteData.shows.find(x => x.id === target.dataset.openShow); if (item) window.location.href = `/live-stage?show=${encodeURIComponent(item.id)}`; }
  if (event.target.closest('[data-close-modal]')) closePlayer();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#playerModal').classList.contains('hidden')) closePlayer(); });
$('#menuToggle').addEventListener('click', () => $('#mainNav').classList.toggle('open'));
$$('#mainNav a').forEach(link => link.addEventListener('click', () => $('#mainNav').classList.remove('open')));
init();
