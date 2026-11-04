/* SPLASH_V1 */
(function () {
  try { if (sessionStorage.getItem('splash')) return; } catch (e) {}
  var m = document.querySelector('meta[name="theme-color"]');
  var d = document.createElement('div');
  d.id = 'splash';
  if (m && m.content) d.style.setProperty('--splash-bg', m.content);
  var t = document.createElement('div'); t.className = 'lg';
  var n = document.createElement('div'); n.className = 'nm';
  function nommer() {
    var nom = (document.title || 'Boutique').replace(/\s*[-\u2013|].*$/, '').trim() || 'Boutique';
    t.textContent = nom.charAt(0).toUpperCase(); n.textContent = nom;
    var mm = document.querySelector('meta[name="theme-color"]');
    if (mm && mm.content) d.style.setProperty('--splash-bg', mm.content);
  }
  nommer(); document.addEventListener('DOMContentLoaded', nommer);
  var r = document.createElement('div'); r.className = 'ring';
  var x = document.createElement('div'); x.className = 'tx'; x.textContent = 'Chargement\u2026';
  d.appendChild(t); d.appendChild(n); d.appendChild(r); d.appendChild(x);
  document.documentElement.appendChild(d);
  var debut = Date.now(), fini = false;
  function fermer() {
    if (fini) return; fini = true;
    var attente = Math.max(0, 900 - (Date.now() - debut));
    setTimeout(function () {
      d.className = 'off';
      try { sessionStorage.setItem('splash', '1'); } catch (e) {}
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 600);
    }, attente);
  }
  if (document.readyState === 'complete') fermer(); else window.addEventListener('load', fermer);
  setTimeout(fermer, 10000);
})();
