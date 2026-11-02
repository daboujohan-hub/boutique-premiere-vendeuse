'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const F = n => Number(n || 0).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
let token = '';
try { token = localStorage.getItem('tk') || ''; } catch (e) {}
let PRODS = [], CMDS = [], CFG = {}, STATS = null, FILT = 'Toutes', CUR_IMG = '';
const AIDE_NUM = '2250565961287';

async function api(path, method, body) {
  const r = await fetch(path, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Token': token },
    body: body ? JSON.stringify(body) : undefined
  });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (r.status === 401 && path !== '/api/login') { logout(); }
  return { ok: r.ok, status: r.status, d };
}
function toast(t, bad) {
  const e = $('#toast'); e.textContent = t; e.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => e.className = 'toast', 3200);
}
function logout() {
  token = ''; try { localStorage.removeItem('tk'); } catch (e) {}
  $('#app').classList.add('hide'); $('#login').classList.remove('hide');
}

/* ---------- connexion ---------- */
async function login() {
  $('#loginMsg').textContent = '';
  const r = await api('/api/login', 'POST', { password: $('#pw').value });
  if (!r.ok) { $('#loginMsg').textContent = r.d.erreur || 'Erreur'; return; }
  token = r.d.token; try { localStorage.setItem('tk', token); } catch (e) {}
  start();
}
$('#loginBtn').onclick = login;
$('#pw').onkeydown = e => { if (e.key === 'Enter') login(); };
$('#logout').onclick = logout;

/* ---------- navigation ---------- */
function show(v) {
  ['home', 'prod', 'cmd', 'cfg', 'aide'].forEach(x => $('#v-' + x).classList.toggle('hide', x !== v));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => show(b.dataset.v));
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act="aide"]');
  if (a) { e.preventDefault(); aide(); }
  const g = e.target.closest('[data-go]');
  if (g) show(g.dataset.go);
});
function aide() {
  const nom = CFG.nom_boutique || 'ma boutique';
  const m = 'Bonjour, je suis la vendeuse de « ' + nom + ' ». J\'ai besoin d\'aide avec mon espace vendeuse : ';
  window.open('https://wa.me/' + AIDE_NUM + '?text=' + encodeURIComponent(m), '_blank');
}

/* ---------- accueil ---------- */
function dur(s) { s = Math.round(s || 0); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60 ? (s % 60) + ' s' : ''); }
function renderHome() {
  const s = STATS; if (!s) { $('#v-home').innerHTML = '<p class="empty">Chargement…</p>'; return; }
  const max = Math.max(1, ...s.jours.map(j => j.n));
  const jn = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const pct = s.sessions ? Math.round(100 * s.restes / s.sessions) : 0;
  $('#v-home').innerHTML =
    '<h2>Bonjour 👋</h2><p class="sub">Voici ce qui se passe sur ta boutique.</p>' +
    '<div class="card"><h3>À vérifier</h3>' + s.alertes.map(a =>
      '<div class="al ' + a.niveau + '"><p>' + esc(a.texte) + '</p>' +
      (a.va ? '<button data-go="' + a.va + '">Corriger</button>' : '') + '</div>').join('') + '</div>' +
    '<div class="grid2">' +
    '<div class="stat"><small>Visiteurs aujourd\'hui</small><b>' + s.visiteurs.jour + '</b><em>' + s.visiteurs.semaine + ' cette semaine</em></div>' +
    '<div class="stat"><small>Visiteurs ce mois</small><b>' + s.visiteurs.mois + '</b><em>' + s.sessions + ' visites</em></div>' +
    '<div class="stat o"><small>Temps passé (moyenne)</small><b>' + dur(s.duree_moy) + '</b><em>par visite</em></div>' +
    '<div class="stat o"><small>Sont restés 30 s+</small><b>' + pct + ' %</b><em>' + s.restes + ' sur ' + s.sessions + '</em></div>' +
    '<div class="stat"><small>Commandes (30 j)</small><b>' + s.commandes + '</b><em>sans les annulées</em></div>' +
    '<div class="stat"><small>Ventes (30 j)</small><b>' + F(s.ca) + '</b><em>FCFA</em></div></div>' +
    '<div class="card"><h3>Visiteurs des 7 derniers jours</h3><div class="bars">' + s.jours.map(j =>
      '<div class="bar"><span>' + j.n + '</span><i style="height:' + Math.round(j.n / max * 80) + '%"></i>' +
      jn[new Date(j.date + 'T12:00:00').getDay()] + '</div>').join('') + '</div></div>' +
    '<div class="card"><h3>Produits les plus regardés</h3>' + (s.top.length ? s.top.map(t =>
      '<div class="line"><div class="th">' + (t.image ? '<img src="' + esc(t.image) + '">' : '🛍️') + '</div>' +
      '<div class="d"><b>' + esc(t.nom) + '</b><small>' + t.code + ' · ' + t.vues + ' vues · ' + t.paniers + ' ajouts au panier</small></div></div>').join('')
      : '<p class="empty">Pas encore de visites. Partage le lien de ta boutique !</p>') + '</div>' +
    (s.sources.length ? '<div class="card"><h3>D\'où viennent tes visiteurs</h3>' + s.sources.map(x =>
      '<div class="line"><div class="d">' + esc(x.source || 'direct') + '</div><b>' + x.n + '</b></div>').join('') + '</div>' : '') +
    '<div class="card help"><h3>Besoin d\'aide ?</h3><a class="btn" data-act="aide" href="#">💬 Contacter le développeur</a></div>';
}
async function loadStats() { const r = await api('/api/admin/stats'); if (r.ok) { STATS = r.d; renderHome(); } }

