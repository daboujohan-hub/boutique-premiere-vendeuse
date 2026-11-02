"""store.py : toutes les données de la boutique, dans Firestore (Google).

Le serveur ne parle qu'à cette classe. Rien d'autre ne touche à la base.
Variables d'environnement (une des deux) :
  FIREBASE_KEY       = tout le contenu du fichier .json (sur Railway)
  FIREBASE_KEY_FILE  = chemin du fichier .json (en local)
"""
import os, json, time, copy, threading, datetime as dt
from google.cloud import firestore
from google.api_core import exceptions as gexc
try:
    from google.cloud.firestore_v1.base_query import FieldFilter
except Exception:  # anciennes versions
    FieldFilter = None

PRODUITS, COMMANDES, SESSIONS, EVENTS, AVIS, META = "produits", "commandes", "sessions", "evenements", "avis", "meta"
DEFAUTS = {"nom_boutique": "Ma Boutique", "whatsapp": "", "villes": [], "message_paiement": "",
           "site_url": "", "delai_reservation": "3", "couleur": "vert"}
FINI = ("annulée", "expirée")


class Refus(Exception):
    """Message à montrer à la cliente (stock insuffisant, etc.)."""


def maintenant():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def il_y_a(**kw):
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(**kw)).strftime("%Y-%m-%d %H:%M:%S")


def _epoch(s):
    return dt.datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc).timestamp()


def _w(q, champ, op, val):
    if FieldFilter is not None:
        return q.where(filter=FieldFilter(champ, op, val))
    return q.where(champ, op, val)


def _liste(v):
    if isinstance(v, list):
        return [str(x) for x in v]
    return [x.strip() for x in str(v or "").split(",") if x.strip()]


def _prod(d):
    p = dict(d)
    p["id"] = int(p.get("id", 0))
    p["nom"] = p.get("nom", "")
    p["categorie"] = p.get("categorie", "")
    p["prix"] = int(p.get("prix", 0))
    p["description"] = p.get("description", "")
    p["matiere"] = p.get("matiere", "")
    p["tailles"] = _liste(p.get("tailles"))
    p["couleurs"] = _liste(p.get("couleurs"))
    p["stock"] = int(p.get("stock", 0))
    p["actif"] = 1 if p.get("actif", 1) else 0
    p["demandes"] = int(p.get("demandes", 0))
    p["code"] = "P%03d" % p["id"]
    ims = list(p.get("images") or [])
    if not ims and p.get("image"):
        ims = [p["image"]]
    p["images"] = ims
    p["image"] = p.get("image", "") or (ims[0] if ims else "")
    return p


def make_client():
    cle = os.environ.get("FIREBASE_KEY", "").strip()
    fichier = os.environ.get("FIREBASE_KEY_FILE", "").strip()
    if cle:
        return firestore.Client.from_service_account_info(json.loads(cle))
    if fichier:
        return firestore.Client.from_service_account_json(fichier)
    raise SystemExit("Clé Firebase manquante. Définis FIREBASE_KEY_FILE=chemin/du/fichier.json "
                     "(ou FIREBASE_KEY avec le contenu du fichier).")


