# PDMS - Système de Gestion de Projets et Documents

PDMS (Project and Document Management System) est une application web de gestion de projets, de tâches et de documents. Elle permet aux équipes de collaborer efficacement avec un suivi des tâches, un stockage de documents, et des rappels automatiques.

## Fonctionnalités

- **Authentification et Autorisation** : Gestion sécurisée des utilisateurs et des rôles (Admin, Utilisateur, etc.).
- **Gestion de Projets** : Création, suivi et gestion de projets avec leurs détails.
- **Gestion de Tâches** : Attribution, suivi de l'état d'avancement et échéances des tâches.
- **Gestion Documentaire** : Upload, stockage sécurisé et organisation des documents liés aux projets.
- **Rappels Automatisés** : Système de notifications et rappels par email pour les tâches et échéances à venir.
- **Tableau de bord (Dashboard)** : Vue d'ensemble de l'activité, des projets en cours et des tâches assignées.
- **Espace Administrateur** : Interface dédiée à la gestion globale des utilisateurs et des paramètres du système.

## Technologies Utilisées

- **Backend** : Node.js, Express.js
- **Base de données** : SQLite (via `better-sqlite3`)
- **Sécurité** : `bcryptjs` (hachage des mots de passe), `jsonwebtoken` (JWT pour l'authentification)
- **Fichiers** : `multer` (gestion des uploads de fichiers)
- **Emails & Tâches planifiées** : `nodemailer` (envoi d'emails), `node-cron` (planification des rappels)
- **Frontend** : HTML/CSS/JS (Single Page Application servie par Express)

## Prérequis

- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée)
- [npm](https://www.npmjs.com/) (inclus avec Node.js)

## Installation

1. Clonez ce dépôt ou téléchargez les fichiers source.
2. Ouvrez un terminal dans le dossier du projet.
3. Installez les dépendances :
   ```bash
   npm install
   ```
4. Configurez les variables d'environnement :
   - Copiez le fichier `.env.example` en `.env` :
     ```bash
     cp .env.example .env
     ```
   - Éditez le fichier `.env` pour configurer le port, la clé secrète JWT, et les paramètres SMTP pour l'envoi d'emails.

## Démarrage

- **En mode production** :
  ```bash
  npm start
  ```

- **En mode développement** (avec rechargement automatique) :
  ```bash
  npm run dev
  ```

Une fois démarré, l'application est accessible à l'adresse suivante (par défaut) : `http://localhost:3000`

Un compte administrateur par défaut sera automatiquement créé lors de la première initialisation de la base de données. Consultez la console lors du démarrage pour voir les identifiants par défaut (email défini par `ADMIN_EMAIL` dans le `.env` ou `admin@pdms.com`).

## Structure du Projet

- `/db` : Scripts et configuration de la base de données SQLite.
- `/middleware` : Middlewares Express (authentification, gestion des erreurs, etc.).
- `/public` : Fichiers statiques du frontend (HTML, CSS, JS, images).
- `/routes` : Contrôleurs et définitions des routes API de l'application.
- `/services` : Services externes (ex: planification des rappels, envoi d'emails).
- `/uploads` : Dossier contenant les documents uploadés (créé automatiquement).
- `server.js` : Point d'entrée principal de l'application.

## Licence

Ce projet est propriétaire.
