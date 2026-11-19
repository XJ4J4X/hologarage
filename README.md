# HoloGarage

Jeu de cartes à collectionner de voitures : 191 modèles avec de vraies photos (Wikimedia Commons, licences libres, auteur crédité), 6 niveaux de rareté, cartes holographiques en 3D, boosters à découper à la souris et classeur 3D aux pages qui se tournent. Comptes avec pseudo et mot de passe.

## Lancer en local

Il faut Node.js 22.13 ou plus récent. Sans `DATABASE_URL`, le site utilise SQLite (intégré à Node), donc rien d'autre à installer.

```bash
npm install
npm start            # http://localhost:3000
npm run dev          # pareil, mais un booster toutes les minutes pour tester
```

## Mettre en ligne sur Render

1. Crée un dépôt GitHub et pousses-y tout le contenu de ce dossier.
2. Sur https://dashboard.render.com, choisis **New → Blueprint** et sélectionne le dépôt.
3. Render lit `render.yaml` et crée deux éléments : le site (`hologarage`) et la base PostgreSQL (`hologarage-db`). Clique sur **Apply**.
4. Au bout de 2 ou 3 minutes, le site est en ligne sur `https://hologarage-xxxx.onrender.com`.

### À savoir sur l'offre gratuite de Render

- Le site se met en veille après environ 15 minutes sans visite. La première visite suivante prend 30 à 60 secondes.
- **La base PostgreSQL gratuite expire 30 jours après sa création** (puis elle est supprimée après 14 jours de délai). Tu as deux solutions :
  - passer la base à une offre payante dans Render ;
  - ou utiliser une base gratuite permanente comme Neon (https://neon.tech). Crée un projet, copie l'URL de connexion, puis, dans Render → service `hologarage` → **Environment**, remplace `DATABASE_URL` par cette URL. Tu peux alors supprimer `hologarage-db`.

## Réglages (variables d'environnement)

| Variable | Rôle | Par défaut |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL. Sans elle, SQLite local. | — |
| `START_PACKS` | Boosters offerts à l'inscription | `10` |
| `PACK_INTERVAL_MIN` | Minutes entre deux recharges | `5` |
| `PACKS_PER_TICK` | Boosters donnés à chaque recharge | `2` |
| `MAX_PACKS` | Réserve maximale | `20` |
| `PORT` | Port HTTP (Render le définit tout seul) | `3000` |

Le nombre de cartes par booster (5) est en haut de `server.js`.

## Photos

Au démarrage, le serveur cherche pour chaque voiture la photo principale de son article Wikipédia, uniquement si elle est sous licence libre, et enregistre l'adresse, l'auteur et la licence en base. Les recherches suivantes ne portent que sur les voitures encore sans photo. Pour forcer une photo précise, ajoute le titre exact de l'article Wikipédia (en anglais) dans `EN_TITLES` de `images.js`, puis vide la ligne de cette voiture dans la table `car_images`.

## Ajouter ou modifier des voitures

Tout est dans `data/cars.js`, une ligne par voiture :

```js
["Marque", "Modèle", année, "carrosserie", rareté, puissance_ch, "Pays", "Petit texte de présentation."],
```

- **rareté** : 1 Commune, 2 Peu commune, 3 Rare, 4 Épique, 5 Légendaire, 6 Mythique
- **carrosserie** (forme dessinée sur la carte) : `city`, `hatch`, `sedan`, `wagon`, `suv`, `offroad`, `pickup`, `van`, `coupe`, `sport`, `super`, `hyper`, `classic`, `muscle`, `roadster`, `rally`

Les chances par carte sont dans le tableau `RARITIES` du même fichier. Les cartes déjà obtenues par les joueurs restent dans leur classeur tant que tu ne changes pas la marque, le modèle ou l'année de la voiture : c'est ce qui forme l'identifiant.

## Structure

```
server.js        serveur HTTP, comptes, sessions, tirage des boosters
db.js            PostgreSQL (production) ou SQLite (local)
data/cars.js     catalogue des voitures et raretés
public/          site : index.html, styles.css, app.js
render.yaml      configuration Render (site + base)
```

## Sécurité

- Mots de passe hachés avec scrypt et sel aléatoire.
- Session dans un cookie HttpOnly, SameSite=Lax, Secure en HTTPS, valable 30 jours.
- Le tirage des cartes se fait côté serveur : impossible de tricher depuis le navigateur.
- Nombre de tentatives de connexion limité par adresse IP.
