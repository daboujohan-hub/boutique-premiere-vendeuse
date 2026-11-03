'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const F = n => Number(n || 0).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
const PALETTE = { vert: '#14532d', orange: '#c2410c', rose: '#be185d', bleu: '#1d4ed8', violet: '#6d28d9', noir: '#18181b' };
let cfg = { villes: [] }, produits = [], panier = [], cat = 'Tout', cur = null, sel = { taille: '', couleur: '', q: 1 };
try { panier = JSON.parse(localStorage.getItem('panier2') || '[]'); } catch (e) { panier = []; }
const save = () => { try { localStorage.setItem('panier2', JSON.stringify(panier)); } catch (e) {} };
const imgs = p => (p.images && p.images.length ? p.images : (p.image ? [p.image] : []));

/* AUTOFILL_V1 */
function toast(t) { const e = $('#toast'); e.textContent = t; e.className = 'toast on'; clearTimeout(toast.t); toast.t = setTimeout(() => e.className = 'toast', 2600); }
function openSheet(h) { $('#box').innerHTML = '<button class="x" data-close>×</button>' + h; $('#sheet').classList.add('on'); $('#box').scrollTop = 0; }
function closeSheet() { $('#sheet').classList.remove('on'); cur = null; }

async function load() {
  setTimeout(() => document.body.classList.remove('wait'), 4000);
  try { cfg = await (await fetch('/api/config')).json(); } catch (e) {}
  if (!cfg.villes) cfg.villes = [];
  let col = cfg.couleur;
  try {
    if (!localStorage.getItem('tk')) {
      const sc = sessionStorage.getItem('couleur');
      if (sc && PALETTE[sc]) col = sc; else if (PALETTE[col]) sessionStorage.setItem('couleur', col);
    }
  } catch (e) {}
  const main = PALETTE[col] || PALETTE.vert;
  document.documentElement.style.setProperty('--main', main);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = main;
  const nom = cfg.nom_boutique || 'Ma Boutique';
  $('#logo').textContent = nom; document.title = nom;
  $('#zones').textContent = cfg.villes.length ? '📍 ' + cfg.villes.map(v => v.ville).join(' · ') : '';
  $('#foot').innerHTML = '<button class="guidebtn" id="guideBtn">❓ Comment commander · Sécurité</button> <button class="guidebtn" id="privBtn">🔒 Mes informations</button><br>© ' + esc(nom);
  try { produits = await (await fetch('/api/produits')).json(); } catch (e) { produits = []; }
  renderCats(); renderGrid(); renderBar();
  document.body.classList.remove('wait');
  const id = +new URLSearchParams(location.search).get('p'); if (id) openProduct(id);
}

function openGuide() {
  const h = +cfg.delai_reservation;
  const dure = h > 0 ? 'Le produit que tu commandes est mis de côté pour toi pendant ' + h + ' heure' + (h > 1 ? 's' : '') + ', le temps que la vendeuse confirme.' : 'Le produit que tu commandes est mis de côté pour toi.';
  openSheet('<div class="pad guide"><h2>Comment commander</h2><ol>' +
    '<li>Touche un produit pour voir les photos (glisse vers la gauche) et le prix.</li>' +
    '<li>Choisis la taille et la couleur si elles sont proposées, puis touche <b>Ajouter au panier</b>.</li>' +
    '<li>Touche le panier 🛒 en haut ou la barre en bas, puis remplis ton nom, ton numéro, ta ville et ton quartier.</li>' +
    '<li>Touche <b>Commander sur WhatsApp</b> : WhatsApp s\'ouvre avec ton message déjà écrit. Envoie-le.</li>' +
    '<li>La vendeuse te répond sur WhatsApp pour confirmer et organiser la livraison.</li></ol>' +
    '<h2 style="margin-top:18px">Sécurité et confiance</h2><ul>' +
    '<li><b>Tu ne paies rien sur ce site.</b> Le paiement se fait avec la vendeuse, sur WhatsApp ou à la livraison.</li>' +
    '<li><b>Pas de compte à créer.</b> Nous gardons seulement ton nom, ton numéro, ta ville et ton quartier, pour que la vendeuse te livre et te contacte.</li>' +
    '<li>' + esc(dure) + '</li>' +
    '<li>Le prix est calculé par la boutique : celui affiché est celui que tu paies.</li>' +
    '<li>Tes visites sont comptées sans ton nom ni ton numéro.</li>' +
    '<li>Vérifie toujours le message avant de l\'envoyer, et ne donne jamais de mot de passe ou de code par message.</li></ul>' +
    '<button class="go" data-close>J\'ai compris</button></div>');
}

