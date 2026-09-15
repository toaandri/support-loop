# SupportLoop

Prototype d'agent de support client avec RAG, outils metier et transfert a un
conseiller humain. React fournit les espaces client et conseiller ; Express
execute l'agent et les regles de transfert ; n8n orchestre les messages entrants.
Les donnees et politiques fournies concernent une boutique fictive.

## Versions implementees

- V1 : chat React, API Express, agent mock et premier workflow n8n.
- V2 : ingestion Markdown/texte UTF-8, nettoyage, chunking avec recouvrement,
  embeddings OpenAI, PostgreSQL/pgvector, recherche cosinus et extraits sources.
- V3 : clients, commandes, produits, stock, tickets et historique persistant.
- V4 : function calling avec liste d'outils autorises, controle des arguments,
  acces aux commandes du seul client configure et journal des appels.
- V5 : score estime, seuil configurable, transfert avec contexte, file des
  conversations, prise en charge humaine, reponses, resolution et reprise IA.

## Essayer sans cle API

Prerequis : Node.js 20.6 ou plus recent et npm.

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
Par defaut, le mode demo utilise des donnees en memoire et des reponses
deterministes. La recherche documentaire de demo utilise des regles locales ;
la recherche semantique et le LLM sont disponibles en mode `rag`.

Parcours :

1. Dans **Conversation**, demander `Ou est ma commande ORD-1001 ?`.
2. Demander `Je veux parler a un humain`.
3. Dans **Conseiller**, choisir la conversation et **Prendre en charge**.
4. Repondre ; le client voit la reponse lors de l'actualisation automatique.
5. **Resoudre** termine le dossier. **Reprendre avec l'IA** rend la main a l'agent.

Le client peut continuer a envoyer des precisions pendant le transfert.
L'agent ne repond pas tant que le statut est `waiting` ou `human`.
Le **Catalogue** affiche les produits et leur disponibilite fictive.

## PostgreSQL et RAG

Creer `.env` a la racine a partir de `.env.example`. Pour le RAG :

```dotenv
AGENT_MODE=rag
STORAGE_MODE=postgres
DEMO_MODE=true
OPENAI_API_KEY=your-key
DATABASE_URL=postgresql://supportloop:supportloop@localhost:55432/supportloop
```

Demarrer PostgreSQL depuis la racine :

```bash
docker compose up -d postgres
```

Puis, depuis `backend/` :

```bash
npm run db:init
npm run knowledge:ingest
node --env-file=../.env src/server.js
```

`db:init` applique les schemas et les donnees fictives sans les ecraser.
`knowledge:ingest` indexe `knowledge/demo/`. Pour vos propres fichiers :
`npm run knowledge:ingest -- ../knowledge/local`.
L'ingestion et les reponses RAG effectuent des appels OpenAI payants.
La cle OpenAI reste exclusivement dans le backend.

Les fichiers inchanges sont ignores. Les fichiers modifies remplacent leurs
chunks dans une transaction. Reutiliser le meme repertoire racine : les noms
de sources sont relatifs a ce repertoire. Supprimer un fichier du disque ne
supprime pas sa version indexee. PDF, OCR et administration des documents
dans le navigateur restent a ajouter.

Les vecteurs ont 1536 dimensions. Un changement de modele exige une nouvelle
ingestion ; la recherche filtre les modeles pour eviter de melanger les vecteurs.
`RAG_MIN_SIMILARITY` filtre la recherche (0.35 par defaut). La similarite et le
score estime par l'agent ne sont pas des probabilites verifiees de justesse.
Le seuil de transfert est modifiable dans l'espace Conseiller et persiste en base.

Pour conserver les donnees sans appeler OpenAI, utiliser `AGENT_MODE=demo`
avec `STORAGE_MODE=postgres`.

## Docker Compose

Configurer `.env`, avec `STORAGE_MODE=postgres`, puis :