class Store:
    def __init__(self, client=None):
        self.db = client or make_client()
        self._lock = threading.RLock()
        self._cache = None
        self._cache_t = 0.0
        self._cfg = None
        self._cfg_t = 0.0
        self._sess = {}
        self._stats = None
        self._stats_t = 0.0
        self._exp_t = 0.0

    # ---------- outils ----------
    def _inval(self):
        with self._lock:
            self._cache = None

    def init(self):
        ref = self.db.collection(META).document("config")
        snap = ref.get()
        cur = snap.to_dict() if snap.exists else {}
        manque = {k: v for k, v in DEFAUTS.items() if k not in (cur or {})}
        if manque:
            ref.set(manque, merge=True)
        self._cfg = None

    # ---------- réglages ----------
    def config(self):
        with self._lock:
            if self._cfg is None or time.time() - self._cfg_t > 60:
                snap = self.db.collection(META).document("config").get()
                d = copy.deepcopy(DEFAUTS)
                d.update(snap.to_dict() or {})
                if not isinstance(d.get("villes"), list):
                    d["villes"] = []
                self._cfg, self._cfg_t = d, time.time()
            return copy.deepcopy(self._cfg)

    def config_set(self, maj):
        if maj:
            self.db.collection(META).document("config").set(maj, merge=True)
        with self._lock:
            self._cfg = None

    # ---------- produits ----------
    def produits(self, tous=False):
        with self._lock:
            if self._cache is None or time.time() - self._cache_t > 30:
                lst = [_prod(s.to_dict()) for s in self.db.collection(PRODUITS).stream()]
                lst.sort(key=lambda p: p["id"], reverse=True)
                self._cache, self._cache_t = lst, time.time()
            out = copy.deepcopy(self._cache)
        return out if tous else [p for p in out if p["actif"]]

    def produit(self, pid):
        s = self.db.collection(PRODUITS).document(str(int(pid))).get()
        return _prod(s.to_dict()) if s.exists else None

    def produit_enregistrer(self, pid, champs, images=None):
        """pid=None : création. images=None : on ne touche pas aux photos."""
        data = dict(champs)
        if images is not None:
            data["images"] = list(images)
            data["image"] = images[0] if images else ""
        if pid:
            try:
                self.db.collection(PRODUITS).document(str(int(pid))).update(data)
            except gexc.NotFound:
                pass
            self._inval()
            return int(pid)
        cpt = self.db.collection(META).document("compteurs")
        prods = self.db.collection(PRODUITS)

        @firestore.transactional
        def run(tx):
            n = int((cpt.get(transaction=tx).to_dict() or {}).get("produits", 0)) + 1
            d = dict(data)
            d.setdefault("image", "")
            d.setdefault("images", [])
            d["id"] = n
            d["demandes"] = 0
            tx.set(prods.document(str(n)), d)
            tx.set(cpt, {"produits": n}, merge=True)
            return n

        n = run(self.db.transaction())
        self._inval()
        return n

    def produit_supprimer(self, pid):
        ref = self.db.collection(PRODUITS).document(str(int(pid)))
        s = ref.get()
        if not s.exists:
            return None
        p = _prod(s.to_dict())
        ref.delete()
        self._inval()
        return p

    # ---------- commandes ----------
    def commande_creer(self, nom, tel, ville, quartier, voulu, besoin):
        """Tout ou rien : si un seul produit manque, RIEN n'est réservé.
        Le premier qui arrive gagne (transaction Firestore)."""
        prods = self.db.collection(PRODUITS)
        cmds = self.db.collection(COMMANDES)
        cpt = self.db.collection(META).document("compteurs")

        @firestore.transactional
        def run(tx):
            snaps = {pid: prods.document(str(pid)).get(transaction=tx) for pid in besoin}
            cid = int((cpt.get(transaction=tx).to_dict() or {}).get("commandes", 0)) + 1
            for pid, q in besoin.items():
                s = snaps[pid]
                d = s.to_dict() if s.exists else None
                if not d or not d.get("actif", 1):
                    raise Refus("Un produit n'est plus disponible.")
                st = int(d.get("stock", 0))
                if st < q:
                    if st > 0:
                        raise Refus(f"Désolé, il ne reste que {st} « {d.get('nom', '')} ». Change la quantité.")
                    raise Refus(f"Désolé, « {d.get('nom', '')} » vient d'être vendu.")
            lignes, total = [], 0
            for pid, q, taille, couleur in voulu:
                d = snaps[pid].to_dict()
                sous = int(d["prix"]) * q
                total += sous
                lignes.append({"id": pid, "code": "P%03d" % pid, "nom": d.get("nom", ""), "prix": int(d["prix"]),
                               "image": d.get("image", ""), "quantite": q, "taille": taille,
                               "couleur": couleur, "sous_total": sous})
            for pid, q in besoin.items():
                d = snaps[pid].to_dict()
                tx.update(prods.document(str(pid)), {"stock": int(d.get("stock", 0)) - q,
                                                     "demandes": int(d.get("demandes", 0)) + q})
            tx.set(cmds.document(str(cid)), {"id": cid, "date": maintenant(), "nom": nom[:80], "tel": tel[:30],
                                             "ville": ville[:60], "quartier": quartier[:80], "items": lignes,
                                             "total": total, "statut": "en attente"})
            tx.set(cpt, {"commandes": cid}, merge=True)
            return cid, lignes, total

        res = run(self.db.transaction())
        self._inval()
        return res

    def commandes_liste(self, limite=200):
        q = self.db.collection(COMMANDES).order_by("id", direction=firestore.Query.DESCENDING).limit(limite)
        return [s.to_dict() for s in q.stream()]

    def commande(self, cid):
        s = self.db.collection(COMMANDES).document(str(int(cid))).get()
        return s.to_dict() if s.exists else None

    def commande_supprimer(self, cid):
        self.db.collection(COMMANDES).document(str(int(cid))).delete()

    def en_attente(self):
        return len(list(_w(self.db.collection(COMMANDES), "statut", "==", "en attente").stream()))

    def changer_statut(self, cid, nouveau, seulement_attente=False):
        """Renvoie 'ok', 'absent', 'refus' ou 'deja'. Annuler/expirer rend le stock."""
        cref = self.db.collection(COMMANDES).document(str(int(cid)))
        prods = self.db.collection(PRODUITS)

        @firestore.transactional
        def run(tx):
            s = cref.get(transaction=tx)
            if not s.exists:
                return "absent"
            d = s.to_dict()
            cur = d.get("statut")
            if seulement_attente and cur != "en attente":
                return "deja"
            if cur in FINI and nouveau not in FINI:
                return "refus"
            rendre = {}
            if nouveau in FINI and cur not in FINI:
                for l in d.get("items", []):
                    k = int(l["id"])
                    rendre[k] = rendre.get(k, 0) + int(l.get("quantite", 0))
            snaps = {pid: prods.document(str(pid)).get(transaction=tx) for pid in rendre}
            for pid, q in rendre.items():
                if snaps[pid].exists:
                    p = snaps[pid].to_dict()
                    tx.update(prods.document(str(pid)), {"stock": int(p.get("stock", 0)) + q,
                                                         "demandes": max(0, int(p.get("demandes", 0)) - q)})
            tx.update(cref, {"statut": nouveau})
            return "ok"

        r = run(self.db.transaction())
        if r == "ok":
            self._inval()
        return r

    def expirer(self, heures, force=False):
        """Libère le stock des commandes 'en attente' trop vieilles (au plus 1 fois par minute)."""
        if heures <= 0:
            return
        if not force and time.time() - self._exp_t < 60:
            return
        self._exp_t = time.time()
        limite = il_y_a(minutes=int(heures * 60))
        q = _w(self.db.collection(COMMANDES), "statut", "==", "en attente")
        for s in q.stream():
            d = s.to_dict()
            if d.get("date", "") < limite:
                self.changer_statut(d["id"], "expirée", seulement_attente=True)

    # ---------- statistiques anonymes ----------
    def session_debut(self, sid, vid, src):
        try:
            self.db.collection(SESSIONS).document(sid).create(
                {"vid": vid, "debut": maintenant(), "secondes": 0, "source": src})
        except gexc.AlreadyExists:
            pass
        with self._lock:
            if len(self._sess) > 5000:
                self._sess.clear()
            self._sess.setdefault(sid, [time.time(), 0])

    def session_ping(self, sid):
        with self._lock:
            e = self._sess.get(sid)
        if e is None:
            s = self.db.collection(SESSIONS).document(sid).get()
            if not s.exists:
                return
            d = s.to_dict()
            e = [_epoch(d["debut"]), int(d.get("secondes", 0))]
            with self._lock:
                self._sess[sid] = e
        sec = int(time.time() - e[0])
        if sec - e[1] >= 30:
            self.db.collection(SESSIONS).document(sid).update({"secondes": sec})
            e[1] = sec

    def evenement(self, sid, type_, pid):
        self.db.collection(EVENTS).add({"sid": sid, "type": type_, "pid": pid, "ts": maintenant()})

    def avis(self, sid, ev):
        """Un seul avis par visite."""
        try:
            self.db.collection(AVIS).document(sid).create({"type": ev, "ts": maintenant()})
        except gexc.AlreadyExists:
            return
        self.db.collection(META).document("avis").set({ev: firestore.Increment(1)}, merge=True)

    def stats_brut(self):
        if self._stats is not None and time.time() - self._stats_t < 90:
            return self._stats
        depuis = il_y_a(days=30)
        sess = [s.to_dict() for s in _w(self.db.collection(SESSIONS), "debut", ">=", depuis).limit(5000).stream()]
        evs = [s.to_dict() for s in _w(self.db.collection(EVENTS), "ts", ">=", depuis).limit(10000).stream()]
        cmds = [s.to_dict() for s in _w(self.db.collection(COMMANDES), "date", ">=", depuis).limit(5000).stream()]
        a = self.db.collection(META).document("avis").get()
        a = a.to_dict() if a.exists else {}
        self._stats = {"sessions": sess, "evenements": evs, "commandes": cmds,
                       "avis": {"oui": int(a.get("avis_oui", 0)), "non": int(a.get("avis_non", 0))}}
        self._stats_t = time.time()
        return self._stats