function openPrivacy() {
  const nom = esc(cfg.nom_boutique || 'la boutique');
  let num = String(cfg.whatsapp || '').replace(/\D/g, ''); if (num.length === 10) num = '225' + num;
  openSheet('<div class="pad guide"><h2>🔒 Tes informations personnelles</h2>' +
    '<p class="meta">Ce que « ' + nom + ' » fait de tes informations quand tu commandes.</p>' +
    '<h3>Ce que nous demandons</h3><ul><li>Ton <b>nom</b>, ton <b>numéro WhatsApp</b>, ta <b>ville</b> et ton <b>quartier</b>.</li>' +
    '<li>Les produits que tu commandes, avec la date et l\'heure.</li>' +
    '<li>Rien d\'autre : pas de mot de passe, pas de compte, pas de numéro de carte ni de Mobile Money.</li></ul>' +
    '<h3>Pourquoi</h3><ul><li>Pour que la vendeuse prépare ta commande, te contacte et te livre.</li>' +
    '<li>Nous n\'utilisons pas ton numéro pour de la publicité et nous ne le vendons pas.</li></ul>' +
    '<h3>Qui les voit</h3><ul><li>La vendeuse de « ' + nom + ' », dans son espace protégé par mot de passe.</li>' +
    '<li>Le développeur de la boutique, uniquement pour la maintenir en état de marche.</li>' +
    '<li>WhatsApp, quand tu envoies ton message de commande (selon ses propres règles).</li>' +
    '<li>Personne d\'autre.</li></ul>' +
    '<h3>Où et combien de temps</h3><ul><li>Elles sont enregistrées sur le serveur de la boutique.</li>' +
    '<li>Elles sont gardées pour suivre ta commande et les éventuels problèmes de livraison.</li></ul>' +
    '<h3>Tes droits</h3><ul><li>Tu peux demander à voir, corriger ou <b>faire effacer</b> tes informations à tout moment.</li>' +
    '<li>' + (num ? '<a href="https://wa.me/' + num + '?text=' + encodeURIComponent('Bonjour, je voudrais faire effacer mes informations personnelles de votre boutique.') + '" target="_blank">Écris à la boutique sur WhatsApp</a> et nous nous en occupons.' : 'Écris à la boutique sur WhatsApp et nous nous en occupons.') + '</li></ul>' +
    '<h3>Sur ton téléphone</h3><ul><li>Ton panier est gardé sur ton téléphone pour que tu ne le perdes pas.</li>' +
    '<li>Les visites sont comptées avec un identifiant au hasard, sans ton nom ni ton numéro.</li></ul>' +
    '<div class="avis" id="avis">' + (avisDonne() ? '<p>Merci pour ton avis 🙏</p>' :
      '<p><b>Ce texte t\'a-t-il été utile ?</b></p><div class="avisbtn"><button class="opt" id="avisOui">👍 Oui</button><button class="opt" id="avisNon">👎 Non</button></div>') + '</div>' +
    '<button class="go lt" data-close style="margin-top:14px">Fermer</button></div>');
}
function avisDonne() { try { return !!sessionStorage.getItem('avis'); } catch (e) { return false; } }
function donnerAvis(oui) {
  try { sessionStorage.setItem('avis', oui ? 'oui' : 'non'); } catch (e) {}
  track(oui ? 'avis_oui' : 'avis_non');
  const a = $('#avis'); if (a) a.innerHTML = '<p>' + (oui ? 'Merci pour ton avis 🙏' : 'Merci. Écris-nous sur WhatsApp si quelque chose n\'est pas clair 🙏') + '</p>';
}
function renderCats() {
  const cs = ['Tout'].concat(Array.from(new Set(produits.map(p => p.categorie).filter(Boolean))));
  $('#cats').innerHTML = cs.length > 1 ? cs.map(c => '<button class="cat' + (c === cat ? ' on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('') : '';
}
function renderGrid() {
  const q = $('#search').value.trim().toLowerCase(), s = $('#sort').value;
  let l = produits.filter(p => (cat === 'Tout' || p.categorie === cat) && (!q || (p.nom + ' ' + (p.code || '')).toLowerCase().includes(q)));
  if (s === 'low') l.sort((a, b) => a.prix - b.prix);
  else if (s === 'high') l.sort((a, b) => b.prix - a.prix);
  else if (s === 'pop') l.sort((a, b) => (b.demandes || 0) - (a.demandes || 0));
  $('#grid').innerHTML = l.length ? l.map(p => {
    const im = imgs(p)[0];
    return '<div class="card" data-open="' + p.id + '"><div class="pic">' + (im ? '<img loading="lazy" src="' + esc(im) + '" alt="">' : '🛍️') +
      '<span class="code">' + esc(p.code || '') + '</span>' +
      (p.stock > 0 && p.stock <= 3 ? '<span class="flag">Plus que ' + p.stock + '</span>' : '') +
      (p.stock <= 0 ? '<div class="sold">ÉPUISÉ</div>' : '') + '</div>' +
      '<div class="info"><b>' + esc(p.nom) + '</b><span class="price">' + F(p.prix) + ' F</span></div></div>';
  }).join('') : '<p class="empty">' + (produits.length ? 'Aucun produit trouvé.' : 'La boutique prépare ses produits. Reviens bientôt 🌿') + '</p>';
}
function renderBar() {
  const n = panier.reduce((a, i) => a + i.quantite, 0), t = panier.reduce((a, i) => a + i.quantite * i.prix, 0);
  const b = $('#cartBar'); b.classList.toggle('hide', !n);
  b.innerHTML = '<span>🛒 ' + n + ' article' + (n > 1 ? 's' : '') + ' · ' + F(t) + ' F</span><span>Voir mon panier →</span>';
  const cn = $('#cartN'); cn.textContent = n; cn.classList.toggle('hide', !n);
}

function openProduct(id) {
  const p = produits.find(x => x.id === id); if (!p) return;
  cur = p; sel = { taille: '', couleur: '', q: 1 };
  const im = imgs(p);
  const ch = (k, l, titre) => l && l.length ? '<div class="row"><span class="lab">' + titre + '</span><div class="opts">' +
    l.map(v => '<button class="opt" data-k="' + k + '" data-v="' + esc(v) + '">' + esc(v) + '</button>').join('') + '</div></div>' : '';
  openSheet(
    '<div class="gal" id="gal">' + (im.length ? im.map(u => '<img src="' + esc(u) + '" alt="">').join('') : '<div>🛍️</div>') + '</div>' +
    (im.length > 1 ? '<div class="dots" id="dots">' + im.map((_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div>' : '') +
    '<div class="body"><div class="head"><h2>' + esc(p.nom) + '</h2><span class="price">' + F(p.prix) + ' F</span></div>' +
    (p.description ? '<p class="desc">' + esc(p.description) + '</p>' : '') +
    ch('taille', p.tailles, 'Taille') + ch('couleur', p.couleurs, 'Couleur') +
    (p.stock > 0
      ? '<div class="buy"><div class="qty"><button data-q="-1">−</button><b id="qv">1</b><button data-q="1">+</button></div><button class="go" id="addBtn">Ajouter au panier</button></div>' +
        (p.stock <= 3 ? '<p class="few">Plus que ' + p.stock + ' en stock</p>' : '')
      : '<button class="go lt" disabled>Produit épuisé</button>') +
    '<p class="ref">Réf. ' + esc(p.code || '') + '</p></div>');
  const g = $('#gal'), d = $('#dots');
  if (g && d) g.onscroll = () => { const i = Math.round(g.scrollLeft / g.clientWidth); d.querySelectorAll('i').forEach((x, k) => x.classList.toggle('on', k === i)); };
  track('produit', p.id);
}
function need(k, msg) {
  const b = document.querySelector('[data-k="' + k + '"]'), r = b && b.closest('.row');
  if (r) { r.classList.add('need'); r.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => r.classList.remove('need'), 1800); }
  toast(msg);
}
function addToCart() {
  const p = cur; if (!p) return;
  if (p.tailles && p.tailles.length && !sel.taille) return need('taille', 'Choisis une taille 👆');
  if (p.couleurs && p.couleurs.length && !sel.couleur) return need('couleur', 'Choisis une couleur 👆');
  const ex = panier.find(i => i.id === p.id && i.taille === sel.taille && i.couleur === sel.couleur);
  const deja = panier.filter(i => i.id === p.id).reduce((a, i) => a + i.quantite, 0);
  if (deja + sel.q > p.stock) return toast('Stock disponible : ' + p.stock);
  if (ex) ex.quantite += sel.q;
  else panier.push({ id: p.id, nom: p.nom, prix: p.prix, image: imgs(p)[0] || '', code: p.code, taille: sel.taille, couleur: sel.couleur, quantite: sel.q });
  save(); renderBar(); track('panier', p.id); closeSheet(); toast('Ajouté au panier ✅');
}
function quartiers(ville) {
  const v = cfg.villes.find(x => x.ville === ville);
  return v && v.quartiers && v.quartiers.length ? '<select id="fQuartier"><option value="">Quartier</option>' + v.quartiers.map(q => '<option>' + esc(q) + '</option>').join('') + '</select>'
    : '<input id="fQuartier" name="quartier" type="text" autocomplete="address-level3" placeholder="Ton quartier">';
}
function openCart() {
  if (!panier.length) return openSheet('<div class="pad" style="text-align:center"><h2>Ton panier est vide 🛒</h2><p class="meta" style="margin:8px 0 14px">Choisis un produit, puis appuie sur « Ajouter au panier ».</p><button class="go" data-close>Voir les produits</button></div>');
  const t = panier.reduce((a, i) => a + i.quantite * i.prix, 0);
  const lieu = cfg.villes.length
    ? '<select id="fVille"><option value="">Ville</option>' + cfg.villes.map(v => '<option>' + esc(v.ville) + '</option>').join('') + '</select><div id="qBox" style="margin-top:8px">' + quartiers('') + '</div>'
    : '<input id="fVille" name="ville" type="text" autocomplete="address-level2" placeholder="Ta ville"><div id="qBox" style="margin-top:8px"><input id="fQuartier" name="quartier" type="text" autocomplete="address-level3" placeholder="Ton quartier"></div>';
  openSheet('<div class="pad"><h2>Mon panier</h2>' + panier.map((i, k) =>
    '<div class="line"><div class="th">' + (i.image ? '<img src="' + esc(i.image) + '">' : '🛍️') + '</div><div class="d"><b>' + esc(i.nom) + '</b><small>' +
    [i.taille, i.couleur].filter(Boolean).join(' / ') + ' × ' + i.quantite + '</small><b>' + F(i.prix * i.quantite) + ' F</b></div>' +
    '<button class="rm" data-rm="' + k + '">✕</button></div>').join('') +
    '<div class="tot"><span>Total</span><span>' + F(t) + ' F</span></div>' +
    (cfg.message_paiement ? '<div class="note">💳 ' + esc(cfg.message_paiement) + '</div>' : '') +
    '<div class="form"><label>Ton nom</label><input id="fNom" autocomplete="name" placeholder="Ex : Aïcha Koné">' +
    '<label>Ton numéro (WhatsApp)</label><input id="fTel" type="tel" inputmode="tel" autocomplete="tel" placeholder="0707070707"><div class="hint" id="hTel"></div>' +
    '<label>Où livrer ?</label>' + lieu + '</div>' +
    '<button class="go" id="sendBtn">Commander sur WhatsApp 💬</button><button class="linkbtn" id="privBtn">🔒 Comment sont utilisées mes informations ?</button></div>');
}
function telOk(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('00225')) d = d.slice(5); else if (d.startsWith('225') && d.length === 13) d = d.slice(3);
  if (d.length === 10 && ['01', '05', '07'].includes(d.slice(0, 2))) return true;
  return /^\s*\+/.test(t) && !/^\s*\+225/.test(t) && d.length >= 8 && d.length <= 15;
}
async function sendOrder() {
  const nom = $('#fNom').value.trim(), tel = $('#fTel').value.trim();
  const ville = $('#fVille').value.trim(), quartier = $('#fQuartier').value.trim();
  if (!nom || !tel || !ville || !quartier) return toast('Remplis ton nom, ton numéro, la ville et le quartier 📝');
  if (!telOk(tel)) { $('#hTel').textContent = 'Numéro invalide. Exemple : 0707070707'; return; }
  const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const r = await fetch('/api/commande', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, tel, ville, quartier, items: panier.map(i => ({ id: i.id, taille: i.taille, couleur: i.couleur, quantite: i.quantite })) })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.erreur || 'Erreur');
    let num = String(d.whatsapp || '').replace(/\D/g, ''); if (num.length === 10) num = '225' + num;
    panier = []; save(); renderBar();
    if (num) window.location.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(d.message);
    else { closeSheet(); alert('Commande enregistrée ✅ mais le numéro WhatsApp de la boutique n\'est pas configuré.'); }
  } catch (e) {
    alert(e.message || 'Erreur, réessaie');
    try { produits = await (await fetch('/api/produits')).json(); renderGrid(); } catch (x) {}
    /* RECONCILE_V1 : on retire du panier ce qui n'est plus disponible */
    try {
      panier = panier.filter(i => { const p = produits.find(x => x.id === i.id); return p && p.stock > 0; });
      panier.forEach(i => { const p = produits.find(x => x.id === i.id); if (i.quantite > p.stock) i.quantite = p.stock; });
      save(); renderBar();
      if (!panier.length) closeSheet(); else openCart();
    } catch (x) {}
    return;
    btn.disabled = false; btn.textContent = 'Commander sur WhatsApp 💬';
  }
}

