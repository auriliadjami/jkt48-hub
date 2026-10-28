const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let adminData = { settings: {}, shows: [], news: [], accessEmails: [] };
let adminUsername = 'Admin';
let toastTimer;
let activeTab = 'dashboard';

function esc(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(value, options = {}) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Belum ditentukan';
  return new Intl.DateTimeFormat('id-ID', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Jakarta', ...options }).format(date);
}
function fmtDateTime(value) {
  const d = value ? new Date(value) : null; if (!d || Number.isNaN(d.getTime())) return 'Jadwal menyusul';
  return `${fmtDate(value,{day:'numeric',month:'short',year:'numeric'})} · ${new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).format(d)} WIB`;
}
function toDateInput(value) {
  const d = value ? new Date(value) : new Date(); if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDateInput(value) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); }
function toast(message) {
  const el = $('#adminToast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
async function api(url, options = {}) {
  const res = await fetch(url, { credentials:'same-origin', ...options, headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
  let body = {}; try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(body.error || `Request gagal (${res.status})`);
  return body;
}
function showAuth({ configured, login = false, error = '' }) {
  $('#authScreen').classList.remove('hidden'); $('#adminApp').classList.add('hidden'); $('#logoutBtn').classList.add('hidden');
  $('#loginForm').classList.toggle('hidden', !login); $('#setupForm').classList.toggle('hidden', configured || login);
  $('#authKicker').textContent = login ? 'ADMIN ACCESS' : 'FIRST-TIME SETUP';
  $('#authTitle').textContent = login ? 'Welcome back.' : 'Set up your hub.';
  $('#authDescription').textContent = login ? 'Masuk ke panel admin untuk mengelola konten JKT48HUB.' : 'Buat akun admin utama untuk mulai mengelola website. Setup ini hanya muncul sekali.';
  $('#loginError').textContent = login ? error : '';
  $('#setupError').textContent = !login ? error : '';
}
function showApp() {
  $('#authScreen').classList.add('hidden'); $('#adminApp').classList.remove('hidden'); $('#logoutBtn').classList.remove('hidden');
  $('#sidebarUsername').textContent = adminUsername; $('#welcomeUsername').textContent = adminUsername; $('#profileUsername').textContent = adminUsername;
}
async function checkSession() {
  try {
    const data = await api('/api/admin/session');
    if (data.authenticated) { adminUsername = data.username || 'Admin'; showApp(); await loadAdminData(); }
    else showAuth({ configured: data.adminConfigured, login: data.adminConfigured });
  } catch (e) { showAuth({ configured: true, login: true, error: 'Server tidak dapat dihubungi. Pastikan aplikasi berjalan.' }); }
}
async function loadAdminData() {
  const data = await api('/api/admin/data');
  adminData = { settings: data.settings || {}, shows: data.shows || [], news: data.news || [], accessEmails: data.accessEmails || [] };
  adminUsername = data.username || adminUsername;
  showApp(); renderDashboard(); renderShowTable(); renderNewsTable(); renderAccessEmails(); fillSettingsForm();
}
function setTab(tab) {
  activeTab = tab;
  $$('[data-admin-tab]').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));
  $$('[data-view]').forEach(v => v.classList.toggle('hidden', v.dataset.view !== tab));
  const info = {
    dashboard: ['Dashboard','Ringkasan dan kontrol konten JKT48HUB.'],
    shows: ['Live, jadwal & replay','Kelola konten siaran dan jadwal yang tampil di website.'],
    news: ['Berita & pengumuman','Tulis informasi, pengumuman, dan pembaruan untuk fans.'],
    access: ['Akses Live Stage','Kelola email yang diizinkan membuka halaman Live Stage.'],
    settings: ['Pengaturan website','Sesuaikan identitas, hero, banner pengumuman, dan tautan.'],
    account: ['Keamanan akun','Kelola password dan amankan akses admin.']
  }[tab];
  $('#pageTitle').textContent = info[0]; $('#pageSubtitle').textContent = info[1];
  $('#quickAddBtn').classList.toggle('hidden', !['dashboard','shows'].includes(tab));
  $('#quickAddBtn').textContent = tab === 'shows' ? '＋ Tambah show' : '＋ Tambah show';
}
function renderDashboard() {
  const shows = adminData.shows, news = adminData.news;
  $('#dashLive').textContent = shows.filter(x => x.type === 'live' && x.published).length;
  $('#dashUpcoming').textContent = shows.filter(x => x.type === 'upcoming' && x.published).length;
  $('#dashReplay').textContent = shows.filter(x => x.type === 'replay' && x.published).length;
  $('#dashNews').textContent = news.filter(x => x.published).length;
  $('#sideShowsCount').textContent = shows.length; $('#sideNewsCount').textContent = news.length;
  const recentShows = shows.map(x => ({...x, _kind:'show', _sort:x.updatedAt || x.createdAt}));
  const recentNews = news.map(x => ({...x, _kind:'news', _sort:x.updatedAt || x.createdAt || x.date}));
  const recent = [...recentShows, ...recentNews].sort((a,b)=>(Date.parse(b._sort)||0)-(Date.parse(a._sort)||0)).slice(0,6);
  $('#recentContent').innerHTML = recent.length ? recent.map(item => {
    const icon = item._kind === 'news' ? '✳' : item.type === 'live' ? '◉' : item.type === 'replay' ? '▷' : '▦';
    const kind = item._kind === 'news' ? `Berita · ${item.category || 'Update'}` : `${item.type === 'live' ? 'Live' : item.type === 'replay' ? 'Replay' : 'Jadwal'} · ${item.category || 'Theater'}`;
    const published = item.published ? '<span class="pill published">Published</span>' : '<span class="pill draft">Draft</span>';
    return `<div class="recent-item"><div class="recent-icon">${icon}</div><div class="recent-text"><strong>${esc(item.title)}</strong><small>${esc(kind)} · ${esc(fmtDate(item.updatedAt || item.createdAt || item.date))}</small></div>${published}</div>`;
  }).join('') : '<div class="recent-empty">Belum ada konten. Gunakan akses cepat untuk membuat show atau berita pertama.</div>';
}
function showTypeLabel(type) { return type === 'live' ? 'Live sekarang' : type === 'replay' ? 'Replay' : 'Akan datang'; }
function showTypePill(type) { return type === 'live' ? '<span class="pill live">● Live</span>' : type === 'replay' ? '<span class="pill replay">▷ Replay</span>' : '<span class="pill upcoming">▦ Upcoming</span>'; }
function renderShowTable() {
  const search = ($('#showSearch')?.value || '').toLocaleLowerCase('id-ID').trim();
  const filter = $('#showTypeFilter')?.value || 'all';
  const items = [...adminData.shows].filter(x => (filter === 'all' || x.type === filter) && [x.title,x.summary,x.members,x.category].join(' ').toLocaleLowerCase('id-ID').includes(search)).sort((a,b)=>(Date.parse(b.updatedAt || b.createdAt)||0)-(Date.parse(a.updatedAt || a.createdAt)||0));
  $('#showTableBody').innerHTML = items.map(item => `<tr><td><div class="table-title"><div class="table-thumb">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.remove()">` : '48'}</div><div><strong>${esc(item.title)}</strong><small>${esc(item.members || 'JKT48')}</small></div></div></td><td>${showTypePill(item.type)}<div style="font-size:8px;color:#83717b;margin-top:5px">${esc(item.category || 'Theater')}</div></td><td>${esc(fmtDateTime(item.dateTime))}</td><td>${item.published ? '<span class="pill published">Published</span>' : '<span class="pill draft">Draft</span>'}</td><td><div class="row-actions"><button class="row-action" data-edit-show="${esc(item.id)}">Edit</button><button class="row-action delete" data-delete-show="${esc(item.id)}">Hapus</button></div></td></tr>`).join('');
  $('#showTableEmpty').classList.toggle('hidden', items.length > 0);
}
function renderNewsTable() {
  const search = ($('#newsSearch')?.value || '').toLocaleLowerCase('id-ID').trim();
  const filter = $('#newsPublishFilter')?.value || 'all';
  const items = [...adminData.news].filter(x => (filter === 'all' || (filter === 'published' ? x.published : !x.published)) && [x.title,x.summary,x.category].join(' ').toLocaleLowerCase('id-ID').includes(search)).sort((a,b)=>(Date.parse(b.updatedAt || b.createdAt || b.date)||0)-(Date.parse(a.updatedAt || a.createdAt || a.date)||0));
  $('#newsTableBody').innerHTML = items.map(item => `<tr><td><div class="table-title"><div class="table-thumb">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.remove()">` : '✳'}</div><div><strong>${esc(item.title)}</strong><small>${esc(item.summary || 'Tanpa ringkasan')}</small></div></div></td><td>${esc(item.category || 'Update')}</td><td>${esc(fmtDate(item.date,{day:'numeric',month:'short',year:'numeric'}))}</td><td>${item.published ? '<span class="pill published">Published</span>' : '<span class="pill draft">Draft</span>'}</td><td><div class="row-actions"><button class="row-action" data-edit-news="${esc(item.id)}">Edit</button><button class="row-action delete" data-delete-news="${esc(item.id)}">Hapus</button></div></td></tr>`).join('');
  $('#newsTableEmpty').classList.toggle('hidden', items.length > 0);
}
function renderAccessEmails() {
  const target = $('#accessEmailList'); if (!target) return;
  const now = Date.now(); const items = [...(adminData.accessEmails || [])].sort((a,b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  target.innerHTML = items.length ? items.map(item => {
    const expired = Date.parse(item.expiresAt) <= now;
    return `<div class="access-email-row"><div><strong>${esc(item.email)}</strong><small>${expired ? 'Akses berakhir' : 'Berlaku hingga'} ${esc(fmtDate(item.expiresAt,{day:'numeric',month:'long',year:'numeric'}))}</small></div><span class="pill ${expired ? 'draft' : 'published'}">${expired ? 'Berakhir' : 'Aktif'}</span><button class="row-action delete" data-delete-access="${esc(item.id)}">Hapus</button></div>`;
  }).join('') : '<div class="recent-empty">Belum ada email yang diberi akses Live Stage.</div>';
}
function setupAccessEmailUI() {
  const newsLink = $('[data-admin-tab="news"]');
  if (!newsLink || $('[data-admin-tab="access"]')) return;
  newsLink.insertAdjacentHTML('afterend', '<button class="side-link" data-admin-tab="access"><span>✉</span> Akses Live Stage</button>');
  $('.admin-main').insertAdjacentHTML('beforeend', `<section class="admin-view hidden" data-view="access"><div class="toolbar-row"><div><h2>Kelola email Live Stage</h2><p>Email yang aktif dapat membuka halaman Live Stage hingga masa aksesnya berakhir.</p></div></div><div class="access-layout"><form id="accessEmailForm" class="admin-panel access-email-form"><div class="admin-panel-heading"><div><span class="panel-kicker">ADD ACCESS</span><h3>Tambah atau perpanjang akses</h3></div></div><label>Email terdaftar<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="nama@email.com"></label><label>Durasi akses<select name="duration"><option value="1d">1 hari</option><option value="1m">1 bulan</option><option value="1y">1 tahun</option></select></label><button class="button button-primary" type="submit">Simpan akses <span>→</span></button><p id="accessEmailMessage" class="form-error"></p></form><section class="admin-panel"><div class="admin-panel-heading"><div><span class="panel-kicker">AUTHORIZED EMAILS</span><h3>Email berizin</h3></div></div><div id="accessEmailList" class="access-email-list"></div></section></div></section>`);
  $$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.adminTab)));
  $('#accessEmailForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const message = $('#accessEmailMessage'); message.textContent = '';
    try { const result = await api('/api/admin/access-emails', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(form))) }); adminData.accessEmails = result.accessEmails || adminData.accessEmails; form.reset(); renderAccessEmails(); toast('Akses email berhasil disimpan.'); }
    catch (error) { message.textContent = error.message; }
  });
}
function fillSettingsForm() {
  const f = $('#settingsForm'); if (!f) return;
  for (const [key,val] of Object.entries(adminData.settings || {})) {
    const input = f.elements.namedItem(key); if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!val; else input.value = val ?? '';
  }
}
function setFormValue(form, name, value) { const input = form.elements.namedItem(name); if (!input) return; if (input.type === 'checkbox') input.checked = value !== false; else if (input.type === 'datetime-local') input.value = value ? toDateInput(value) : ''; else input.value = value ?? ''; }
function resetForm(form) { form.reset(); const idInput = form.elements.namedItem('id'); if (idInput) idInput.value = ''; }
function openEditor(kind, item = null) {
  const showMode = kind === 'show';
  $('#editorModal').classList.remove('hidden'); $('#showForm').classList.toggle('hidden', !showMode); $('#newsForm').classList.toggle('hidden', showMode);
  $('#editorKicker').textContent = showMode ? 'SHOW CONTENT EDITOR' : 'NEWS CONTENT EDITOR';
  $('#editorTitle').textContent = item ? (showMode ? 'Edit show' : 'Edit berita') : (showMode ? 'Tambah show baru' : 'Tulis berita baru');
  $('#editorDescription').textContent = showMode ? 'Tambahkan detail live, jadwal theater, atau arsip replay.' : 'Buat informasi atau pengumuman yang akan dibaca pengunjung.';
  const form = showMode ? $('#showForm') : $('#newsForm'); resetForm(form);
  const error = showMode ? $('#showFormError') : $('#newsFormError'); error.textContent = '';
  if (item) {
    for (const [key,value] of Object.entries(item)) setFormValue(form,key,value);
  } else {
    if (showMode) { setFormValue(form,'type','upcoming'); setFormValue(form,'category','Theater'); setFormValue(form,'published',true); setFormValue(form,'featured',false); }
    else { setFormValue(form,'category','Update'); setFormValue(form,'date',new Date().toISOString()); setFormValue(form,'published',true); }
  }
  document.body.style.overflow = 'hidden';
  const first = form.querySelector('input:not([type=hidden])'); if (first) setTimeout(() => first.focus(), 40);
}
function closeEditor() { $('#editorModal').classList.add('hidden'); document.body.style.overflow = ''; }
function setupIdnFields() {
  const streamField = $('#showForm [name="streamUrl"]')?.closest('label');
  if (!streamField || $('#showForm [name="idnSessionUrl"]')) return;
  streamField.insertAdjacentHTML('afterend', `<label class="full-field">URL session API IDN (opsional)<input name="idnSessionUrl" type="url" maxlength="1500" placeholder="Otomatis memakai API IDN bawaan"><small>Kosongkan untuk memakai API IDN bawaan. Isi hanya bila ingin menggunakan endpoint signer milik Anda; jangan masukkan secret/key partner.</small></label><label>Slug show IDN <span class="required-mark">*</span><input name="idnShowSlug" maxlength="130" placeholder="contoh: theater-2026-10-25"><small>Wajib diisi agar Server IDN dapat diputar.</small></label>`);
}
async function deleteItem(kind,id) {
  const arr = kind === 'show' ? adminData.shows : adminData.news; const item = arr.find(x => x.id === id); if (!item) return;
  if (!window.confirm(`Hapus "${item.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  try { await api(`/api/admin/${kind === 'show' ? 'shows' : 'news'}/${encodeURIComponent(id)}`,{method:'DELETE'}); await loadAdminData(); toast('Konten berhasil dihapus.'); }
  catch(e) { toast(e.message); }
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f)); $('#loginError').textContent = '';
  try { const result = await api('/api/admin/login',{method:'POST',body:JSON.stringify(data)}); adminUsername = result.username; showApp(); await loadAdminData(); toast('Berhasil login.'); }
  catch(err) { $('#loginError').textContent = err.message; }
});
$('#setupForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f)); $('#setupError').textContent = '';
  if (data.password !== data.confirmPassword) { $('#setupError').textContent = 'Konfirmasi password tidak sama.'; return; }
  try { const result = await api('/api/admin/setup',{method:'POST',body:JSON.stringify({ username:data.username, password:data.password })}); adminUsername = result.username; showApp(); await loadAdminData(); toast('Akun admin berhasil dibuat. Simpan password dengan aman.'); }
  catch(err) { $('#setupError').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { try { await api('/api/admin/logout',{method:'POST',body:'{}'}); } catch {} window.location.reload(); });
$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.adminTab)));
$$('[data-go-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.goTab)));
$('#quickAddBtn').addEventListener('click', () => openEditor('show'));
$$('[data-open-show-form]').forEach(button => button.addEventListener('click', () => openEditor('show')));
$$('[data-open-news-form]').forEach(button => button.addEventListener('click', () => openEditor('news')));
$$('[data-close-editor]').forEach(button => button.addEventListener('click', closeEditor));
$('#editorModal').addEventListener('click', e => { if (e.target.classList.contains('editor-backdrop')) closeEditor(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#editorModal').classList.contains('hidden')) closeEditor(); });
$('#showSearch').addEventListener('input',renderShowTable); $('#showTypeFilter').addEventListener('change',renderShowTable);
$('#newsSearch').addEventListener('input',renderNewsTable); $('#newsPublishFilter').addEventListener('change',renderNewsTable);
document.addEventListener('click', e => {
  const es = e.target.closest('[data-edit-show]'); if (es) { const item = adminData.shows.find(x => x.id === es.dataset.editShow); if (item) openEditor('show',item); return; }
  const ds = e.target.closest('[data-delete-show]'); if (ds) { deleteItem('show',ds.dataset.deleteShow); return; }
  const en = e.target.closest('[data-edit-news]'); if (en) { const item = adminData.news.find(x => x.id === en.dataset.editNews); if (item) openEditor('news',item); return; }
  const dn = e.target.closest('[data-delete-news]'); if (dn) { deleteItem('news',dn.dataset.deleteNews); }
  const da = e.target.closest('[data-delete-access]'); if (da) {
    const item = adminData.accessEmails.find(x => x.id === da.dataset.deleteAccess); if (!item || !window.confirm(`Hapus akses ${item.email}?`)) return;
    api(`/api/admin/access-emails/${encodeURIComponent(item.id)}`, { method:'DELETE' }).then(() => loadAdminData()).then(() => toast('Akses email dihapus.')).catch(error => toast(error.message));
  }
});
$('#showForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f));
  data.dateTime = fromDateInput(data.dateTime); data.featured = f.elements.namedItem('featured').checked; data.published = f.elements.namedItem('published').checked;
  $('#showFormError').textContent = '';
  try { await api('/api/admin/shows',{method:'POST',body:JSON.stringify(data)}); closeEditor(); await loadAdminData(); setTab('shows'); toast('Show berhasil disimpan.'); }
  catch(err) { $('#showFormError').textContent = err.message; }
});
$('#newsForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f)); data.date = fromDateInput(data.date); data.published = f.elements.namedItem('published').checked; $('#newsFormError').textContent = '';
  try { await api('/api/admin/news',{method:'POST',body:JSON.stringify(data)}); closeEditor(); await loadAdminData(); setTab('news'); toast('Berita berhasil disimpan.'); }
  catch(err) { $('#newsFormError').textContent = err.message; }
});
$('#settingsForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f)); data.announcementEnabled = f.elements.namedItem('announcementEnabled').checked;
  try { const result = await api('/api/admin/settings',{method:'POST',body:JSON.stringify(data)}); adminData.settings = result.settings; $('#settingsMessage').textContent = 'Pengaturan berhasil disimpan.'; toast('Pengaturan website berhasil disimpan.'); }
  catch(err) { $('#settingsMessage').textContent = err.message; $('#settingsMessage').style.color = '#ff90a8'; }
});
$('#passwordForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f)); $('#passwordMessage').textContent = ''; $('#passwordMessage').style.color = '';
  if (data.newPassword !== data.confirmPassword) { $('#passwordMessage').textContent = 'Konfirmasi password baru tidak sama.'; return; }
  try { await api('/api/admin/password',{method:'POST',body:JSON.stringify({currentPassword:data.currentPassword,newPassword:data.newPassword})}); f.reset(); $('#passwordMessage').textContent = 'Password berhasil diperbarui.'; $('#passwordMessage').style.color = '#9ce4b0'; toast('Password admin berhasil diperbarui.'); }
  catch(err) { $('#passwordMessage').textContent = err.message; }
});
setupIdnFields();
setupAccessEmailUI();
setTab('dashboard');
checkSession().catch(err => showAuth({configured:true,login:true,error:err.message}));
