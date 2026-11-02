# GE SARL : conception du domaine

Ce document fixe le modèle métier avant d'écrire une ligne. Il est né d'un
dépôt existant, un CRM commercial conçu pour un revendeur informatique, dont on
garde la plomberie et dont on remplace le cœur.

## Le contexte

GE SARL est **agent général**, mandataire d'une ou de quelques compagnies. Ses
commerciaux prospectent des **particuliers et des entreprises**, sur quatre
familles de produits : automobile, santé et prévoyance, IARD entreprise, vie et
épargne et voyage. Le suivi des sinistres est hors du périmètre de cette
première version.

Deux besoins, dans cet ordre : centraliser la base de prospects avec leurs
coordonnées et suivre l'activité de prospection ; rattacher à chaque client le
ou les contrats d'assurance qui vont avec.

## La différence qui commande tout le reste

Dans le dépôt d'origine, une vente est un événement. Elle a lieu une fois, elle
produit un chiffre d'affaires, et elle est close.

**Un contrat d'assurance est une relation qui se renouvelle.** Il a une date
d'effet, une échéance, une prime souvent fractionnée, une tacite reconduction,
et il peut être résilié. Un commercial ne se juge donc pas à ce qu'il a apporté
ce mois-ci, mais au portefeuille qu'il tient et qu'il conserve.

Toute la conception découle de là, et notamment deux conséquences :

La commission d'un agent général **s'acquiert à l'encaissement de la quittance**,
pas à la signature. Un contrat signé dont la prime n'est jamais payée ne
rapporte rien. Le modèle sépare donc le contrat, qui est un engagement, de la
quittance, qui est un encaissement.

Les indicateurs ne sont pas ceux d'un vendeur. Portefeuille sous gestion, primes
émises, échéances des trente prochains jours, taux de renouvellement, taux de
déperdition, impayés. Le chiffre d'affaires du mois ne dit presque rien.

## Ce qui est repris du dépôt d'origine

Repris sans modification, et c'est la moitié du code :

- authentification, rôles, matrice de capacités modifiable en base, périmètre de
  données qui décide quel commercial voit quelle fiche ;
- import de fichiers avec mapping de colonnes, rapport de lignes et d'erreurs.
  Un portefeuille arrive toujours sous forme de tableur ;
- détection de doublons à la création d'une fiche. Capital ici : la même
  personne démarchée par deux commerciaux est un conflit, pas une donnée ;
- traductions, système de design, courbes, calendrier, feuilles de temps,
  objectifs commerciaux, notes.

Repris en changeant de sens :

- `Client` devient la fiche de prospection, et porte un statut de pipeline ;
- `Partenaire` devient la compagnie d'assurance ;
- le barème de commission par nature devient un barème par branche et par type
  d'affaire.

Retiré : les projets de livraison, la logique de commande Zoho avec son prix
d'achat renseigné par la direction, qui n'a pas de sens quand la commission est
connue dès la souscription.

## Le modèle

### La fiche

Un seul modèle pour le prospect et le client, et non deux tables. La même
personne traverse les deux états, et la scinder obligerait à recopier une fiche
au moment précis où l'on veut garder son historique. Le vocabulaire de
l'interface suit le statut : on dit prospect avant le premier contrat, client
après.

Ajouté au modèle existant :

```
typePersonne   PARTICULIER | ENTREPRISE
prenom         String?    // personne physique
dateNaissance  Date?      // sert aussi à la tarification en santé et en vie
profession     String?
statut         A_CONTACTER | CONTACTE | RENDEZ_VOUS | DEVIS_REMIS
               | EN_NEGOCIATION | CLIENT | PERDU | SANS_SUITE
motifPerte     String?    // obligatoire quand le statut passe à PERDU
origine        String?    // recommandation, terrain, appel entrant, campagne
prochaineRelanceLe  Date?
```

`prochaineRelanceLe` est le champ le plus utile de toute la fiche pour un
prospecteur : c'est lui qui alimente la liste du jour.

`motifPerte` est exigé au passage en PERDU. Une affaire perdue sans motif
n'apprend rien, et c'est précisément ce qu'on voudra analyser dans six mois.

Conservés tels quels : nom, adresse, ville, pays, téléphone, courriel,
propriétaire, accès nominatifs, notes, champs personnalisés libres.

### L'interaction

Le journal de prospection, distinct de la feuille de temps qui mesure du temps
passé. Ici on consigne ce qui a été dit.

