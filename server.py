#!/usr/bin/env python3
import json, os, secrets, base64, hmac, time, re, mimetypes, traceback
import datetime as _dt
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(BASE, "public")
UPLOADS = os.environ.get("UPLOADS_DIR") or os.path.join(BASE, "uploads")
PORT = int(os.environ.get("PORT", "8080"))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "changeme")
TOKENS = {}
STORE = None
os.makedirs(UPLOADS, exist_ok=True)
os.makedirs(PUBLIC, exist_ok=True)
mimetypes.add_type("application/manifest+json", ".webmanifest")

from store import Store, Refus, il_y_a


def split(s):
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def save_image(data_url):
    m = re.match(r"data:image/(jpeg|png|webp);base64,(.+)$", data_url, re.S)
    if not m:
        raise ValueError("image invalide")
    ext = {"jpeg": ".jpg", "png": ".png", "webp": ".webp"}[m.group(1)]
    raw = base64.b64decode(m.group(2))
    if len(raw) > 4_000_000:
        raise ValueError("image trop lourde")
    name = secrets.token_hex(8) + ext
    with open(os.path.join(UPLOADS, name), "wb") as f:
        f.write(raw)
    return "/uploads/" + name


def nettoyer_images(urls):
    """Efface du disque les photos qui ne servent plus."""
    if not urls:
        return
    utilisees = set()
    for p in STORE.produits(tous=True):
        utilisees.update(p.get("images") or [])
        if p.get("image"):
            utilisees.add(p["image"])
    for u in set(urls):
        m = re.match(r"^/uploads/([0-9a-f]{16}\.(?:jpg|png|webp))$", str(u))
        if not m or u in utilisees:
            continue
        try:
            os.remove(os.path.join(UPLOADS, m.group(1)))
        except Exception:
            pass


def fmt(n):
    return f"{n:,}".replace(",", " ")


HITS = {}
TRUST_PROXY = os.environ.get("TRUST_PROXY") == "1"


def hits(key, window):
    now = time.time()
    l = [t for t in HITS.get(key, []) if now - t < window]
    HITS[key] = l
    return l


def add_hit(key):
    HITS.setdefault(key, []).append(time.time())


AIDE_WHATSAPP = "2250565961287"


def clean_text(s, maxlen=120):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:maxlen]


def cap_first(s):
    return s[:1].upper() + s[1:] if s else s


def normalise_tel(t):
    """Numero ivoirien : 10 chiffres commencant par 01, 05 ou 07. Etranger : commence par +."""
    brut = str(t or "").strip()
    d = re.sub(r"\D", "", brut)
    if d.startswith("00225"):
        d = d[5:]
    elif d.startswith("225") and len(d) == 13:
        d = d[3:]
    if len(d) == 10 and d[:2] in ("01", "05", "07"):
        return d, None
    if brut.startswith("+") and not brut.startswith("+225") and 8 <= len(d) <= 15:
        return "+" + d, None
    return None, "Numéro invalide. Exemple : 0707070707"


def bizarre(t):
    """Vrai si un mot ressemble a des lettres tapees au hasard."""
    for w in re.findall(r"[a-zà-ÿ]+", str(t).lower()):
        if re.search(r"(.)\1\1", w):
            return True
        if len(w) >= 4 and not re.search(r"[aeiouyàâäéèêëîïôöùûü]", w):
            return True
    return False


