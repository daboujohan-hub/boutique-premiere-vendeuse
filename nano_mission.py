import ast
import os
import re
import sys
from pathlib import Path

# Seul dossier autorisé pour cette expérience
RACINE = Path.home() / "ESPACE.DE.TRAVAIL" / "boutique-pro"
TAILLE_MAX = 300_000

DOSSIERS_INTERDITS = {
    ".git", ".venv", "venv", "__pycache__",
    "node_modules", "secrets", "credentials", "private"
}

MOTS_SENSIBLES = (
    "secret", "token", "password", "credential",
    "private", "id_rsa", "api_key"
)

LIGNE_SENSIBLE = re.compile(
    r"(?i)(api[_-]?key|access[_-]?token|password|"
    r"passwd|secret|private[_-]?key|-----BEGIN .*PRIVATE KEY-----)"
)

MOTS_VIDES = {
    "les", "des", "une", "dans", "pour", "avec",
    "qui", "que", "est", "sur", "par", "the", "and"
}


def nom_sensible(nom):
    nom = nom.lower()
    return any(mot in nom for mot in MOTS_SENSIBLES)


def analyser_source(source, termes):
    try:
        arbre = ast.parse(source)
    except SyntaxError as erreur:
        return False, [], 0, erreur.lineno

    definitions = []
    for element in arbre.body:
        if isinstance(element, (
            ast.FunctionDef,
            ast.AsyncFunctionDef,
            ast.ClassDef
        )):
            if not nom_sensible(element.name):
                definitions.append(element.name)

    pertinentes = 0
    for ligne in source.splitlines():
        # Ne jamais afficher ni analyser les lignes
        # qui ressemblent à des déclarations de secrets.
        if LIGNE_SENSIBLE.search(ligne):
            continue
        texte = ligne.lower()
        if any(terme in texte for terme in termes):
            pertinentes += 1

    return True, definitions, pertinentes, None


def trouver_fichiers():
    resultats = []
    ignores = 0

    for base, dossiers, fichiers in os.walk(
        RACINE, topdown=True, followlinks=False
    ):
        dossiers[:] = sorted([
            d for d in dossiers
            if not d.startswith(".")
            and d.lower() not in DOSSIERS_INTERDITS
            and not nom_sensible(d)
            and not (Path(base) / d).is_symlink()
        ])

        for nom in sorted(fichiers):
            chemin = Path(base) / nom

            if (
                chemin.suffix != ".py"
                or chemin.is_symlink()
                or nom_sensible(nom)
            ):
                ignores += 1
                continue

            try:
                if chemin.stat().st_size > TAILLE_MAX:
                    ignores += 1
                    continue
                source = chemin.read_text(
                    encoding="utf-8", errors="replace"
                )
            except OSError:
                ignores += 1
                continue

            resultats.append((chemin, source))

    return resultats, ignores


def test_interne():
    source = (
        "def saluer():\n"
        "    return 'bonjour'\n"
        "API_KEY = 'bonjour'\n"
    )
    ok, defs, hits, _ = analyser_source(source, ["bonjour"])
    assert ok and "saluer" in defs and hits == 1

    ok, _, _, ligne = analyser_source("def erreur(:\n", [])
    assert not ok and ligne is not None

    print("Auto-test réussi : syntaxe, détection, filtre sensible.")


def main():
    if "--test" in sys.argv:
        test_interne()
        return

    if not RACINE.is_dir() or RACINE.is_symlink():
        print("Dossier autorisé indisponible. Vérifie la configuration.")
        return

    mission = input(
        "Décris la mission, sans saisir de secret : "
    ).strip()

    termes = sorted(set(
        mot for mot in re.findall(
            r"[A-Za-zÀ-ÖØ-öø-ÿ_]{3,}", mission.lower()
        )
        if mot not in MOTS_VIDES
    ))

    if not termes:
        print("Mission trop générale. Précise les mots recherchés.")
        return

    fichiers, ignores = trouver_fichiers()
    rapport = []
    valides = 0
    erreurs = 0
    total_pertinent = 0

    for chemin, source in fichiers:
        ok, defs, hits, ligne = analyser_source(source, termes)

        if ok:
            valides += 1
        else:
            erreurs += 1

        total_pertinent += hits
        rapport.append((ok, defs, hits, ligne))

    print("\n=== RAPPORT NANO-ANNN ===")
    print("Mission reçue : oui (texte non journalisé)")
    print("Périmètre : dossier autorisé uniquement")
    print("Fichiers Python examinés :", len(fichiers))
    print("Syntaxes valides :", valides)
    print("Fichiers à vérifier :", erreurs)
    print("Lignes pertinentes trouvées :", total_pertinent)
    print("Fichiers ignorés ou inaccessibles :", ignores)

    for i, (ok, defs, hits, ligne) in enumerate(rapport, 1):
        statut = "syntaxe OK" if ok else (
            "syntaxe à vérifier, ligne " + str(ligne)
        )
        noms = ", ".join(defs[:5]) or "aucune définition"
        print(
            f"Module {i:02d} : {statut} ; "
            f"éléments={noms} ; correspondances={hits}"
        )

    print("\nLimite : les correspondances ne prouvent pas")
    print("que l'information est vraie ou que la mission est accomplie.")


if __name__ == "__main__":
    main()