```
ficheId, auteurNom, date
type     APPEL | VISITE | COURRIEL | RELANCE | DEVIS | AUTRE
compteRendu  String
prochaineAction  String?
relanceLe        Date?
```

Écrire une interaction met à jour `prochaineRelanceLe` sur la fiche. Deux
endroits pour la même date divergeraient, donc la fiche porte la prochaine
échéance et le journal porte l'histoire.

### La compagnie

Peu nombreuses pour un agent général. Nom, interlocuteur, coordonnées, notes,
et surtout son barème.

```
Compagnie
BaremeCommission : compagnieId, branche, typeAffaire, tauxPct
```

Le taux dépend de la branche et du fait qu'il s'agit d'une affaire nouvelle ou
d'un renouvellement, le second étant presque toujours moins rémunéré. Un taux
porté par le contrat lui-même reste possible et l'emporte sur le barème, pour
les cas négociés.

### Le contrat

```
numeroPolice   String     // unique par compagnie
ficheId, compagnieId, apporteurId
branche        AUTO | SANTE | PREVOYANCE | IARD | VIE | EPARGNE | VOYAGE
produit        String     // libellé libre, « Auto tous risques confort »
typeAffaire    NOUVELLE | RENOUVELLEMENT | REMPLACEMENT
dateEffet      Date
dateEcheance   Date
taciteReconduction  Boolean
primeAnnuelle  Decimal
fractionnement ANNUEL | SEMESTRIEL | TRIMESTRIEL | MENSUEL
tauxCommissionPct   Decimal?   // null : le barème de la compagnie s'applique
statut         EN_ATTENTE | EN_COURS | SUSPENDU | RESILIE | EXPIRE
dateResiliation Date?
motifResiliation String?
contratPrecedentId  String?    // chaîne de renouvellement
```

La branche est une liste fermée parce qu'elle commande le taux de commission ;
le produit reste du texte libre parce que son libellé varie d'une compagnie à
l'autre et qu'aucune nomenclature ne tiendra. C'est le même partage que pour
les activités dans le dépôt d'origine.

`contratPrecedentId` est ce qui rend le taux de renouvellement calculable. Sans
cette chaîne, un contrat renouvelé ressemble à un contrat neuf, et le
portefeuille paraît se reconstituer chaque année à partir de rien.

### La quittance

```
contratId, periodeDebut, periodeFin, montant, dateEcheance
statut         A_ENCAISSER | ENCAISSEE | IMPAYEE | ANNULEE
dateEncaissement  Date?
```

Les quittances se génèrent depuis le contrat et son fractionnement. Elles
portent l'échéancier, les impayés, et l'acquisition de la commission.

**La commission se calcule sur les quittances encaissées.** Le montant attendu
se lit sur les quittances à encaisser. C'est la même distinction que celle déjà
construite ailleurs entre une commission due et une commission versée.

## Les écrans

**Prospection** : la liste du jour, c'est-à-dire les fiches à relancer
aujourd'hui et en retard, puis le pipeline par étape avec le nombre de fiches et
la prime potentielle de chacune.

**Fiche** : coordonnées, journal des interactions, contrats en cours et passés,
quittances, documents.

**Portefeuille** : les contrats, filtrables par branche, compagnie, commercial,
échéance.

**Échéancier** : ce qui arrive à échéance dans trente, soixante, quatre-vingt-dix
jours, et ce qui est impayé. C'est l'écran de travail quotidien.

**Tableau de bord du commercial** : portefeuille sous gestion, primes émises sur
la période, commissions acquises et attendues, taux de renouvellement, pipeline.

**Direction** : les mêmes chiffres par commercial, par branche et par compagnie.

## L'ordre de construction

1. La fiche et son pipeline, avec l'import et la détection de doublons. Sans
   base de prospects, rien d'autre ne sert.
2. Le journal d'interactions et la liste de relance du jour.
3. Compagnies, barèmes, contrats.
4. Quittances, échéancier, commissions.
5. Tableaux de bord et classements.

Les étapes 1 et 2 suffisent déjà à remplacer un tableur, et c'est ce qui se
démontre le plus vite à l'utilisateur.

## Points à trancher plus tard

- Le fractionnement produit-il des quittances d'avance, ou se génèrent-elles au
  fil de l'eau ?
- Un avenant est-il un nouveau contrat ou une version du même ?
- Les documents attachés à une fiche, pièce d'identité, carte grise, conditions
  particulières : stockage sur disque du serveur, avec les limites de taille et
  de type que cela suppose.
- La reprise de l'existant : sous quelle forme le portefeuille actuel de GE SARL
  arrive-t-il ?
