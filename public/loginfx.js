/* LOGINFX_V1 */
(function () {
  var orig = window.fetch;
  function reduit() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function secouer() {
    var pw = document.getElementById('pw'); if (!pw) return;
    pw.classList.remove('lfx-shake'); void pw.offsetWidth; pw.classList.add('lfx-shake');
    setTimeout(function () { pw.classList.remove('lfx-shake'); }, 600);
  }
  function succes(n) {
    var box = document.querySelector('#login .box');
    if (!box) return Promise.resolve();
    var fx = document.createElement('div'); fx.className = 'lfx-ok';
    var d = document.createElement('div'); d.className = 'lfx-dots';
    for (var i = 0; i < Math.min(Math.max(n, 6), 12); i++) {
      var s = document.createElement('span'); s.style.animationDelay = (i * 40) + 'ms'; d.appendChild(s);
    }
    var b = document.createElement('div'); b.className = 'lfx-badge';
    b.innerHTML = '<svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="27"/><path d="M36 49l9 9 16-18"/></svg>';
    var t = document.createElement('div'); t.className = 'lfx-txt'; t.textContent = 'Mot de passe accepté';
    fx.appendChild(d); fx.appendChild(b); fx.appendChild(t);
    box.classList.add('lfx-done'); box.appendChild(fx);
    setTimeout(function () { box.classList.remove('lfx-done'); if (fx.parentNode) fx.parentNode.removeChild(fx); }, 2600);
    return new Promise(function (ok) { setTimeout(ok, reduit() ? 300 : 1700); });
  }
  window.fetch = function (u) {
    var url = typeof u === 'string' ? u : (u && u.url) || '';
    if (url.indexOf('/api/login') === -1) return orig.apply(this, arguments);
    var n = ((document.getElementById('pw') || {}).value || '').length;
    return orig.apply(this, arguments).then(function (res) {
      if (res.ok) return succes(n).then(function () { return res; });
      secouer(); return res;
    });
  };
  function monter() {
    var box = document.querySelector('#login .box');
    if (!box || box.getAttribute('data-fx')) return;
    box.setAttribute('data-fx', '1');
    var h1 = box.querySelector('h1'); if (h1) h1.textContent = 'Espace vendeuse';
    var logo = document.createElement('div'); logo.className = 'lfx-logo'; logo.textContent = 'B';
    var nm = document.createElement('div'); nm.className = 'lfx-name';
    box.insertBefore(logo, box.firstChild); box.insertBefore(nm, h1 || null);
    orig.call(window, '/api/config').then(function (r) { return r.json(); }).then(function (c) {
      var x = (c && c.nom_boutique) || '';
      if (x) { nm.textContent = x; logo.textContent = x.charAt(0).toUpperCase(); }
    }).catch(function () {});
    var pw = document.getElementById('pw');
    if (pw && pw.parentNode) {
      var w = document.createElement('div'); w.className = 'lfx-pw';
      pw.parentNode.insertBefore(w, pw); w.appendChild(pw);
      var e = document.createElement('button'); e.type = 'button'; e.className = 'lfx-eye'; e.textContent = 'Voir';
      e.setAttribute('aria-label', 'Afficher ou cacher le mot de passe');
      e.onclick = function () { var v = pw.type === 'password'; pw.type = v ? 'text' : 'password'; e.textContent = v ? 'Cacher' : 'Voir'; };
      w.appendChild(e);
    }
    var f = document.createElement('a'); f.className = 'lfx-forgot';
    f.href = 'https://wa.me/2250565961287?text=' + encodeURIComponent("Bonjour, j'ai oublié le mot de passe de mon espace vendeuse.");
    f.target = '_blank'; f.rel = 'noopener'; f.textContent = 'Mot de passe oublié ? Écris au développeur';
    box.appendChild(f);
  }
  if (document.readyState !== 'loading') monter(); else document.addEventListener('DOMContentLoaded', monter);
})();
