<div align="center">

<img src="frontend/public/favicon.svg" width="58" alt="SupportLoop" />

# SupportLoop

**Le support, en continu.**

Un portail client. Un espace équipe. Une IA qui s’appuie sur vos données
et progresse grâce aux réponses validées par votre équipe.

[![CI](https://github.com/toaandri/support-loop/actions/workflows/ci.yml/badge.svg)](https://github.com/toaandri/support-loop/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-18-28372f?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-3b8068?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-657b96?logo=postgresql&logoColor=white)
![Groq](https://img.shields.io/badge/IA-Groq-b07c5d)

[Démarrer](#démarrer) · [Fonctionnalités](#deux-espaces-un-même-suivi) · [Apprentissage](#comment-lia-apprend) · [Documentation](#documentation)

![Portail client SupportLoop](docs/media/portal-home.png)

</div>

SupportLoop est une application de support adaptable à votre activité : les articles,
produits et services se configurent dans l’administration. Les clients créent leur
compte et retrouvent leurs propres demandes. PostgreSQL conserve les comptes,
sessions, conversations, tickets et connaissances après un redémarrage.

L’IA utilise **Groq**, avec `openai/gpt-oss-20b`, et des données récupérées par le
serveur. Une clé personnelle est nécessaire ; l’offre gratuite dépend des quotas
[Groq](https://console.groq.com/docs/rate-limits). Sans clé ou en cas d’indisponibilité,
les demandes passent à un conseiller. Aucune réponse générée n’est simulée en mode Groq.

## Démarrer

Prérequis : **Node.js 22.16+**, npm et **Docker** pour PostgreSQL.

1. Copier `.env.example` vers `.env`.
2. Définir `ADMIN_EMAIL` et un `ADMIN_PASSWORD` unique de **12 à 128 caractères**.
3. Ajouter `GROQ_API_KEY` depuis [la console Groq](https://console.groq.com/keys).
   Vous pouvez l’ajouter plus tard : les comptes, articles et échanges humains fonctionnent déjà.
4. Depuis la racine :

```bash
npm run setup
docker compose up -d postgres
npm run dev
```

| Adresse | Espace |
|---|---|
| [localhost:5173](http://localhost:5173) | Portail client : accueil, centre d’aide, catalogue, demandes et commandes |
| [localhost:5173/admin](http://localhost:5173/admin) | Administration : connexion avec les identifiants de `.env` |
| [localhost:3000/api/health](http://localhost:3000/api/health) | État du backend |

Si 5173 est occupé, définir `FRONTEND_PORT=5174`. Le lanceur affiche le port utilisé.
Les schémas sont appliqués au démarrage. **Aucune boutique ou commande fictive n’est
créée dans une base neuve.** Le premier administrateur est créé au démarrage ; son
mot de passe n’est pas écrasé lors des suivants.

Commencer dans `/admin` par publier les informations utiles dans **Centre d’aide**,
puis ajouter vos produits ou services dans **Catalogue**. Un nouveau compte client
se crée depuis **Mon espace → Créer un compte**. Dans **Réglages**, tester la connexion Groq.

Pour exécuter toute la stack compilée avec Nginx :

```bash
docker compose up -d --build
```

Les ports restent liés à localhost. Les volumes PostgreSQL conservent les données.
Le `.env` est privé et exclu de Git. La clé Groq reste exclusivement sur le serveur.

## Deux espaces, un même suivi

| Portail client | Administration |
|---|---|
| Inscription, connexion et déconnexion | Authentification et rôle administrateur |
| Centre d’aide public et recherche | Publication, édition et retrait des articles |
| Catalogue, prix et disponibilité | Création et modification des produits ou services |
| Demandes privées, historique et statuts | File, recherche, contexte, prise en charge et réponse |
| Commandes associées au compte | Clients, commandes du dossier et traces des outils |
| Réponses du conseiller actualisées automatiquement | Révision, édition, validation et retrait des connaissances |
| Interface adaptée au mobile | Statistiques calculées sur les événements et seuil de transfert |

![Visite du portail et de l’administration](docs/media/portal-tour.gif)

Les sessions utilisent des cookies `HttpOnly`, `SameSite=Strict`, avec une durée de
sept jours. Les mots de passe sont hachés avec scrypt. L’identité client vient de
la session : envoyer un autre `customerId` dans une requête ne donne aucun accès à
ses conversations ou commandes. Les actions du conseiller vérifient également son identité.

## Comment l’IA apprend

**Question → sources vérifiées → réponse ou relais humain → résolution → règle proposée → validation → réutilisation.**

![Demande, réponse du conseiller et publication de la règle](docs/media/portal-workflow.gif)

Ce GIF est enregistré dans le vrai portail, sur une base de test isolée, sans clé
Groq. Il montre le relais humain et la rédaction manuelle d’une règle. Avec une
clé, Groq propose automatiquement cette règle à la résolution ; sa validation
reste une décision de l’équipe.

1. Le backend cherche dans les articles et connaissances validées, puis récupère
   les données métier nécessaires dans le contexte du client connecté.
2. Groq formule une réponse à partir de ces faits et cite les extraits documentaires.
3. Une action sensible, une demande de conseiller, un manque de preuve, une confiance
   insuffisante ou une panne déclenchent un transfert avec ticket et historique.
4. À la résolution, une proposition conserve la correction et sa provenance pour révision.
5. L’équipe vérifie le sujet, la condition et la réponse générale. En mode Groq,
   **seule cette règle générale** rejoint l’index, sans recopier la correction privée.
6. La règle validée devient disponible aux prochaines recherches. Elle peut être retirée.

L’apprentissage enrichit une **base de connaissances** ; il ne modifie pas les poids
du modèle. La recherche Groq utilise le plein texte PostgreSQL, principalement en
français, sans API d’embeddings payante. Le score de confiance est une estimation.
Le JSON strict est compatible avec le [modèle choisi](https://console.groq.com/docs/structured-outputs).

![Espace équipe et gestion des conversations](docs/media/portal-admin-conversations.png)

## Architecture

```mermaid
flowchart LR
    C[Portail client] --> API[Express · sessions et rôles]
    H[Administration] --> API
    API --> PG[(PostgreSQL · comptes et données)]
    API --> K[Recherche dans les articles et règles validées]
    K --> G[Groq · génération structurée]
    G --> R{Preuves et confiance suffisantes ?}
    R -->|Oui| A[Réponse sourcée]
    R -->|Non| T[Ticket et relais humain]
    T --> V[Résolution et révision]
    V -->|Validation| K
```

```text
backend/          API, authentification, fournisseurs IA, règles métier, tests
frontend/         Portail public et client, administration, assets locaux
database/         Schémas idempotents et fixtures séparées
knowledge/        Documents à ingérer ; exemples isolés dans demo/
scripts/          Démarrage, tests navigateur, GIFs, sauvegarde
docs/             Guides d’utilisation, API, sécurité et exploitation
n8n/workflows/    Adaptateurs facultatifs, credentials à configurer
```

## Vérifications

```bash
npm run check       # Tests backend + build React
npm run evaluate    # 15 cas déterministes du moteur hors ligne + avant/après
```

Pour inclure les intégrations, créer une base dédiée `supportloop_test`, puis définir
`TEST_DATABASE_URL`. Sous PowerShell :

```powershell
$env:TEST_DATABASE_URL='postgresql://supportloop:supportloop@localhost:55432/supportloop_test'
npm run check
python -m pip install -r scripts/media-requirements.txt
python -m playwright install chromium
npm run test:portal
npm run test:e2e
npm run docs:media
```

Le test du portail utilise une base **jetable** `supportloop_portal_test`, des ports
3102/5181 et des identités fictives. Il vérifie les vrais comptes, permissions,
articles, catalogue, commandes, échanges humains, connaissances et affichages mobiles.
Les tests Groq interceptent uniquement l’inférence externe : la récupération et
l’activation sont vérifiées dans PostgreSQL. Un test avec une vraie clé doit encore
être effectué après sa configuration. La CI exécute les tests sous Node 22/24 et les
parcours Chromium sans clé externe.

## Modes et extensions

Le portail utilise `AUTH_MODE=session`, `AGENT_MODE=groq`, `STORAGE_MODE=postgres` et
`DEMO_MODE=false`. Un mode historique en mémoire reste disponible pour les fixtures :
`AUTH_MODE=keys`, `AGENT_MODE=demo`, `STORAGE_MODE=memory`, `DEMO_MODE=true`.
Les anciens médias de la démo documentent ce moteur déterministe.

`AGENT_MODE=rag` active l’intégration OpenAI et pgvector, avec une clé et des appels
payants ; voir [le guide IA et recherche](docs/rag.md). n8n reste facultatif ; les
clés de service doivent être configurées explicitement, ainsi que les credentials
et destinations des canaux. [Guide n8n](n8n/README.md).

Les commandes se lisent depuis PostgreSQL et sont rattachées à un client. La connexion
à un ERP ou à une plateforme de vente se fait au niveau des repositories ; aucun
paiement, remboursement automatique ou canal email/WhatsApp n’est présenté comme connecté.
Cette version fournit un serveur de support unique ; voir les limites et l’exploitation.

## Documentation

| Guide | Contenu |
|---|---|
| [État du projet](docs/status.md) | Fonctions livrées, validations et limites |
| [Architecture](docs/architecture.md) | Composants, stockage et flux |
| [API](docs/api.md) | Comptes, routes, corps, rôles et erreurs |
| [IA et recherche](docs/rag.md) | Groq, plein texte, ingestion et OpenAI facultatif |
| [Apprentissage](docs/learning-loop.md) | Proposition, revue, activation, retrait et confidentialité |
| [Exploitation](docs/operations.md) | Local, Docker, accès admin, tests, sauvegarde et diagnostic |
| [Sécurité](docs/security.md) | Sessions, identités, outils et données envoyées au fournisseur |
| [n8n](n8n/README.md) | Workflows, accès de service et configuration des canaux |