/* ---------- produits ---------- */
async function loadProds() { const r = await api('/api/admin/produits'); if (r.ok) { PRODS = r.d; renderProds(); } }
function renderProds() {
  $('#plist').innerHTML = PRODS.length ? PRODS.map(p =>
    '<div class="line"><div class="th">' + (p.image ? '<img src="' + esc(p.image) + '">' : '🛍️') + '</div>' +
    '<div class="d"><b>' + esc(p.nom) + '</b> <span class="pill">' + (p.code || '') + '</span>' +
    '<small>' + F(p.prix) + ' F · stock ' + p.stock + (p.actif ? '' : ' · masqué') + '</small></div>' +
    '<button class="sm" onclick="editProd(' + p.id + ')">Modifier</button></div>').join('')
    : '<p class="empty">Aucun produit. Appuie sur « Ajouter un produit ».</p>';
}
const TAILLES = ['S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', '44', 'Unique'];
let SZ = [], CL = [];
function chipsHtml(list, id, sugg) {
  const all = Array.from(new Set((sugg || []).concat(list)));
  return '<div class="chips" id="' + id + '">' + all.map(t =>
    '<button type="button" class="chip' + (list.includes(t) ? ' on' : '') + '" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>';
}
function bindChips(id, arr) {
  $('#' + id).onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const v = b.dataset.v, i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    b.classList.toggle('on');
  };
}
function addChip(id, arr, inputId) {
  const el = $('#' + inputId), v = el.value.trim(); if (!v) return;
  if (!arr.includes(v)) arr.push(v);
  el.value = ''; return true;
}
function openSheet(h) { $('#sheetBox').innerHTML = '<button class="x" onclick="closeSheet()">×</button>' + h; $('#sheet').classList.add('on'); }
function closeSheet() { $('#sheet').classList.remove('on'); }
$('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
function editProd(id) {
  const p = PRODS.find(x => x.id === id) || { nom: '', categorie: '', prix: '', description: '', matiere: '', tailles: [], couleurs: [], stock: 1, actif: 1, image: '' };
  SZ = (p.tailles || []).slice(); CL = (p.couleurs || []).slice(); CUR_IMG = ''; IM = (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])).slice();
  openSheet(
    '<h2>' + (p.id ? 'Modifier le produit' : 'Nouveau produit') + (p.code ? ' · ' + p.code : '') + '</h2>' +
    '<label>Photos (jusqu\'à 5 : la première est la photo principale)</label><div id="imBox"></div>' +
    '<input type="file" id="pf" accept="image/*" multiple class="hide"><button class="sm o" type="button" id="imAdd" style="margin-top:8px">＋ Ajouter des photos</button>' +
    '<label>Nom du produit</label><input id="pNom" maxlength="60" value="' + esc(p.nom) + '" placeholder="Ex : Robe en pagne">' +
    '<div class="row2"><div><label>Prix (FCFA)</label><input id="pPrix" type="number" inputmode="numeric" value="' + esc(p.prix) + '" placeholder="Ex : 11000"><div class="hint" id="hPrix"></div></div>' +
    '<div><label>Stock (quantité)</label><input id="pStock" type="number" inputmode="numeric" min="0" value="' + esc(p.stock) + '"></div></div>' +
    '<label>Catégorie</label><input id="pCat" list="cats" value="' + esc(p.categorie) + '" placeholder="Ex : Robes"><datalist id="cats">' +
    Array.from(new Set(PRODS.map(x => x.categorie).filter(Boolean))).map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
    '<label>Description</label><button type="button" class="sm o" id="genD">✨ Écrire la description pour moi</button>' +
    '<textarea id="pDesc" rows="5" style="margin-top:8px">' + esc(p.description) + '</textarea>' +
    '<label>Matière (facultatif)</label><input id="pMat" value="' + esc(p.matiere) + '">' +
    '<label>Tailles (facultatif — touche pour choisir)</label>' + chipsHtml(SZ, 'szBox', TAILLES) +
    '<div class="add"><input id="szNew" placeholder="Autre taille"><button type="button" class="sm" id="szAdd">Ajouter</button></div>' +
    '<label>Couleurs (facultatif)</label>' + chipsHtml(CL, 'clBox', ['Noir', 'Blanc', 'Rouge', 'Bleu', 'Vert', 'Jaune', 'Rose']) +
    '<div class="add"><input id="clNew" placeholder="Autre couleur"><button type="button" class="sm" id="clAdd">Ajouter</button></div>' +
    '<label><input type="checkbox" id="pActif"' + (p.actif ? ' checked' : '') + '> Visible dans la boutique</label>' +
    '<button class="btn g" id="pSave" style="margin-top:16px">Enregistrer</button>' +
    (p.id ? '<button class="btn lt" id="pDel" style="margin-top:10px">Supprimer ce produit</button>' : ''));
  bindChips('szBox', SZ); bindChips('clBox', CL);
  $('#szAdd').onclick = () => { if (addChip('szBox', SZ, 'szNew')) { $('#szBox').outerHTML = chipsHtml(SZ, 'szBox', TAILLES); bindChips('szBox', SZ); } };
  $('#clAdd').onclick = () => { if (addChip('clBox', CL, 'clNew')) { $('#clBox').outerHTML = chipsHtml(CL, 'clBox', []); bindChips('clBox', CL); } };
  $('#pPrix').oninput = () => {
    const v = +$('#pPrix').value, h = $('#hPrix');
    if (!v) { h.textContent = ''; h.className = 'hint'; }
    else if (v < 500) { h.textContent = '⚠️ ' + F(v) + ' F : trop bas ? Tu veux écrire ' + F(v * 1000) + ' F ?'; h.className = 'hint bad'; }
    else { h.textContent = F(v) + ' FCFA'; h.className = 'hint ok'; }
  };
  $('#pPrix').oninput();
  drawIm(); $('#imAdd').onclick = () => $('#pf').click(); $('#pf').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#pSave').onclick = () => saveProd(p.id, false);
  if (p.id) $('#pDel').onclick = async () => {
    if (!confirm('Supprimer « ' + p.nom + ' » ?')) return;
    const r = await api('/api/admin/produit/' + p.id, 'DELETE');
    if (r.ok) { closeSheet(); toast('Produit supprimé'); loadProds(); loadStats(); } else toast(r.d.erreur || 'Erreur', true);
  };
}
function resize(file, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const m = 900, k = Math.min(1, m / Math.max(im.width, im.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.82));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
async function saveProd(id, confirme) {
  const body = {
    id: id || undefined, nom: $('#pNom').value, prix: $('#pPrix').value, stock: $('#pStock').value,
    categorie: $('#pCat').value, description: $('#pDesc').value, matiere: $('#pMat').value,
    tailles: SZ.join(','), couleurs: CL.join(','), actif: $('#pActif').checked ? 1 : 0, confirme: confirme ? 1 : 0
  };
  body.images = IM;
  const r = await api('/api/admin/produit', 'POST', body);
  if (r.status === 409 && r.d.confirmer) {
    if (confirm(r.d.erreur + '\n\nOK = enregistrer quand même\nAnnuler = corriger')) return saveProd(id, true);
    return;
  }
  if (!r.ok) return toast(r.d.erreur || 'Erreur', true);
  closeSheet(); toast('Produit enregistré ✅'); loadProds(); loadStats();
}
$('#addBtn').onclick = () => editProd(0);

/* ---------- commandes ---------- */
async function loadCmds() { const r = await api('/api/admin/commandes'); if (r.ok) { CMDS = r.d; renderCmds(); } }
const STAT = ['en attente', 'confirmée', 'livrée', 'annulée'];
function renderCmds() {
  const n = CMDS.filter(o => o.statut === 'en attente').length;
  $('#bCmd').textContent = n; $('#bCmd').classList.toggle('hide', !n);
  $('#fcmd').innerHTML = ['Toutes'].concat(STAT).map(s =>
    '<button class="chip' + (s === FILT ? ' on' : '') + '" data-f="' + s + '">' + s + '</button>').join('');
  $('#fcmd').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { FILT = b.dataset.f; renderCmds(); } };
  const list = CMDS.filter(o => FILT === 'Toutes' || o.statut === FILT || (FILT === 'annulée' && o.statut === 'expirée'));
  $('#clist').innerHTML = list.length ? list.map(o => {
    let items = o.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
    const nom = o.client || o.nom || o.nom_client || '', tel = o.telephone || o.tel || '';
    const lieu = [o.ville, o.quartier, o.adresse].filter(Boolean).join(' · ');
    const wa = tel ? 'https://wa.me/' + String(tel).replace(/\D/g, '').replace(/^(0\d{9})$/, '225$1') : '';
    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>Commande #' + o.id + '</b>' +
      '<span class="pill ' + (o.statut === 'en attente' ? 'wait' : o.statut) + '">' + esc(o.statut) + '</span></div>' +
      '<p class="sub" style="margin:2px 0 8px">' + esc(o.date || '') + '</p>' +
      '<p><b>' + esc(nom) + '</b> ' + esc(tel) + '</p><p class="sub" style="margin:0 0 8px">' + esc(lieu) + '</p>' +
      (items || []).map(l => '<div class="line"><div class="d"><b>' + esc(l.nom) + '</b>' +
        '<small>' + (l.code ? l.code + ' · ' : '') + [l.taille, l.couleur].filter(Boolean).join(' / ') + ' × ' + (l.quantite || 1) + '</small></div><b>' + F((l.prix || 0) * (l.quantite || 1)) + ' F</b></div>').join('') +
      '<p style="margin-top:8px;font-weight:800">Total : ' + F(o.total) + ' FCFA</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      (wa ? '<a class="sm wa" target="_blank" href="' + wa + '">💬 WhatsApp</a>' : '') +
      (o.statut === 'en attente' ? '<button class="sm" onclick="setStat(' + o.id + ',\'confirmée\')">Confirmer</button>' : '') +
      (o.statut === 'confirmée' ? '<button class="sm" onclick="setStat(' + o.id + ',\'livrée\')">Livrée</button>' : '') +
      (o.statut === 'en attente' || o.statut === 'confirmée' ? '<button class="sm red" onclick="setStat(' + o.id + ',\'annulée\')">Annuler</button>' : '') +
      (o.statut === 'livrée' || o.statut === 'annulée' || o.statut === 'expirée' ? '<button class="sm lt" onclick="delCmd(' + o.id + ')">🗑 Effacer</button>' : '') +
      '</div></div>';
  }).join('') : '<p class="empty">Aucune commande ici.</p>';
}
async function setStat(id, s) {
  if (s === 'annulée' && !confirm('Annuler cette commande ? Le stock sera remis.')) return;
  const r = await api('/api/admin/commande/' + id + '/statut', 'POST', { statut: s });
  if (!r.ok) return toast(r.d.erreur || 'Erreur', true);
  toast('Mis à jour'); loadCmds(); loadStats(); loadProds();
}

