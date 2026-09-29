# SupportLoop — Workflows n8n

## Workflow disponible

### `incoming-message.json`

Le seul workflow implémenté. Il sert de pont entre un canal externe et le backend.

```
POST /webhook/support-loop/incoming-message
    │
    ▼
Call SupportLoop Backend  →  POST /api/chat
    │
    ▼
Return Agent Response
```

**Utilisation :** importer le fichier `n8n/workflows/incoming-message.json` dans n8n,
puis activer le workflow. Le webhook est disponible à l'URL affichée dans n8n.

**Variables d'environnement n8n :**

| Variable | Description |
|---|---|
| `SUPPORT_LOOP_BACKEND_URL` | URL du backend (ex: `http://backend:3000`) |
| `CUSTOMER_API_KEY` | Clé d'accès client (si hors demo mode) |

## Workflows prévus (non implémentés)

Les workflows suivants sont décrits dans le fichier de spec mais pas encore créés :

| Workflow | Description |
|---|---|
| `agent-router` | Classifie et route selon le type de demande |
| `knowledge-search` | Recherche dans la KB via webhook |
| `customer-data` | Enrichissement des données client |
| `confidence-check` | Évalue le score de confiance |
| `human-escalation` | Notifie l'équipe de support |
| `human-learning` | Déclenche l'extraction de connaissance |
| `knowledge-review` | Rappel quotidien pour les connaissances en attente |
| `knowledge-ingestion` | Ré-ingestion périodique des documents |
| `notifications` | Notifications email/webhook |
| `analytics` | Agrégation des métriques |
| `error-handling` | Gestion centralisée des erreurs n8n |

## Connexion au backend

Tous les workflows doivent passer par le backend via HTTP.
n8n ne doit pas accéder directement à PostgreSQL.

```
n8n workflow
    │
    HTTP Request node → backend REST API
    │
    ├── POST /api/chat
    ├── GET  /api/support/conversations
    ├── POST /api/support/conversations/:id/:action
    └── GET  /api/support/stats
```
