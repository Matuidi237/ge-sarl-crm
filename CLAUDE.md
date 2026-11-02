# Repères pour travailler sur ce dépôt

CRM d'assurance pour **GE SARL**, agent général : centraliser la base de
prospects, suivre l'activité de prospection des commerciaux, et rattacher à
chaque client les contrats d'assurance qui vont avec.

Clientèle de particuliers et d'entreprises. Quatre familles de produits :
automobile, santé et prévoyance, IARD entreprise, vie et épargne et voyage. Le
suivi des sinistres est hors périmètre de la première version.

## D'où vient ce dépôt, et ce que cela implique

Il descend d'un CRM commercial écrit pour un revendeur informatique. **On en
garde la plomberie, on en remplace le cœur.**

Gardé : authentification, rôles, matrice de capacités modifiable en base,
périmètre de données, import de fichiers avec mapping de colonnes, détection de
doublons, traductions, système de design, courbes, calendrier, feuilles de
temps, objectifs, notes.

À remplacer : tout ce qui touche aux ventes de matériel.

**Les règles de gestion encore présentes dans le code ne sont pas les nôtres.**
Le barème « 3 % matériel, 5 % service » de `backend/src/lib/commissions.ts`, le
prix d'achat renseigné par la direction dans `backend/src/lib/ventes.ts`, la
référence de commande Zoho : rien de tout cela ne s'applique à GE SARL. Ce sont
des vestiges à retirer, pas des principes à suivre. En assurance la commission
est connue dès la souscription et s'acquiert à l'encaissement de la quittance.

À retirer : les projets de livraison, la logique de commande Zoho, et les
campagnes ou newsletters si GE SARL n'en fait pas.

## La conception

**Lire `docs/CONCEPTION-ASSURANCE.md` avant de toucher au modèle.** Il fixe le
domaine, explique pourquoi chaque choix a été fait, et donne l'ordre de
construction.

Le point à retenir si l'on ne lit qu'une ligne : dans le dépôt d'origine une
vente est un événement, ici **un contrat est une relation qui se renouvelle**.
Les indicateurs ne sont donc pas le chiffre d'affaires et le classement, mais le
portefeuille sous gestion, les primes émises, les échéances à venir, le taux de
renouvellement et les impayés.

## Commandes

```bash
cd backend; npm run dev      # API, tsx watch
cd frontend; npm run dev     # interface, Vite
```

```bash
cd backend; npx tsc --noEmit    # vérification des types
cd frontend; npx tsc --noEmit
```

```bash
cd backend; npx prisma migrate dev --name <nom>   # développement
cd backend; npx prisma migrate deploy             # production
```

Il n'y a **aucun test automatisé**. La vérification se fait par le contrôle de
types des deux côtés, puis en ouvrant la page dans le navigateur. Ne pas
annoncer qu'une page fonctionne sans l'avoir regardée.

## Structure

- `backend/src/routes/` : une route par domaine, montée dans `index.ts` avec sa
  capacité requise.
- `backend/src/lib/` : les règles qui ne doivent exister qu'à un seul endroit.
- `frontend/src/api.ts` : tous les appels et tous les types partagés.
- `frontend/src/vues.ts` : la navigation par rôle.
- `frontend/src/i18n/fr.ts` et `en.ts` : le français est la référence, l'anglais
  est contraint à la parité par le type.
- `frontend/src/styles.css` : feuille unique, pas de CSS par composant.

## Règles à ne pas contourner

**La commission s'acquiert à l'encaissement de la quittance**, pas à la
signature du contrat. Un contrat signé dont la prime n'est jamais payée ne
rapporte rien. Le montant attendu se lit sur les quittances à encaisser.

**Une branche est une liste fermée, un produit est du texte libre.** La branche
commande le taux de commission, donc elle doit être sûre. Le libellé commercial
du produit varie d'une compagnie à l'autre et aucune nomenclature ne tiendra.

**Une affaire perdue exige son motif.** C'est ce qu'on voudra analyser dans six
mois, et un motif qu'on ne demande pas au moment de la perte ne se retrouve
jamais.

**Un contrat renouvelé garde le lien vers le précédent.** Sans cette chaîne, un
renouvellement ressemble à une affaire nouvelle, et le portefeuille paraît se
reconstituer chaque année à partir de rien.

**Les colonnes `@db.Date` tronquent sur UTC.** Y écrire un minuit local décale
la date d'un jour à Douala. Toujours passer par `jourCalendaire()`, à l'écriture
comme à la lecture.

## Conventions

**Les commentaires disent pourquoi, pas quoi.** Le code dit déjà ce qu'il fait.
Un commentaire utile explique une décision, un piège évité, une alternative
écartée. En français, comme le reste.

**Toute chaîne visible passe par l'i18n**, dans les deux fichiers. Les nombres,
montants, dates et rangs passent par les fonctions de `useLangue()` : un taux
de 6,5 écrit en interpolation directe s'affiche « 6.5 % » en français.

**Jamais de tiret cadratin dans les textes livrés**, ni dans l'interface, ni
dans les messages de commit, ni dans les réponses.

**Les commandes données à l'utilisateur sont en syntaxe PowerShell**, pas bash.

**Attention aux collisions de classes CSS.** La feuille est unique et longue.
Vérifier qu'un nom n'existe pas déjà avant de l'ajouter ; l'erreur a été commise
trois fois dans le dépôt d'origine, et une règle ajoutée pour une page en a
cassé une autre.

**Langage visuel des pages d'analyse** : un panneau, exactement un chiffre héros
par vue, des tuiles sans glose sous l'intitulé, des tableaux classés où la part
est peinte en fond de ligne. Classes `panneau`, `heros-*`, `mesure-*`,
`tuiles`, `rangs`, `segmente`. Pas de sous-titre explicatif sous un titre qui se
suffit à lui-même.

**Git** : commit et push sans demander. Messages en français, sans tiret
cadratin, expliquant la raison du changement.

## Sécurité et accès

Les capacités sont déclarées dans `backend/src/lib/permissions.ts` et la matrice
par rôle vit **en base**, modifiable par l'interface. Le périmètre de données
est une fonction à part, `perimetreClients`.

Une capacité se crée dès qu'une donnée a une sensibilité propre. En assurance,
la date de naissance, la profession et les pièces d'identité en relèvent.

Faille connue, héritée et non corrigée : `requireAuth` ne vérifie que la
signature du jeton. Un compte supprimé ou désactivé garde l'accès jusqu'à
expiration, douze heures.

## À faire avant toute chose

1. Démarquer : logo, titre, textes. Voir `docs/NOUVELLE-INSTANCE.md`.
2. Créer la base, le `.env` avec un `JWT_SECRET` neuf, le compte administrateur.
3. Retirer le jeu de démonstration hérité, qui porte des noms d'une autre
   entreprise, et les modules hors périmètre.
4. Puis attaquer la conception, dans l'ordre donné par
   `docs/CONCEPTION-ASSURANCE.md`.