/* ---------- réglages ---------- */
async function loadCfg() {
  const c = await (await fetch('/api/config')).json(); CFG = c;
  $('#shopName').textContent = c.nom_boutique || 'Ma boutique';
  $('#cNom').value = c.nom_boutique || ''; $('#cWa').value = c.whatsapp || '';
  $('#cMsg').value = c.message_paiement || ''; $('#cUrl').value = c.site_url || '';
  $('#cDelai').value = c.delai_reservation || '3'; setCol(c.couleur || 'vert');
  $('#cVilles').value = (c.villes || []).map(v => v.ville + ': ' + (v.quartiers || []).join(', ')).join('\n');
  checkWa(); checkNom();
}
function validTel(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('00225')) d = d.slice(5); else if (d.startsWith('225') && d.length === 13) d = d.slice(3);
  if (d.length === 10 && ['01', '05', '07'].includes(d.slice(0, 2))) return true;
  return /^\s*\+/.test(t) && !/^\s*\+225/.test(t) && d.length >= 8 && d.length <= 15;
}
function checkWa() {
  const v = $('#cWa').value.trim(), h = $('#hWa'), a = $('#testWa');
  if (!v) { h.textContent = 'Obligatoire pour recevoir les commandes.'; h.className = 'hint bad'; a.classList.add('hide'); return; }
  if (!validTel(v)) { h.textContent = '❌ Numéro invalide. Exemple : 0707070707'; h.className = 'hint bad'; a.classList.add('hide'); return; }
  h.textContent = '✅ Numéro correct'; h.className = 'hint ok'; a.classList.remove('hide');
  const d = v.replace(/\D/g, '').replace(/^00225|^225(?=\d{10}$)/, '');
  a.href = 'https://wa.me/' + (d.length === 10 ? '225' + d : d) + '?text=' + encodeURIComponent('Test de ma boutique ✅');
}
function checkNom() {
  const v = $('#cNom').value.trim(), h = $('#hNom');
  const bad = /(.)\1\1/i.test(v) || v.toLowerCase().split(/[^a-zà-ÿ]+/).some(w => w.length >= 4 && !/[aeiouyàâäéèêëîïôöùûü]/.test(w));
  if (v.length < 2) { h.textContent = 'Donne un nom à ta boutique.'; h.className = 'hint bad'; }
  else if (bad) { h.textContent = '⚠️ Ce nom semble mal écrit. Vérifie.'; h.className = 'hint bad'; }
  else { h.textContent = ''; h.className = 'hint'; }
}
$('#cWa').oninput = checkWa; $('#cNom').oninput = checkNom;
$('#saveC').onclick = async () => {
  if (!validTel($('#cWa').value)) return toast('Numéro WhatsApp invalide. Exemple : 0707070707', true);
  const villes = $('#cVilles').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf(':');
    return i < 0 ? { ville: l, quartiers: [] } : { ville: l.slice(0, i).trim(), quartiers: l.slice(i + 1).split(',').map(x => x.trim()).filter(Boolean) };
  });
  const r = await api('/api/admin/config', 'POST', {
    nom_boutique: $('#cNom').value, whatsapp: $('#cWa').value, message_paiement: $('#cMsg').value,
    couleur: $('#cCol').value, site_url: $('#cUrl').value, delai_reservation: $('#cDelai').value, villes
  });
  if (!r.ok) return toast(r.d.erreur || 'Erreur', true);
  toast('Réglages enregistrés ✅'); loadCfg(); loadStats();
};