def calc_stats(aide=""):
    brut = STORE.stats_brut()
    sess, evs, cmds = brut["sessions"], brut["evenements"], brut["commandes"]
    today = _dt.datetime.now(_dt.timezone.utc).date()
    jour_s = today.isoformat()
    sem_s = il_y_a(days=7)
    uniq = lambda l: len({s.get("vid") for s in l})
    jour = uniq([s for s in sess if s["debut"][:10] == jour_s])
    sem_l = [s for s in sess if s["debut"] >= sem_s]
    sem = uniq(sem_l)
    mois = uniq(sess)
    nb = len(sess)
    moy = (sum(int(s.get("secondes", 0)) for s in sess) / nb) if nb else 0
    restes = sum(1 for s in sess if int(s.get("secondes", 0)) >= 30)
    par_jour = {}
    for s in sem_l:
        par_jour.setdefault(s["debut"][:10], set()).add(s.get("vid"))
    jours = []
    for i in range(6, -1, -1):
        d = today - _dt.timedelta(days=i)
        jours.append({"date": d.isoformat(), "n": len(par_jour.get(d.isoformat(), ()))})
    prods = STORE.produits(tous=True)
    parp = {p["id"]: p for p in prods}
    cnt = {}
    for e in evs:
        pid = e.get("pid")
        if e.get("type") in ("produit", "panier") and pid in parp:
            c = cnt.setdefault(pid, [0, 0])
            c[0 if e["type"] == "produit" else 1] += 1
    top = []
    for pid, (v, pa) in sorted(cnt.items(), key=lambda kv: (-kv[1][0], -kv[1][1]))[:5]:
        p = parp[pid]
        top.append({"id": pid, "nom": p["nom"], "image": p["image"], "vues": v, "paniers": pa,
                    "code": "P%03d" % pid})
    src = {}
    for s in sess:
        k = s.get("source") or "direct"
        src[k] = src.get(k, 0) + 1
    sources = [{"source": k, "n": n} for k, n in sorted(src.items(), key=lambda kv: -kv[1])[:6]]
    ok = [c for c in cmds if c.get("statut") not in ("annulée", "expirée")]
    cmd = len(ok)
    ca = sum(int(c.get("total", 0)) for c in ok)
    attente = STORE.en_attente()

    cfg = STORE.config()
    al = []

    def add(niveau, texte, va=""):
        al.append({"niveau": niveau, "texte": texte, "va": va})

    if not cfg.get("whatsapp"):
        add("bad", "Ton numéro WhatsApp n'est pas enregistré : tu ne recevras aucune commande.", "cfg")
    elif normalise_tel(cfg.get("whatsapp"))[1]:
        add("bad", "Ton numéro WhatsApp semble faux : les clientes ne pourront pas te joindre.", "cfg")
    nom = cfg.get("nom_boutique", "")
    if nom in ("", "Ma Boutique"):
        add("warn", "Donne un vrai nom à ta boutique.", "cfg")
    elif bizarre(nom):
        add("warn", f"Le nom de la boutique « {nom} » semble mal écrit.", "cfg")
    if not cfg.get("villes"):
        add("warn", "Aucune ville de livraison enregistrée : les clientes devront l'écrire elles-mêmes.", "cfg")
    actifs = sorted([p for p in prods if p["actif"]], key=lambda p: p["id"])
    if not actifs:
        add("warn", "Aucun produit visible : ta boutique est vide.", "prod")
    for r in actifs:
        n = r["nom"]
        if r["prix"] < 500 or r["prix"] > 1000000:
            add("bad", f"« {n} » est à {fmt(r['prix'])} F. Est-ce une erreur de prix ?", "prod")
        if not r["image"]:
            add("warn", f"« {n} » n'a pas de photo.", "prod")
        if bizarre(n):
            add("warn", f"Le nom « {n} » semble mal écrit.", "prod")
        if r["stock"] <= 0:
            add("warn", f"« {n} » est épuisé : la boutique l'affiche « Épuisé ».", "prod")
    if attente:
        add("warn", f"{attente} commande(s) attendent ta confirmation.", "cmd")
    ordre = {"bad": 0, "warn": 1, "ok": 2}
    al.sort(key=lambda a: ordre[a["niveau"]])
    al = al[:12]
    if not al:
        add("ok", "Tout est en ordre. Bravo ! ✅")
    return {"visiteurs": {"jour": jour, "semaine": sem, "mois": mois}, "sessions": nb,
            "duree_moy": round(moy), "restes": restes, "jours": jours, "top": top,
            "sources": sources, "commandes": cmd, "ca": ca, "alertes": al,
            "aide": aide, "nom": nom, "avis": brut["avis"]}


