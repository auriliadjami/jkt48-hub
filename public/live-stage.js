const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DEFAULT_IDN_SESSION_API = 'https://ap.harukaze48.my.id/session';
const showId = new URLSearchParams(location.search).get('show') || '';
let currentShow = null;
let activeHls = null;
let idnAuthRetryUsed = false;

function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function dateLabel(value) { if (!value) return 'Tanggal belum ditentukan'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Tanggal belum ditentukan' : new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(date); }
function youtubeEmbed(raw) { try { const u = new URL(raw); if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`; if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname)) { const id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|live|shorts)\/([^/?]+)/)?.[1]; return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null; } } catch {} return null; }
function destroyHls() { if (activeHls) { activeHls.destroy(); activeHls = null; } }
function setHostLoading(message) { destroyHls(); $('#videoHost').innerHTML = `<div class="stage-loading">${esc(message)}</div>`; }
function activateServer(name) { $$('[data-server]').forEach(button => button.classList.toggle('active', button.dataset.server === name)); }
function mountHls(url, auth = null, onAuthError = null) {
  destroyHls(); const host = $('#videoHost'); host.innerHTML = '';
  const video = document.createElement('video'); video.controls = true; video.autoplay = true; video.playsInline = true; video.preload = 'metadata'; host.appendChild(video);
  if (window.Hls && window.Hls.isSupported()) {
    const config = auth ? { xhrSetup: xhr => { xhr.withCredentials = true; xhr.setRequestHeader(auth.name, auth.value); }, fetchSetup: (context, initParams) => new Request(context.url, { ...initParams, credentials:'include', headers:{ ...(initParams.headers || {}), [auth.name]:auth.value } }) } : {};
    const hls = new window.Hls(config); activeHls = hls; hls.loadSource(url); hls.attachMedia(video); hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(window.Hls.Events.ERROR, (_, data) => { if (activeHls !== hls) return; if (auth && (data.response?.code === 401 || data.response?.code === 403)) onAuthError?.(); else if (data.fatal) setHostLoading('Stream sedang mengalami gangguan.'); });
  } else if (!auth && video.canPlayType('application/vnd.apple.mpegurl')) video.src = url;
  else setHostLoading(auth ? 'Server IDN memerlukan browser yang mendukung hls.js.' : 'Browser ini tidak mendukung stream HLS.');
}
function playMain() {
  activateServer('main'); $('#qualityMenu').classList.add('hidden');
  if (!currentShow?.streamUrl) return setHostLoading('Server utama belum tersedia.');
  const yt = youtubeEmbed(currentShow.streamUrl); if (yt) { destroyHls(); $('#videoHost').innerHTML = `<iframe src="${yt}" title="${esc(currentShow.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`; return; }
  if (/\.(m3u8|mp4|webm|ogg)(\?|#|$)/i.test(currentShow.streamUrl)) { if (/\.m3u8(\?|#|$)/i.test(currentShow.streamUrl)) mountHls(currentShow.streamUrl); else { destroyHls(); $('#videoHost').innerHTML = `<video controls autoplay playsinline src="${esc(currentShow.streamUrl)}"></video>`; } return; }
  setHostLoading('Format Server Utama belum didukung.');
}
async function playIdn(isAuthRetry = false) {
  if (!isAuthRetry) idnAuthRetryUsed = false;
  activateServer('idn'); const quality = $('#qualityMenu'); quality.classList.add('hidden');
  if (!currentShow?.idnShowSlug) { setHostLoading('Server IDN belum dikonfigurasi untuk show ini.'); return; }
  setHostLoading('Menghubungkan ke Server IDN...');
  try {
    const sessionRes = await fetch(currentShow.idnSessionUrl || DEFAULT_IDN_SESSION_API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ show_slug:currentShow.idnShowSlug, viewer_id:null, ttl:120 }) });
    const session = await sessionRes.json(); if (!sessionRes.ok || !session.ok || !session.playback_url) throw new Error(session.message || 'Gagal membuat sesi IDN.');
    const playbackRes = await fetch(session.playback_url, { credentials:'include' }); const playback = await playbackRes.json();
    if (!playbackRes.ok || !playback.ok || !playback.playlist_url || !playback.play_header_value) throw new Error(playback.message || 'Data playback IDN tidak valid.');
    const auth = { name: playback.play_header_name || 'X-Play-Key', value: playback.play_header_value }; const options = [{ label:'Auto', url:playback.auto_playlist_url || playback.playlist_url }, ...(Array.isArray(playback.qualities) ? playback.qualities.map(q => ({ label:q.label, url:q.playlist_url })) : [])].filter(x => x.url);
    const handleAuthError = () => {
      if (idnAuthRetryUsed) return setHostLoading('Sesi Server IDN ditolak. Silakan pilih server IDN untuk mencoba lagi.');
      idnAuthRetryUsed = true;
      playIdn(true);
    };
    const start = url => mountHls(url, auth, handleAuthError); start(options[0].url);
    quality.innerHTML = options.map((x,index) => `<button class="${index === 0 ? 'active' : ''}" data-quality="${index}">${esc(x.label)}</button>`).join(''); quality.classList.toggle('hidden', options.length < 2);
    $$('[data-quality]', quality).forEach(button => button.addEventListener('click', () => { $$('[data-quality]', quality).forEach(x => x.classList.toggle('active', x === button)); start(options[Number(button.dataset.quality)].url); }));
  } catch (error) { setHostLoading(error.message || 'Server IDN belum dapat dimuat.'); }
}
function renderShow(show) {
  currentShow = show; $('#showTitle').textContent = show.title; $('#showSummary').textContent = show.summary || 'Saksikan momen spesial ini bersama JKT48HUB.'; $('#showType').textContent = show.type === 'live' ? 'LIVE SHOW' : show.type === 'replay' ? 'REPLAY' : 'UPCOMING SHOW'; $('#showCategory').textContent = show.category || 'Theater'; $('#showDate').textContent = dateLabel(show.dateTime); $('#lineupText').textContent = show.members || 'Lineup belum tersedia.';
  const poster = $('#showPoster'); poster.style.backgroundImage = show.thumbnail ? `linear-gradient(rgba(8,12,11,.2),rgba(8,12,11,.5)),url("${String(show.thumbnail).replace(/["\\]/g, '\\$&')}")` : ''; poster.textContent = show.thumbnail ? '' : '48';
  $('[data-server="idn"]').disabled = !show.idnShowSlug; playMain();
}
async function loadStage() {
  const error = $('#accessError'); error.textContent = '';
  try {
    const response = await fetch(`/api/live-stage/show${showId ? `?show=${encodeURIComponent(showId)}` : ''}`, { credentials:'same-origin' });
    if (response.status === 401) { $('#accessGate').classList.remove('hidden'); return; }
    const data = await response.json(); if (!response.ok) { $('#accessGate').classList.remove('hidden'); error.textContent = data.error || 'Live Stage belum tersedia.'; return; }
    $('#accessGate').classList.add('hidden'); $('#stageApp').classList.remove('hidden'); renderShow(data.show);
  } catch {
    $('#accessGate').classList.remove('hidden');
    error.textContent = 'Live Stage tidak dapat dijangkau. Periksa koneksi lalu coba lagi.';
  }
}
$('#accessForm').addEventListener('submit', async event => { event.preventDefault(); const error = $('#accessError'); error.textContent = ''; const button = $('#accessForm button'); button.disabled = true; button.textContent = 'Memeriksa email...'; try { const response = await fetch('/api/live-stage/access', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({ email:$('#accessEmail').value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Akses ditolak.'); await loadStage(); } catch (err) { error.textContent = err.message; } finally { button.disabled = false; button.innerHTML = 'Lanjut ke Live Stage <span>→</span>'; } });
$$('[data-server]').forEach(button => button.addEventListener('click', () => button.dataset.server === 'idn' ? playIdn() : playMain()));
$$('[data-tab]').forEach(button => button.addEventListener('click', () => { $$('[data-tab]').forEach(x => x.classList.toggle('active', x === button)); $$('[data-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== button.dataset.tab)); }));
loadStage();