/* ---------- démarrage ---------- */
async function start() {
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  await loadCfg(); loadStats(); loadProds(); loadCmds();
}
if (token) {
  api('/api/admin/produits').then(r => { if (r.ok) start(); else logout(); });
} else logout();

function setCol(v) {
  $('#cCol').value = v;
  document.querySelectorAll('#colBox .sw').forEach(b => b.classList.toggle('on', b.dataset.col === v));
}
document.addEventListener('click', e => { const b = e.target.closest('#colBox .sw'); if (b) setCol(b.dataset.col); });

/* ---------- description automatique ---------- */
let DESC_N = 0;
function genDesc() {
  const nom = $('#pNom').value.trim();
  if (nom.length < 2) return toast('Écris d\'abord le nom du produit', true);
  const cat = $('#pCat').value.trim(), mat = $('#pMat').value.trim(), prix = +$('#pPrix').value, stock = +$('#pStock').value;
  const accroches = [
    nom + ' : une belle trouvaille pour toi ✨',
    'Découvre ' + nom + ' dans notre boutique 🛍️',
    nom + ' est disponible, viens le voir 😍',
    'Nouveau chez nous : ' + nom + ' ✨'
  ];
  const l = [accroches[DESC_N++ % accroches.length]];
  if (mat) l.push('🧵 Matière : ' + mat);
  l.push('💬 Commande directe sur WhatsApp.');
  const t = $('#pDesc');
  if (t.value.trim() && !confirm('Remplacer la description actuelle ?')) return;
  t.value = l.join('\n');
}
document.addEventListener('click', e => { if (e.target.id === 'genD') genDesc(); });