def expirer():
    try:
        h = float(STORE.config().get("delai_reservation") or 0)
    except Exception:
        h = 0
    STORE.expirer(h)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def ip(self):
        if TRUST_PROXY:
            return self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        return self.client_address[0]

    def send_json(self, data, code=200):
        b = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def body(self):
        n = int(self.headers.get("Content-Length", 0))
        if n > 8_000_000:
            raise ValueError("trop gros")
        return json.loads(self.rfile.read(n) or b"{}")

    def is_admin(self):
        exp = TOKENS.get(self.headers.get("X-Token", ""))
        return bool(exp and exp > time.time())

    def panne(self):
        traceback.print_exc()
        try:
            self.send_json({"erreur": "Petit problème temporaire. Réessaie dans un instant."}, 500)
        except Exception:
            pass

    # ---------- GET ----------
    def do_GET(self):
        try:
            self._get()
        except Exception:
            self.panne()

    def _get(self):
        p = urlparse(self.path).path
        if p == "/healthz":
            return self.send_json({"ok": True})
        if p.startswith("/api/"):
            expirer()
            if p == "/api/config":
                return self.send_json(STORE.config())
            if p == "/api/produits":
                return self.send_json(STORE.produits())
            if p == "/api/admin/produits":
                if not self.is_admin():
                    return self.send_json({"erreur": "non autorisé"}, 401)
                return self.send_json(STORE.produits(tous=True))
            if p == "/api/admin/stats":
                if not self.is_admin():
                    return self.send_json({"erreur": "non autorisé"}, 401)
                return self.send_json(calc_stats(AIDE_WHATSAPP))
            if p == "/api/admin/commandes":
                if not self.is_admin():
                    return self.send_json({"erreur": "non autorisé"}, 401)
                return self.send_json(STORE.commandes_liste(200))
        return self.static(p)

    def static(self, p):
        if p in ("/", ""):
            p = "/index.html"
        if p == "/admin":
            p = "/admin.html"
        root = UPLOADS if p.startswith("/uploads/") else PUBLIC
        rel = p[len("/uploads/"):] if root == UPLOADS else p.lstrip("/")
        full = os.path.realpath(os.path.join(root, rel))
        if not full.startswith(os.path.realpath(root) + os.sep) or not os.path.isfile(full):
            self.send_response(404)
            self.end_headers()
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if root == PUBLIC:
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    # ---------- POST ----------
    def do_POST(self):
        try:
            self._post()
        except ValueError as e:
            self.send_json({"erreur": str(e)}, 400)
        except Exception:
            self.panne()

    def _post(self):
        p = urlparse(self.path).path
        try:
            data = self.body()
        except Exception:
            return self.send_json({"erreur": "requête invalide"}, 400)

        if p == "/api/login":
            ip = self.ip()
            if len(hits("l:" + ip, 600)) >= 5:
                return self.send_json({"erreur": "Trop d'essais. Réessaie dans 10 minutes."}, 429)
            if hmac.compare_digest(str(data.get("password", "")), ADMIN_PASSWORD):
                HITS.pop("l:" + ip, None)
                t = secrets.token_hex(24)
                TOKENS[t] = time.time() + 12 * 3600
                return self.send_json({"token": t})
            add_hit("l:" + ip)
            time.sleep(0.7)
            return self.send_json({"erreur": "mot de passe incorrect"}, 401)

        if p == "/api/stat":
            sid = clean_text(data.get("sid"), 40)
            vid = clean_text(data.get("vid"), 40)
            ev = data.get("ev")
            ip = self.ip()
            if sid and vid and len(hits("s:" + ip, 60)) < 60:
                add_hit("s:" + ip)
                try:
                    if ev == "start":
                        STORE.session_debut(sid, vid, clean_text(data.get("src"), 30) or "direct")
                    elif ev == "ping":
                        STORE.session_ping(sid)
                    elif ev in ("avis_oui", "avis_non"):
                        STORE.avis(sid, ev)
                    elif ev in ("produit", "panier"):
                        try:
                            pid = int(data.get("pid"))
                        except Exception:
                            pid = 0
                        if pid:
                            STORE.evenement(sid, ev, pid)
                except Exception:
                    traceback.print_exc()
            return self.send_json({"ok": True})

        if p == "/api/commande":
            return self.commande(data)

        if not self.is_admin():
            return self.send_json({"erreur": "non autorisé"}, 401)

        if p == "/api/admin/produit":
            nom = cap_first(clean_text(data.get("nom"), 60))
            if len(nom) < 2:
                return self.send_json({"erreur": "Écris le nom du produit."}, 400)
            try:
                prix = int(float(str(data.get("prix")).replace(" ", "")))
            except Exception:
                return self.send_json({"erreur": "Prix invalide. Écris seulement des chiffres. Exemple : 11000"}, 400)
            if prix <= 0:
                return self.send_json({"erreur": "Le prix doit être plus grand que 0."}, 400)
            try:
                stock = max(0, int(data.get("stock", 1) or 0))
            except Exception:
                return self.send_json({"erreur": "Stock invalide. Écris un nombre."}, 400)
            if not data.get("confirme"):
                if prix < 500:
                    return self.send_json({"erreur": "Le prix est " + fmt(prix) + " F. C'est très bas : voulais-tu écrire " + fmt(prix * 1000) + " F ? Une erreur peut te faire perdre de l'argent.", "confirmer": True}, 409)
                if prix > 1000000:
                    return self.send_json({"erreur": "Le prix est " + fmt(prix) + " F. C'est très élevé : est-ce correct ?", "confirmer": True}, 409)
                if bizarre(nom):
                    return self.send_json({"erreur": "Le nom « " + nom + " » semble mal écrit. Est-ce correct ?", "confirmer": True}, 409)
            champs = {
                "nom": nom, "categorie": cap_first(clean_text(data.get("categorie"), 40)), "prix": prix,
                "description": str(data.get("description", "")).strip()[:600],
                "matiere": clean_text(data.get("matiere"), 60),
                "tailles": split(data.get("tailles", "")),
                "couleurs": split(data.get("couleurs", "")),
                "stock": stock,
                "actif": 1 if data.get("actif", 1) else 0,
            }
            imgs_in = data.get("images")
            if imgs_in is None and data.get("image"):
                imgs_in = [data.get("image")]
            try:
                pid = int(data.get("id")) if data.get("id") else None
            except Exception:
                pid = None
            final = None
            anciennes = []
            if isinstance(imgs_in, list):
                if pid:
                    r0 = STORE.produit(pid)
                    if r0:
                        anciennes = list(r0.get("images") or [])
                        if r0.get("image"):
                            anciennes.append(r0["image"])
                final = []
                for u in imgs_in[:5]:
                    u = str(u)
                    if u.startswith("data:"):
                        final.append(save_image(u))
                    elif u in anciennes and u not in final:
                        final.append(u)
            STORE.produit_enregistrer(pid, champs, final)
            if final is not None:
                nettoyer_images([u for u in anciennes if u not in final])
            return self.send_json({"ok": True})

        if p == "/api/admin/config":
            maj = {}
            if "nom_boutique" in data:
                nb = cap_first(clean_text(data["nom_boutique"], 60))
                if len(nb) < 2:
                    return self.send_json({"erreur": "Donne un nom à ta boutique."}, 400)
                maj["nom_boutique"] = nb
            if "whatsapp" in data:
                num, err = normalise_tel(data["whatsapp"])
                if err:
                    return self.send_json({"erreur": err}, 400)
                maj["whatsapp"] = num
            if "couleur" in data:
                cl = clean_text(data["couleur"], 12).lower()
                if cl not in ("vert", "orange", "rose", "bleu", "violet", "noir"):
                    return self.send_json({"erreur": "Couleur invalide."}, 400)
                maj["couleur"] = cl
            if "message_paiement" in data:
                maj["message_paiement"] = clean_text(data["message_paiement"], 200)
            if "site_url" in data:
                u = clean_text(data["site_url"], 120).rstrip("/")
                if u and not re.match(r"^https?://[^\s/]+\.[^\s/]+", u):
                    return self.send_json({"erreur": "Adresse invalide. Exemple : https://maboutique.ci"}, 400)
                maj["site_url"] = u
            if "delai_reservation" in data:
                try:
                    h = float(str(data["delai_reservation"]).replace(",", "."))
                    if not 0 <= h <= 72:
                        raise ValueError
                except Exception:
                    return self.send_json({"erreur": "Durée de réservation invalide (0 à 72 heures)."}, 400)
                maj["delai_reservation"] = "%g" % h
            if "villes" in data:
                vv = []
                for x in (data["villes"] if isinstance(data["villes"], list) else []):
                    if not isinstance(x, dict):
                        continue
                    vn = cap_first(clean_text(x.get("ville"), 40))
                    if not vn:
                        continue
                    qs = [cap_first(clean_text(q, 40)) for q in (x.get("quartiers") or []) if clean_text(q, 40)]
                    vv.append({"ville": vn, "quartiers": qs[:40]})
                maj["villes"] = vv
            STORE.config_set(maj)
            return self.send_json({"ok": True})

        m = re.match(r"^/api/admin/commande/(\d+)/statut$", p)
        if m:
            s = str(data.get("statut", ""))
            if s not in ("en attente", "confirmée", "livrée", "annulée"):
                return self.send_json({"erreur": "statut invalide"}, 400)
            r = STORE.changer_statut(int(m.group(1)), s)
            if r == "absent":
                return self.send_json({"erreur": "introuvable"}, 404)
            if r == "refus":
                return self.send_json({"erreur": "Commande annulée ou expirée : le client doit recommander"}, 400)
            return self.send_json({"ok": True})

        self.send_json({"erreur": "introuvable"}, 404)

    def commande(self, data):
        nom = str(data.get("nom", "")).strip()
        tel = str(data.get("tel", "")).strip()
        ville = str(data.get("ville", "")).strip()
        quartier = str(data.get("quartier", "")).strip()
        if not (nom and tel and ville and quartier):
            return self.send_json({"erreur": "Remplis nom, téléphone, ville et quartier"}, 400)
        voulu, besoin = [], {}
        for it in data.get("items", [])[:50]:
            try:
                pid = int(it.get("id"))
                q = max(1, min(99, int(it.get("quantite", 1))))
            except Exception:
                continue
            voulu.append((pid, q, str(it.get("taille", ""))[:20], str(it.get("couleur", ""))[:30]))
            besoin[pid] = besoin.get(pid, 0) + q
        if not voulu:
            return self.send_json({"erreur": "Panier vide"}, 400)
        digits, _err = normalise_tel(tel)
        if _err:
            return self.send_json({"erreur": "Numéro de téléphone invalide. Exemple : 0707070707"}, 400)
        tel = digits
        ip = self.ip()
        k1, k2 = "o:" + ip, "t:" + digits
        if len(hits(k1, 3600)) >= 5 or len(hits(k2, 3600)) >= 5:
            return self.send_json({"erreur": "Trop de commandes pour le moment. Réessaie un peu plus tard."}, 429)
        add_hit(k1)
        add_hit(k2)
        expirer()
        try:
            cid, lignes, total = STORE.commande_creer(nom, tel, ville, quartier, voulu, besoin)
        except Refus as e:
            return self.send_json({"erreur": str(e), "refresh": True}, 409)
        cfg = STORE.config()
        base = (cfg.get("site_url") or "").strip().rstrip("/")
        if not base:
            proto = self.headers.get("X-Forwarded-Proto", "http") if TRUST_PROXY else "http"
            base = proto + "://" + self.headers.get("Host", "localhost")
        msg = f"🛍️ *NOUVELLE COMMANDE #{cid}*\n\n"
        for l in lignes:
            msg += f"• *{l['nom']}* (réf. {l['code']})\n"
            msg += f"  Taille: {l['taille'] or '-'} | Couleur: {l['couleur'] or '-'}\n"
            msg += f"  {l['quantite']} x {fmt(l['prix'])} F = {fmt(l['sous_total'])} F\n"
            if l.get("image"):
                msg += f"  📷 {base}{l['image']}\n"
            msg += f"  🔗 {base}/?p={l['id']}\n\n"
        msg += f"💰 *Total produits: {fmt(total)} F*\n(transport à ajouter selon la zone)\n\n"
        msg += f"👤 {nom}\n📞 {tel}\n📍 {ville} - {quartier}"
        return self.send_json({"ok": True, "id": cid, "total": total,
                               "whatsapp": cfg.get("whatsapp", ""), "message": msg})

    # ---------- DELETE ----------
    def do_DELETE(self):
        try:
            self._delete()
        except Exception:
            self.panne()

    def _delete(self):
        if not self.is_admin():
            return self.send_json({"erreur": "non autorisé"}, 401)
        path = urlparse(self.path).path
        mc = re.match(r"^/api/admin/commande/(?P<cid>\d+)$", path)
        if mc:
            r = STORE.commande(int(mc.group("cid")))
            if not r:
                return self.send_json({"erreur": "Commande introuvable"}, 404)
            if r.get("statut") in ("en attente", "confirmée"):
                return self.send_json({"erreur": "Annule d'abord cette commande (le produit revient en stock), puis efface-la."}, 400)
            STORE.commande_supprimer(int(mc.group("cid")))
            return self.send_json({"ok": True})
        m = re.match(r"^/api/admin/produit/(\d+)$", path)
        if not m:
            return self.send_json({"erreur": "introuvable"}, 404)
        p = STORE.produit_supprimer(int(m.group(1)))
        if p:
            vieux = list(p.get("images") or [])
            if p.get("image"):
                vieux.append(p["image"])
            nettoyer_images(vieux)
        self.send_json({"ok": True})


if __name__ == "__main__":
    STORE = Store()
    STORE.init()
    if ADMIN_PASSWORD == "changeme":
        print("⚠️  Mot de passe par défaut. Lance avec : ADMIN_PASSWORD='ton_mot_de_passe' python server.py")
    print(f"Boutique sur http://localhost:{PORT}   |   Admin : http://localhost:{PORT}/admin")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
