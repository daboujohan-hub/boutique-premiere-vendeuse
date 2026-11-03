# NANO-ANNN : LABORATOIRE D'APPRENTISSAGE DES MOTS
# Première expérience : lettres et combinaisons

alphabet = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

# Exemples d'apprentissage :
# Le programme reçoit des mots découpés en lettres.
exemples = [
    "MAMAN",
    "PAPA",
    "MALI",
    "SALUT"
]

print("=== NANO-ANNN : APPRENTISSAGE ===")

print("\n1. Alphabet connu :")
print(" ".join(alphabet))

# Le programme apprend les combinaisons de deux lettres
# présentes dans les exemples.
combinaisons = set()

for mot in exemples:
    for i in range(len(mot) - 1):
        combinaisons.add(mot[i:i+2])

print("\n2. Combinaisons apprises :")
print(" ".join(sorted(combinaisons)))

# Construction d'un mot à partir des combinaisons apprises.
def verifier_mot(mot):
    mot = mot.upper()

    if not all(lettre in alphabet for lettre in mot):
        return False

    for i in range(len(mot) - 1):
        if mot[i:i+2] not in combinaisons:
            return False

    return True

print("\n3. Test de nouveaux mots :")

for mot in ["MAMAN", "PAPA", "BONJOUR", "MAMALI"]:
    print(mot, "=>", "Combinaisons connues" if verifier_mot(mot)
          else "Combinaison nouvelle ou inconnue")

print("\nFin de la première expérience.")