/* ---------- plusieurs photos ---------- */
let IM = [];
function drawIm() {
  const b = $('#imBox'); if (!b) return;
  b.innerHTML = IM.length ? '<div class="chips">' + IM.map((u, k) =>
    '<div style="width:92px"><div class="prev" style="width:92px;height:92px;position:relative"><img src="' + esc(u) + '">' +
    (k === 0 ? '<span class="pill" style="position:absolute;left:4px;top:4px;background:#f77f00;color:#fff">★ Principale</span>' : '') + '</div>' +
    '<div style="display:flex;gap:4px;margin-top:4px">' +
    (k > 0 ? '<button type="button" class="sm lt" style="padding:6px 8px;flex:1" data-im="up" data-k="' + k + '">◀</button>' : '') +
    '<button type="button" class="sm red" style="padding:6px 8px;flex:1" data-im="del" data-k="' + k + '">✕</button></div></div>').join('') + '</div>'
    : '<div class="prev">📷</div>';
  const a = $('#imAdd'); if (a) a.classList.toggle('hide', IM.length >= 5);
}
function addFiles(files) {
  let rest = 5 - IM.length;
  if (!rest) return toast('5 photos maximum', true);
  Array.from(files).slice(0, rest).forEach(f => resize(f, d => { if (IM.length < 5) { IM.push(d); drawIm(); } }));
  if (files.length > rest) toast('5 photos maximum : les autres sont ignorées', true);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-im]'); if (!b) return;
  const k = +b.dataset.k;
  if (b.dataset.im === 'del') IM.splice(k, 1);
  else if (k > 0) { const t = IM[k]; IM[k] = IM[k - 1]; IM[k - 1] = t; }
  drawIm();
});

/* avis sur le texte de confidentialité */
(function () {
  const rh = renderHome;
  renderHome = function () {
    rh();
    const a = STATS && STATS.avis;
    if (a && a.oui + a.non > 0) {
      $('#v-home').insertAdjacentHTML('beforeend', '<div class="card"><h3>Texte « Mes informations » : utile ?</h3>' +
        '<div class="line"><div class="d">👍 Oui</div><b>' + a.oui + '</b></div><div class="line"><div class="d">👎 Non</div><b>' + a.non + '</b></div></div>');
    }
  };
})();

async function delCmd(id) {
  if (!confirm('Effacer pour toujours la commande #' + id + ' et les informations de la cliente ?\nCette action ne peut pas être annulée.')) return;
  const r = await api('/api/admin/commande/' + id, 'DELETE');
  if (!r.ok) return toast(r.d.erreur || 'Erreur', true);
  toast('Commande effacée'); loadCmds(); loadStats();
}
