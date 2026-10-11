<div align="center">

<img src="frontend/public/favicon.svg" width="58" alt="SupportLoop" />

# SupportLoop

**Le support, en continu.**

Un agent répond avec des sources. Un humain prend le relais.
Les réponses validées enrichissent les prochaines conversations.

[![CI](https://github.com/toaandri/support-loop/actions/workflows/ci.yml/badge.svg)](https://github.com/toaandri/support-loop/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-18-28372f?style=flat-square&logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-3b8068?style=flat-square&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-657b96?style=flat-square&logo=postgresql&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-orchestration-b07c5d?style=flat-square&logo=n8n&logoColor=white)

[Démarrer](#démarrer-en-deux-commandes) · [La boucle](#la-boucle-dapprentissage-en-action) · [Architecture](#architecture) · [Documentation](#documentation)

![Vue d’ensemble SupportLoop](docs/media/dashboard.png)

</div>

SupportLoop est un projet complet de support client pour une boutique fictive :
chat, données métier, recherche documentaire, outils contrôlés, transfert humain
et apprentissage par connaissances validées. Le mode démo fonctionne **sans clé
API et sans Docker**. Le mode RAG ajoute OpenAI et PostgreSQL/pgvector.

## Démarrer en deux commandes

Prérequis : **Node.js 22.16+** et npm. Depuis la racine du dépôt :

```bash
npm run setup
npm run dev
```

Ouvrir **[localhost:5173](http://localhost:5173)**. Le backend écoute sur
[localhost:3000/api/health](http://localhost:3000/api/health).

Si le port frontend est déjà utilisé, copier `.env.example` vers `.env` et définir
`FRONTEND_PORT=5174`. Le lanceur affiche l’adresse à ouvrir.

Pour peupler le tableau de bord avec huit scénarios fictifs, dans un autre terminal :

```bash
npm run demo:seed
```

Les scénarios passent par les vraies routes de l’application. Aucun chiffre de
dashboard n’est fabriqué. En mémoire, les données disparaissent au redémarrage ;
la version Docker les conserve dans PostgreSQL.

## Ce que vous pouvez faire

| Espace | Fonctionnalités |
|---|---|
| **Vue d’ensemble** | Activité sur sept jours UTC, statuts, transferts historiques, délai de réponse et connaissances |
| **Conversations** | Recherche, file filtrée, contexte client, commandes, traces d’outils, prise en charge et réponse humaine |
| **Connaissances** | Question, réponse initiale, correction humaine, règle JSON, révision, édition, approbation et rejet |
| **Conversation client** | Suivi de commande, stock, politiques citées, relais humain et mise à jour des réponses |
| **Catalogue** | Recherche de produits, disponibilité et accès au support |

![Visite des espaces SupportLoop](docs/media/workspace-tour.gif)

L’interface s’adapte au mobile et à la tablette. Elle propose une navigation
clavier, des états vides, des retours d’erreur et un guide intégré. Les illustrations
du catalogue sont locales : aucune image externe n’est nécessaire à la démo.

## La boucle d’apprentissage en action

**Question inconnue → conseiller → résolution → révision → validation → réponse sourcée.**

![Parcours réel de la boucle d’apprentissage](docs/media/learning-loop.gif)

Pour reproduire ce parcours :

1. Ouvrir **Conversation client** et demander : `Comment fonctionne la garantie atelier ?`
2. L’agent transfère la question. Dans **Conversations**, sélectionner le dossier et **Prendre en charge**.
3. Répondre : `La garantie atelier dure deux ans, avec un justificatif d’achat.`
4. Cliquer sur **Résoudre**, puis ouvrir **Connaissances**.
5. **Réviser**, éventuellement **Éditer**, puis **Approuver** la proposition.
6. Dans une **nouvelle conversation**, poser la même question : la réponse validée est maintenant citée.

En démo, la réutilisation repose sur une correspondance lexicale prudente ; en
RAG, sur une recherche vectorielle. Les actions sensibles restent transférées à
un humain. Le modèle **n’est pas réentraîné** : c’est la base de connaissances
qui progresse, sous contrôle humain.

## Architecture

```mermaid
flowchart LR
    C[Client React] --> API[API Express]
    N[n8n · webhooks et schedules] --> API
    API --> A[Agent et outils contrôlés]
    A --> K[Documents et connaissances validées]
    A --> D[Clients, commandes et stock]
    A -->|Informations suffisantes| R[Réponse sourcée]
    A -->|Doute ou action sensible| H[Conseiller humain]
    H --> P[Proposition de connaissance]
    P --> V[Révision et validation]
    V --> K
    K --- PG[(PostgreSQL + pgvector)]
    D --- PG
```

**React + Vite** pour les espaces client et conseiller ; **Node.js + Express**
pour la logique métier ; **OpenAI Responses** pour le modèle et les outils ;
**PostgreSQL + pgvector** pour la persistance et le RAG ; **n8n** pour les
adaptateurs d’orchestration. Le frontend et n8n ne contournent pas les règles du backend.

```text
support-loop/
├── backend/          API, agent, outils, stores et tests
├── frontend/         Interface React et assets locaux
├── database/         Schémas idempotents et données fictives
├── knowledge/demo/   Politiques Markdown de démonstration
├── n8n/workflows/    Douze workflows importables
├── scripts/          Démarrage, scénarios, tests UI, GIFs, backup
├── docs/             Guides techniques et démonstrations
└── .github/          CI : tests, PostgreSQL, build et navigateur
```

## PostgreSQL, Docker et RAG

La stack persistante démarre avec :

```bash
docker compose up -d --build
```

Frontend : 5173 ; API : 3000 ; PostgreSQL : 55432. Nginx sert le build React et
relaie `/api`. Les ports restent sur localhost et les données sont dans un volume.
Pour ajouter n8n :

```bash
docker compose --profile automation up -d
```

n8n est accessible sur 5678. Les webhooks demandent un credential **Header Auth**
à configurer après import ; voir [le guide n8n](n8n/README.md).

Pour utiliser le vrai agent RAG, copier `.env.example` vers `.env` et configurer :

```dotenv
AGENT_MODE=rag
STORAGE_MODE=postgres
OPENAI_API_KEY=your-key
DATABASE_URL=postgresql://supportloop:supportloop@localhost:55432/supportloop
```

Puis, en lancement Node local :

```bash
docker compose up -d postgres
npm run db:init --prefix backend
npm run knowledge:ingest --prefix backend
npm run dev
```

En Docker complet, indexer avec
`docker compose exec backend node scripts/ingestKnowledge.js /knowledge/demo`.
L’ingestion accepte `.md` et `.txt` UTF-8, évite les fichiers inchangés et remplace
les chunks modifiés dans une transaction. Les vecteurs ont 1536 dimensions.
Les appels OpenAI sont payants ; la clé reste exclusivement dans le backend.

## Contrôle humain et robustesse

- Six outils autorisés : commandes, produit, stock, ticket et recherche documentaire.
- Huit appels d’outils et cinq tours de modèle maximum **par message**.
- Commandes accessibles uniquement au client configuré côté serveur.
- Transfert des remboursements, annulations, demandes juridiques, demandes explicites d’humain et erreurs d’outil.
- Connaissances validées immuables ; indexation en échec relançable sans activation partielle.
- Clés client/conseiller distinctes, limites de débit, logs JSON et arrêt contrôlé.

Pour protéger l’accès, définir `DEMO_MODE=false`, `CUSTOMER_API_KEY` et
`SUPPORT_ADMIN_KEY`. La version fournie représente un client et un conseiller
configurés, avec une seule instance backend. Elle reste un projet d’étude ; les
identités multi-utilisateurs, l’email/WhatsApp réel et la supervision externe
nécessitent leur configuration ou extension. [État détaillé et limites](docs/status.md).

## Vérification et démonstrations reproductibles

```bash
npm run check       # Tests backend et build frontend
npm run evaluate    # 15 cas de régression + parcours avant/après
```

Les tests couvrent les contrôles d’accès, les outils, les transitions humaines,
le learning loop, les erreurs et la persistance. Les tests PostgreSQL s’activent
avec `TEST_DATABASE_URL` sur une base de test dédiée. Les appels OpenAI sont simulés.

Pour le parcours navigateur et la régénération des GIFs :

```bash
python -m pip install -r scripts/media-requirements.txt
python -m playwright install chromium
npm run test:e2e
npm run docs:media
```

Le script lance des serveurs isolés et vérifie les layouts à 390, 768 et 1440 px.
Il produit les captures et GIFs à partir du fonctionnement réel de la démo.
[Instructions de vérification](docs/operations.md).

<details>
<summary>Aperçus mobile et espaces détaillés</summary>

| Conversation | Connaissances |
|---|---|
| ![Chat](docs/media/client.png) | ![Révision](docs/media/knowledge.png) |

<img src="docs/media/dashboard-mobile.png" width="270" alt="Tableau de bord mobile" />
<img src="docs/media/chat-mobile.png" width="270" alt="Conversation mobile" />

</details>

## Documentation

| Guide | Contenu |
|---|---|
| [État du projet](docs/status.md) | Périmètre terminé, extensions et limites |
| [Architecture](docs/architecture.md) | Composants, données et parcours |
| [API](docs/api.md) | Routes, corps, statuts et indicateurs |
| [RAG](docs/rag.md) | Ingestion, embeddings, recherche et sources |
| [Learning loop](docs/learning-loop.md) | Révision, activation, échecs et reprise |
| [Exploitation](docs/operations.md) | Installation, Docker, tests, backups et diagnostic |
| [Sécurité](docs/security.md) | Identité, permissions, secrets et garde-fous |
| [n8n](n8n/README.md) | Import, authentification et connexion des workflows |
| [Contribuer](CONTRIBUTING.md) | Développement et validation des modifications |

Les exemples de politiques, commandes et garanties sont fictifs et servent
uniquement à montrer le fonctionnement de SupportLoop.
