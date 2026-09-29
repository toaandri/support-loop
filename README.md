# SupportLoop

Agent de support client avec RAG, tool calling, transfert humain et boucle
d'apprentissage continu. React fournit les espaces client et conseiller ;
Express exécute l'agent et les règles de transfert ; n8n orchestre les messages
entrants. Les données et politiques fournies concernent une boutique fictive.

## Versions implémentées

- **V1** — chat React, API Express, agent mock, premier workflow n8n.
- **V2** — ingestion Markdown/texte UTF-8, nettoyage, chunking avec recouvrement,
  embeddings OpenAI, PostgreSQL/pgvector, recherche cosinus et extraits sources.
- **V3** — clients, commandes, produits, stock, tickets et historique persistant.
- **V4** — function calling avec liste d'outils autorisés, contrôle des arguments,
  accès aux commandes du seul client configuré et journal des appels.
- **V5** — score estimé, seuil configurable, transfert avec contexte, file des
  conversations, prise en charge humaine, réponses, résolution et reprise IA.
- **V6** — learning loop : extraction automatique de connaissance après chaque
  résolution humaine, workflow de validation NEW → REVIEW → APPROVED → ACTIVE,
  indexation vectorielle à l'approbation, interface admin Connaissances.
- **V7** — dashboard : KPIs en temps réel (conversations, taux de résolution,
  taux d'escalade, tickets, connaissances apprises), rafraîchissement auto.
- **V8** — hardening : rate limiting, retry exponentiel OpenAI, logs structurés
  JSON, timeout 30 s, graceful shutdown, Docker Compose complet.

## Essayer sans clé API

Prérequis : Node.js 20.6 ou plus récent et npm.

Dans `backend/` :

```bash
npm install
npm run dev
```

Dans `frontend/`, dans un autre terminal :

```bash
npm install
npm run dev
```

Frontend : `http://localhost:5173`. API : `http://localhost:3000/api/health`.
Par défaut, le mode démo utilise des données en mémoire et des réponses
déterministes. La recherche documentaire de démo utilise des règles locales ;
la recherche sémantique et le LLM sont disponibles en mode `rag`.

Parcours client :

1. Dans **Conversation**, demander `Où est ma commande ORD-1001 ?`.
2. Demander `Je veux parler à un humain`.
3. Dans **Conseiller**, onglet **Conversations**, choisir la conversation et
   **Prendre en charge**.
4. Répondre ; le client voit la réponse lors de l'actualisation automatique.
5. **Résoudre** termine le dossier et déclenche l'extraction de connaissance.
6. Onglet **Connaissances** : approuver ou rejeter la connaissance extraite.
7. Onglet **Tableau de bord** : consulter les KPIs.

**Reprendre avec l'IA** rend la main à l'agent sans résoudre le ticket.
Le client peut continuer à envoyer des précisions pendant le transfert.
L'agent ne répond pas tant que le statut est `waiting` ou `human`.
Le **Catalogue** affiche les produits et leur disponibilité fictive.

## PostgreSQL et RAG

Créer `.env` à la racine à partir de `.env.example`. Pour le RAG :

```dotenv
AGENT_MODE=rag
STORAGE_MODE=postgres
DEMO_MODE=true
OPENAI_API_KEY=your-key
DATABASE_URL=postgresql://supportloop:supportloop@localhost:55432/supportloop
```

Démarrer PostgreSQL depuis la racine :

```bash
docker compose up -d postgres
```

Puis, depuis `backend/` :

```bash
npm run db:init
npm run knowledge:ingest
node --env-file=../.env src/server.js
```

`db:init` applique les schémas et les données fictives sans les écraser.
`knowledge:ingest` indexe `knowledge/demo/`. Pour vos propres fichiers :
`npm run knowledge:ingest -- ../knowledge/local`.
L'ingestion et les réponses RAG effectuent des appels OpenAI payants.
La clé OpenAI reste exclusivement dans le backend.

Les fichiers inchangés sont ignorés. Les fichiers modifiés remplacent leurs
chunks dans une transaction. Réutiliser le même répertoire racine : les noms
de sources sont relatifs à ce répertoire. Supprimer un fichier du disque ne
supprime pas sa version indexée.

Les vecteurs ont 1536 dimensions. Un changement de modèle exige une nouvelle
ingestion ; la recherche filtre les modèles pour éviter de mélanger les vecteurs.
`RAG_MIN_SIMILARITY` filtre la recherche (0.35 par défaut).

## Docker Compose

Configurer `.env`, avec `STORAGE_MODE=postgres`, puis :

```bash
docker compose up -d
docker compose exec backend node scripts/ingestKnowledge.js /knowledge/demo
```

PostgreSQL est exposé uniquement sur localhost, port `POSTGRES_PORT` (55432 par
défaut). Les autres services : frontend 5173, backend 3000, n8n 5678.
Les trois scripts SQL s'exécutent automatiquement sur un volume neuf.
Sur un volume existant, appliquer le schéma avant de lancer le backend RAG :

```bash
docker compose run --rm backend node scripts/initDatabase.js
```

## Learning Loop (V6)

Quand un conseiller résout une conversation, le backend extrait automatiquement
une connaissance structurée via OpenAI. Elle apparaît dans l'onglet
**Connaissances** avec le statut `new`.

Workflow de validation :

```
NEW → REVIEW → APPROVED → ACTIVE
              ↘ REJECTED
```

L'admin peut **Approuver** (indexation vectorielle automatique → statut `active`),
**Rejeter**, ou **Éditer** la réponse et la règle JSON avant approbation.
Une connaissance `active` est interrogée par l'agent RAG comme n'importe quel
document de la Knowledge Base.

En mode `demo` ou sans `knowledgeStore`, l'approbation reste au statut
`approved` (pas d'indexation réelle).

## Outils et transfert

Outils disponibles : `get_customer_orders`, `get_order`, `search_product`,
`check_stock`, `create_ticket`, `search_knowledge_base`.
L'agent dispose de 8 appels d'outils et 5 tours de modèle au maximum par message.
La création de ticket exige une demande de ticket ou un incident dans le message
client et ne crée qu'un ticket par conversation.

Les remboursements, annulations, changements d'adresse, suppressions de compte,
demandes juridiques et demandes explicites de conseiller passent d'abord à un
humain. Un manque de connaissance, un score faible ou une erreur de service
déclenchent aussi un transfert. Aucune action sensible n'est exécutée par l'IA.

## API et accès

En démo, les espaces sont ouverts sur la machine locale. Pour protéger l'accès,
mettre `DEMO_MODE=false` et configurer deux clés distinctes :
`CUSTOMER_API_KEY` et `SUPPORT_ADMIN_KEY`. Le frontend dispose d'un champ
d'accès client et d'une connexion conseiller.

Le client est fixé par `SUPPORT_CUSTOMER_ID` côté serveur ; ni la requête ni
le modèle ne peuvent le changer. Le conseiller est fixé par `SUPPORT_AGENT_NAME`.

**Routes client** (`x-customer-key`) :

- `POST /api/chat` — `{ conversationId, message, channel }`
- `GET /api/conversations/:id/messages` — messages et statut
- `GET /api/customer`, `/api/orders`, `/api/orders/:id`, `/api/products?q=`, `/api/tickets`

**Routes conseiller** (`x-support-key`) :

- `GET /api/support/conversations` — file des conversations
- `GET /api/support/conversations/:id` — historique, client, commandes, traces
- `POST /api/support/conversations/:id/claim|reply|resolve|resume`
- `GET /api/support/settings` — seuil de confiance et nom de l'agent
- `PATCH /api/support/settings` — `{ threshold: 0.85 }`
- `GET /api/support/stats` — KPIs agrégés
- `GET /api/support/knowledge` — liste des connaissances apprises (`?status=new|review|approved|rejected|active`)
- `GET /api/support/knowledge/:id` — détail d'une entrée
- `POST /api/support/knowledge/:id/approve` — approuver et indexer
- `POST /api/support/knowledge/:id/reject` — rejeter
- `PATCH /api/support/knowledge/:id` — éditer `human_answer` et/ou `extracted_rule`

## n8n

Importer les workflows de `n8n/workflows/` dans n8n.
Le workflow `incoming-message.json` est le point d'entrée principal.
Les workflows spécialisés (`human-escalation`, `knowledge-review`,
`knowledge-ingestion`, `notifications`, `analytics`, `error-handling`)
sont importables indépendamment selon les besoins.

Voir `n8n/README.md` pour les détails de configuration.

## Vérification

Dans `backend/` : `npm test`. Dans `frontend/` : `npm run build`.
Les tests PostgreSQL sont activés quand `TEST_DATABASE_URL` est configuré.
Utiliser une base de test contenant uniquement des données fictives ; les tests
appliquent les schémas et le seed, puis nettoient leurs propres conversations.
Les appels OpenAI sont simulés dans les tests.

Références : [OpenAI embeddings](https://platform.openai.com/docs/api-reference/embeddings),
[OpenAI Responses](https://platform.openai.com/docs/api-reference/responses),
[OpenAI function calling](https://platform.openai.com/docs/guides/function-calling),
[pgvector](https://github.com/pgvector/pgvector).