document.addEventListener('click', e => {
  const t = e.target;
  if (t.id === 'sheet' || t.hasAttribute('data-close')) return closeSheet();
  if (t.closest('#cartBar') || t.closest('#cartIco')) return openCart();
  const ds = t.closest('.desc'); if (ds) { ds.classList.toggle('open'); return; }
  const c = t.closest('[data-c]'); if (c) { cat = c.dataset.c; renderCats(); renderGrid(); return; }
  const o = t.closest('[data-open]'); if (o) return openProduct(+o.dataset.open);
  if (t.dataset.k) { sel[t.dataset.k] = t.dataset.v; t.parentElement.querySelectorAll('.opt').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (t.dataset.q && cur) { sel.q = Math.max(1, Math.min(cur.stock, 99, sel.q + +t.dataset.q)); $('#qv').textContent = sel.q; return; }
  if (t.id === 'addBtn') return addToCart();
  if (t.dataset.rm !== undefined) { panier.splice(+t.dataset.rm, 1); save(); renderBar(); return panier.length ? openCart() : closeSheet(); }
  if (t.id === 'privBtn') return openPrivacy();
  if (t.id === 'avisOui') return donnerAvis(true);
  if (t.id === 'avisNon') return donnerAvis(false);
  if (t.id === 'guideBtn') return openGuide();
  if (t.id === 'sendBtn') return sendOrder();
});
document.addEventListener('change', e => {
  if (e.target.id === 'fVille') $('#qBox').innerHTML = quartiers(e.target.value);
});
$('#search').oninput = renderGrid; $('#sort').onchange = renderGrid;

/* ---- visites anonymes (rien de personnel) ---- */
let T = null;
(function () {
  try {
    if (localStorage.getItem('tk')) return;
    const rnd = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    let vid = localStorage.getItem('vid'); if (!vid) { vid = rnd(); localStorage.setItem('vid', vid); }
    let sid = sessionStorage.getItem('sid'); const neuf = !sid; if (!sid) { sid = rnd(); sessionStorage.setItem('sid', sid); }
    const send = o => { o.sid = sid; o.vid = vid; try { fetch('/api/stat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o), keepalive: true }).catch(() => {}); } catch (e) {} };
    T = send;
    let src = new URLSearchParams(location.search).get('src') || '';
    if (!src && document.referrer) { try { src = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch (e) {} }
    if (neuf) send({ ev: 'start', src: src || 'direct' });
    setInterval(() => { if (!document.hidden) send({ ev: 'ping' }); }, 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) send({ ev: 'ping' }); });
  } catch (e) {}
})();
function track(ev, pid) { if (T) T({ ev, pid }); }

load();

window.addEventListener('error', e => { try { toast('Erreur : ' + e.message); } catch (x) {} });
