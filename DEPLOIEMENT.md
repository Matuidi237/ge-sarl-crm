# Déploiement sur le VPS

Même VPS et même schéma que le site EasyTech et le CRM EasyTech : Ubuntu, Docker, Nginx Proxy Manager, réseau Docker partagé **`webproxy`**, code dans `/opt`.

## En bref

```bash
# Première fois
cd /opt && git clone https://github.com/Matuidi237/ge-sarl-crm.git && cd ge-sarl-crm
./scripts/installer.sh          # secrets, images, démarrage : tout en une commande

# Mises à jour suivantes
cd /opt/ge-sarl-crm && ./scripts/deployer.sh
```

Le reste de ce document détaille chaque étape.

## Ce qui tourne

Trois conteneurs, **aucun port publié sur l'hôte** :

| Conteneur | Rôle | Joignable depuis |
|---|---|---|
| `ge-crm-db` | PostgreSQL 16, volume `ge_crm_pgdata` | réseau interne uniquement |
| `ge-crm-backend` | API Node/Express, applique les migrations au démarrage | réseau interne uniquement |
| `ge-crm-web` | nginx : sert l'application et relaie `/api` vers le backend | réseau du proxy |

Les noms sont préfixés `ge-crm` pour cohabiter avec le CRM EasyTech, dont les conteneurs s'appellent `crm-db`, `crm-backend` et `crm-web`. Chaque CRM garde sa propre base.

L'application et l'API partagent la même origine : ni CORS à configurer, ni adresse de serveur à figer dans le build.

---

## 0. Avant de commencer : le nom de domaine

Choisir l'adresse du CRM (par exemple `crm.gesarl.cm`) et créer chez le gestionnaire du domaine un enregistrement **A** qui pointe vers l'adresse IP du VPS. Le certificat SSL de l'étape 2 ne peut être délivré qu'une fois ce pointage actif.

---

## 1. Première installation

Se connecter au VPS depuis PowerShell :

```powershell
ssh ubuntu@ADRESSE_IP_DU_VPS
```

Puis, sur le VPS :

```bash
cd /opt
sudo git clone https://github.com/Matuidi237/ge-sarl-crm.git
sudo chown -R $USER:$USER ge-sarl-crm
cd ge-sarl-crm
chmod +x scripts/*.sh
./scripts/installer.sh
```

Le script vérifie que Docker et le réseau `webproxy` sont présents, demande le mot de passe du premier administrateur, puis :

- génère `POSTGRES_PASSWORD` et `JWT_SECRET` avec `openssl` ;
- écrit le `.env` en permissions `600` ;
- chiffre le mot de passe administrateur ;
- construit les images et démarre ;
- attend que l'API réponde, sinon affiche les journaux.

Il refuse de s'exécuter si un `.env` existe déjà : régénérer les secrets déconnecterait tout le monde et rendrait le compte administrateur inutilisable.

Le compte administrateur n'est créé qu'au premier démarrage, si la table des utilisateurs est vide. Les comptes de la directrice et des commerciaux se créent ensuite depuis la page **Utilisateurs**.

---

## 2. Configurer Nginx Proxy Manager

Dans l'interface, **Proxy Hosts → Add Proxy Host**.

Onglet **Details** :

| Champ | Valeur |
|---|---|
| Domain Names | le domaine choisi à l'étape 0 |
| Scheme | `http` |
| Forward Hostname / IP | `ge-crm-web` |
| Forward Port | `80` |
| Cache Assets | **désactivé** (nginx gère déjà le cache ; sinon un `index.html` périmé serait servi après une mise à jour) |
| Block Common Exploits | activé |

Onglet **SSL** : *Request a new SSL Certificate*, puis *Force SSL* et *HTTP/2 Support*.

Onglet **Advanced** :

```nginx
client_max_body_size 30m;
```

Sans cette ligne, l'import d'un fichier de prospects volumineux échoue en erreur `413` avant d'atteindre l'application.

---

## 3. Vérifier

```bash
docker compose ps        # trois conteneurs « running », db et backend « healthy »
```

Puis, dans un navigateur, ouvrir le domaine : la page de connexion GE SARL doit s'afficher et le compte `admin` fonctionner. Changer le mot de passe depuis **Mon profil** dès la première connexion.

---

## 4. Données de démonstration (facultatif)

Pour présenter l'outil avant la saisie des vraies données, le jeu de démonstration crée la directrice, cinq commerciaux, des clients, des contrats et trois semaines de rapports. Tous les comptes ont le mot de passe `DemoGE2026!` (identifiants `demo-directrice`, `demo-armelle`, `demo-cedric`, `demo-ines`, `demo-boris`, `demo-sandrine`).

```bash
docker compose exec backend node scripts/demo-assurance.mjs              # charger
docker compose exec backend node scripts/demo-assurance.mjs --etat       # compter
docker compose exec backend node scripts/demo-assurance.mjs --supprimer  # retirer
```

**À retirer avant la mise en service réelle** : ces comptes ont un mot de passe connu de tous ceux qui lisent ce dépôt. La suppression n'emporte que ce qu'elle a créé.

---

## 5. Mettre à jour

Après chaque `git push` depuis le poste de développement :

```bash
cd /opt/ge-sarl-crm
./scripts/deployer.sh
```

Le script sauvegarde la base **avant** toute modification, récupère le code, affiche les commits appliqués, reconstruit, redémarre et vérifie que l'API répond. Les dix dernières sauvegardes restent dans `sauvegardes/`. Les migrations de base de données s'appliquent seules au démarrage du backend.

En cas de doute sur les images :

```bash
docker compose build --no-cache && docker compose up -d
```

---

## 6. Sauvegardes

Les données vivent dans le volume `ge_crm_pgdata`.

```bash
# Sauvegarde
docker compose exec -T db pg_dump -U crm crm | gzip > ge-crm-$(date +%F).sql.gz

# Restauration
gunzip -c ge-crm-2026-11-03.sql.gz | docker compose exec -T db psql -U crm -d crm
```

À automatiser par une tâche cron quotidienne, en gardant des copies hors du VPS.

---

## 7. Dépannage

| Symptôme | Cause probable |
|---|---|
| `Conflict. The container name "/ge-crm-web" is already in use` | une installation précédente traîne : `docker compose down` puis relancer |
| `network webproxy declared as external, but could not be found` | Nginx Proxy Manager utilise un autre réseau : `docker network ls`, puis corriger le nom dans `docker-compose.yml` |
| 502 Bad Gateway dans le navigateur | le proxy ne joint pas `ge-crm-web` : vérifier le Forward Hostname et que le conteneur est sur `webproxy` |
| Connexion `admin` refusée juste après l'installation | hash du mot de passe tronqué : la ligne `ADMIN_PASSWORD_HASH` du `.env` doit être entre guillemets simples |
| Erreur 413 à l'import | ligne `client_max_body_size 30m;` absente de l'onglet Advanced |

Journaux : `docker compose logs --tail 60 backend`.