```bash
docker compose up -d
docker compose exec backend node scripts/ingestKnowledge.js /knowledge/demo
```

PostgreSQL est expose uniquement sur localhost, port `POSTGRES_PORT` (55432 par
defaut). Les autres services : frontend 5173, backend 3000, n8n 5678.
Les trois scripts SQL s'executent automatiquement sur un volume neuf.
Sur un volume existant, appliquer le schema avant de lancer le backend RAG :

```bash
docker compose run --rm backend node scripts/initDatabase.js
```

## Outils et transfert

Outils disponibles : `get_customer_orders`, `get_order`, `search_product`,
`check_stock`, `create_ticket`, `search_knowledge_base`.
L'agent dispose de 8 appels d'outils et 5 tours de modele au maximum par message.
La creation de ticket exige une demande de ticket ou un incident dans le message
client et ne cree qu'un ticket par conversation.

Les remboursements, annulations, changements d'adresse, suppressions de compte,
demandes juridiques et demandes explicites de conseiller passent d'abord a un
humain. Un manque de connaissance, un score faible ou une erreur de service
declenchent aussi un transfert. Aucune action sensible n'est executee par l'IA.
L'envoi d'emails et les integrations de transport ne sont pas encore implementes.

## API et acces

En demo, les espaces sont ouverts sur la machine locale. Pour proteger l'acces,
mettre `DEMO_MODE=false` et configurer deux cles distinctes :
`CUSTOMER_API_KEY` et `SUPPORT_ADMIN_KEY`. Le frontend dispose d'un champ
d'acces client et d'une connexion conseiller. Ne pas exposer la demo sur Internet.
Ce sont des cles de prototype : authentification multi-utilisateur et roles
complets font partie du durcissement futur.

Le client est fixe par `SUPPORT_CUSTOMER_ID` cote serveur ; ni la requete ni
le modele ne peuvent le changer. Le conseiller est fixe par `SUPPORT_AGENT_NAME`.

- `POST /api/chat` : `{ conversationId, message, channel }`.
- `GET /api/conversations/:id/messages` : messages et statut, limites au client.
- `GET /api/customer`, `/api/orders`, `/api/orders/:id`, `/api/products?q=...`, `/api/tickets`.
- `GET /api/support/conversations` : file des conversations.
- `GET /api/support/conversations/:id` : historique, client, commandes, sources et outils.
- `POST /api/support/conversations/:id/claim|reply|resolve|resume` ; `reply` attend `{ content }`.
- `GET/PATCH /api/support/settings` ; PATCH attend `{ threshold: 0.85 }`.

Les routes client utilisent `x-customer-key`, les routes conseiller
`x-support-key`. La prise en charge est exclusive et les tours simultanes sont
serialises. PostgreSQL conserve les messages, statuts, tickets et traces dans
une transaction ; le mode memoire perd ces donnees au redemarrage.

## n8n

Importer `n8n/workflows/incoming-message.json`. Le webhook attend
`{ conversationId, message, channel }`, appelle l'API avec `CUSTOMER_API_KEY`
et renvoie sa reponse, y compris le statut de transfert.
Les decisions et mutations restent dans le backend.
En statut humain, consulter l'historique pour recevoir les reponses du conseiller.
Le workflow est importable ; son execution dans n8n n'est pas testee automatiquement.

## Verification

Dans `backend/` : `npm test`. Dans `frontend/` : `npm run build`.
Les tests PostgreSQL sont actives quand `TEST_DATABASE_URL` est configure.
Utiliser une base de test contenant uniquement des donnees fictives ; les tests
appliquent les schemas et seed, puis nettoient leurs propres conversations.
Les appels OpenAI sont simules dans les tests ; un essai live necessite votre cle.

References : [OpenAI embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create),
[OpenAI Responses](https://developers.openai.com/api/docs/guides/text),
[OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[pgvector](https://github.com/pgvector/pgvector).
