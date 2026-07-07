# OPTIPUB — Guide d'installation complet
**OPTINET SARLU · Solutions Tech · optinetsarl@gmail.com · +228 90 74 84 65**

---

## Prérequis

- **Node.js** v18+ → https://nodejs.org
- **Git** (optionnel)
- Compte **MongoDB Atlas** gratuit → https://www.mongodb.com/atlas

---

## Étape 1 — MongoDB Atlas (base de données cloud gratuite)

1. Aller sur https://www.mongodb.com/atlas → **Try Free**
2. Créer un compte gratuit
3. Créer un **cluster gratuit** (M0 — Free)
4. Dans **Database Access** → Créer un utilisateur avec mot de passe
5. Dans **Network Access** → Ajouter `0.0.0.0/0` (accès depuis partout)
6. Dans **Clusters** → **Connect** → **Connect your application**
7. Copier la chaîne de connexion :
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/optipub
   ```

---

## Étape 2 — Configuration

```bash
# Aller dans le dossier backend
cd OPTIPUB/app/backend

# Copier le fichier de configuration
cp .env.example .env
```

Ouvrir `.env` et remplir les valeurs :
```env
PORT=5000
MONGODB_URI=mongodb+srv://votre_user:votre_password@cluster0.xxxxx.mongodb.net/optipub
JWT_SECRET=optinet_sarlu_cle_secrete_tres_longue_2026
CLIENT_URL=http://localhost:5000
```

---

## Étape 3 — Installation des dépendances

```bash
cd OPTIPUB/app/backend
npm install
```

---

## Étape 4 — Lancement de l'application

```bash
# Mode développement (redémarrage automatique)
npm run dev

# Mode production
npm start
```

✅ L'application sera accessible sur : **http://localhost:5000**

---

## Étape 5 — Premier compte administrateur

L'application démarre sans utilisateur. Créez votre compte via l'interface :

1. Ouvrir http://localhost:5000
2. Cliquer sur **Créer un compte**
3. Remplir : Nom, Email, Mot de passe (min 6 caractères)
4. Vous êtes connecté !

**Compte suggéré OPTINET SARLU :**
- Email : `optinetsarl@gmail.com`
- Mot de passe : (choisissez un mot de passe sécurisé)

---

## Connexion des Réseaux Sociaux

### Facebook & Instagram
1. Aller sur https://developers.facebook.com
2. Créer une application
3. Activer les permissions : `pages_manage_posts`, `instagram_content_publish`
4. Copier `App ID` et `App Secret` dans `.env`

### LinkedIn
1. Aller sur https://www.linkedin.com/developers
2. Créer une application
3. Activer `w_member_social`
4. Copier `Client ID` et `Client Secret` dans `.env`

### WhatsApp Business
1. Aller sur https://developers.facebook.com (Meta)
2. Créer une app WhatsApp Business
3. Copier `Phone Number ID` et `Access Token` dans `.env`

---

## Structure du projet

```
OPTIPUB/app/
├── backend/
│   ├── server.js          ← Point d'entrée
│   ├── .env               ← Variables d'environnement (à créer)
│   ├── .env.example       ← Modèle de configuration
│   ├── package.json
│   ├── config/
│   │   └── db.js          ← Connexion MongoDB
│   ├── models/
│   │   ├── User.js        ← Modèle utilisateurs
│   │   ├── Post.js        ← Modèle publications
│   │   └── SocialAccount.js ← Modèle comptes sociaux
│   ├── routes/
│   │   ├── auth.js        ← API authentification
│   │   ├── posts.js       ← API publications
│   │   ├── accounts.js    ← API réseaux sociaux
│   │   └── hashtags.js    ← API hashtags
│   └── middleware/
│       └── auth.js        ← Vérification JWT
└── frontend/
    └── public/
        └── index.html     ← Application complète (servi par Express)
```

---

## API REST — Endpoints disponibles

| Méthode | URL | Description |
|---------|-----|-------------|
| POST | /api/auth/register | Créer un compte |
| POST | /api/auth/login | Se connecter |
| GET | /api/auth/me | Mon profil |
| GET | /api/posts | Liste des publications |
| POST | /api/posts | Créer une publication |
| PUT | /api/posts/:id | Modifier |
| DELETE | /api/posts/:id | Supprimer |
| POST | /api/posts/:id/publish | Publier maintenant |
| GET | /api/posts/stats | Statistiques |
| GET | /api/accounts | Mes réseaux sociaux |
| POST | /api/accounts | Connecter un compte |
| DELETE | /api/accounts/:platform | Déconnecter |
| GET | /api/hashtags | Bibliothèque complète |
| GET | /api/hashtags/suggest | Suggestions par catégorie |
| GET | /api/hashtags/trending | Hashtags tendance |

---

## Déploiement en production

### Option 1 — VPS Linux (recommandé)
```bash
# Installer PM2 (gestionnaire de processus)
npm install -g pm2

# Démarrer l'application
pm2 start server.js --name optipub

# Démarrage automatique au boot
pm2 startup
pm2 save
```

### Option 2 — Railway (gratuit)
1. Aller sur https://railway.app
2. Connecter votre dépôt GitHub
3. Ajouter les variables d'environnement
4. Déployer automatiquement

---

## Contact & Support

**OPTINET SARLU — Solutions Tech**
- 📧 optinetsarl@gmail.com
- 📞 +228 90 74 84 65
- 📍 Sokodé, Togo

---
*OPTIPUB v1.0.0 — Publish Everywhere — Mai 2026*
