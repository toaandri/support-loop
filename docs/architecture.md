# SupportLoop — Architecture

## Vue d'ensemble

SupportLoop est un système de support client piloté par un agent IA, avec une
orchestration n8n facultative. Le chat React appelle directement le backend.
Le système est conçu autour de cinq couches :

```
Client web / adaptateurs de canaux externes à configurer
        │
       n8n  ←─── orchestration, webhooks, cron
        │
   Backend (Node.js + Express)
        │
   ┌────┴────────────────────────┐
   │                             │
PostgreSQL + pgvector        OpenAI API
(customer data, conversations,  (LLM chat, embeddings,
 knowledge chunks,               tool calling,
 learned_knowledge)              knowledge extraction)
```

## Composants

### Backend (`backend/src/`)

| Fichier | Rôle |
|---|---|
| `server.js` | Point d'entrée, configuration runtime |
| `app.js` | Express app, middlewares (CORS, rate limit, logger) |
| `routes/supportRoutes.js` | Toutes les routes REST `/api/*` |
| `services/supportService.js` | Logique métier principale (chat, escalade, learning loop) |
| `services/supportStore.js` | Couche données : mémoire (dev) + PostgreSQL (prod) |
| `services/supportAgent.js` | Agent demo (sans LLM) + détection d'escalade |
| `services/agentTools.js` | Définitions des tools + exécuteur sécurisé |
| `services/openaiProvider.js` | Intégration OpenAI (chat, embeddings, extraction) |
| `services/knowledgeStore.js` | Stockage vectoriel pgvector |
| `services/documentIngestion.js` | Pipeline d'ingestion de documents |
| `services/ragAgent.js` | Agent RAG simple (sans tools) |
| `middleware/rateLimit.js` | Rate limiting in-memory par IP |
| `middleware/logger.js` | Logger JSON structuré |

### Frontend (`frontend/src/`)

| Fichier | Rôle |
|---|---|
| `SupportApp.jsx` | Interface client (chat, catalogue, accès conseiller) |
| `SupportWorkspace.jsx` | Espace conseiller (conversations, révision et actions) |
| `Dashboard.jsx` | Indicateurs et visualisations des données réelles |
| `MessageList.jsx` | Affichage des messages avec sources et confidence |
| `api.js` | Client HTTP + labels |

### Database (`database/`)

| Fichier | Rôle |
|---|---|
| `schema.sql` | Tables RAG (knowledge_documents, knowledge_chunks) |
| `support-schema.sql` | Tables métier (customers, orders, tickets, conversations, learned_knowledge) |
| `seed.sql` | Données de démo (2 clients, 2 produits, 3 commandes) |

## Flux principal

```
1. Client envoie un message
2. POST /api/chat
3. supportService.chat()
   a. Détection escalade directe (sensitive-action, customer-distress...)
   b. Agent IA + tool calling (get_order, check_stock, search_knowledge_base...)
   c. Évaluation confiance vs seuil
   d. Réponse auto OU escalade → status 'waiting'
4. Si escalade :
   - Conseiller claim → status 'human'
   - Conseiller reply / resolve / resume
   - Si resolve : sauvegarde transactionnelle puis proposition de connaissance
```

## Modes de fonctionnement

| Variable | Valeur | Comportement |
|---|---|---|
| `AGENT_MODE` | `demo` | Agent démo sans LLM, données fictives |
| `AGENT_MODE` | `rag` | Agent OpenAI + RAG + tool calling |
| `STORAGE_MODE` | `memory` | Tout en mémoire (pas de DB requise) |
| `STORAGE_MODE` | `postgres` | PostgreSQL persistant |

Le mode RAG exige PostgreSQL. Compose utilise PostgreSQL même si la démo Node
locale choisit la mémoire. En mode démo, les connaissances validées sont retrouvées
lexicalement ; le mode RAG utilise pgvector. L’identité client vient de la
configuration du serveur, pas du texte d’un message ou du champ channel.

Le frontend passe par un proxy `/api` en développement et par Nginx dans Docker.
Les appels n8n sont des appels REST authentifiés. Les modèles de notification
nécessitent un fournisseur sortant configuré et ne livrent pas de message seuls.
