# SupportLoop — Workflows n8n

## Workflows implémentés

### `incoming-message.json` — Point d'entrée principal

Le workflow de base. Sert de pont entre un canal externe et le backend.

```
POST /webhook/support-loop/incoming-message
    │
    ▼
Call SupportLoop Backend  →  POST /api/chat
    │
    ▼
Return Agent Response
```

**Utilisation :** importer le fichier dans n8n, puis activer le workflow.
Appeler le webhook avec `{ conversationId, message, channel }`.

---

### `agent-router.json`

Classifie l'intention du message entrant avant de le passer au backend.

| Intention détectée | Mots clés |
|---|---|
| `order_tracking` | commande, livraison, suivi, tracking |
| `return_refund` | retour, remboursement, annul |
| `stock_inquiry` | stock, disponible, produit |
| `create_ticket` | ticket, incident, problème |
| `human_request` | humain, conseiller, agent, parler |
| `general` | (défaut) |

---

### `knowledge-search.json`

Expose la Knowledge Base comme endpoint de recherche depuis n8n.
Reçoit `{ query }`, retourne `{ answer, sources, confidence, status }`.

---

### `customer-data-enrichment.json`

Enrichit les données client en combinant profil et commandes.
Retourne `{ customer, orders, open_orders_count, has_shipped_order }`.

---

### `confidence-check.json`

Évalue si un score de confiance est suffisant par rapport au seuil configuré.
Reçoit `{ confidence, needsHuman }`, retourne `{ shouldEscalate, reason }`.
Note : cette logique est déjà intégrée dans le backend ; ce workflow l'expose pour pipelines externes.

---

### `human-escalation.json`

Notifie l'équipe support quand une conversation passe en statut `waiting`.
Récupère le contexte complet de la conversation (raison, historique, client).
**Étendre** avec un nœud Email/Slack pour la notification effective.

---

### `human-learning.json`

Intercepte les résolutions et vérifie si une nouvelle connaissance a été
extraite automatiquement (via `_extractAndStore` dans le backend).
Peut déclencher un rappel immédiat vers l'équipe admin pour validation.

---

### `knowledge-review-reminder.json`

Cron quotidien à 9h. Vérifie les connaissances en statut `new` et prépare
un résumé. **Connecter** le nœud `Build Summary` à Email/Slack pour la notification.

---

### `knowledge-ingestion.json`

Déclenche manuellement ou via webhook une réingestion des documents.
**Prérequis :** n8n sur le même hôte que le backend avec accès au volume `/knowledge`.

---

### `notifications.json`

Hub de notifications sortantes. Route les événements :
- `escalation` → nœud Email/Slack à connecter
- `resolved` → notification client à connecter
- `knowledge_approved` → notification admin à connecter

---

### `analytics.json`

Cron quotidien à 8h. Génère un snapshot des KPIs :
- conversations totales, résolues
- taux de résolution et d'escalade
- tickets ouverts
- connaissances extraites et actives

**Connecter** `Store or Send Snapshot` à une base de données ou Email.

---

### `error-handling.json`

Centralise la gestion des erreurs provenant de tous les workflows.
À configurer comme **Error Workflow global** (Settings → Error Workflow dans n8n).
**Connecter** `Send Critical Alert` à Slack/PagerDuty/Email pour les alertes critiques.

## Variables d'environnement n8n

| Variable | Description |
|---|---|
| `SUPPORT_LOOP_BACKEND_URL` | URL du backend (ex: `http://backend:3000`) |
| `CUSTOMER_API_KEY` | Clé d'accès client (si hors demo mode) |
| `SUPPORT_ADMIN_KEY` | Clé d'accès conseiller/admin |

## Connexion au backend

Tous les workflows passent par le backend via HTTP.
n8n ne doit pas accéder directement à PostgreSQL.

```
n8n workflow
    │
    HTTP Request node → backend REST API
    │
    ├── POST /api/chat
    ├── GET  /api/customer, /api/orders
    ├── GET  /api/support/conversations
    ├── GET  /api/support/conversations/:id
    ├── POST /api/support/conversations/:id/:action
    ├── GET  /api/support/settings
    ├── GET  /api/support/stats
    └── GET  /api/support/knowledge
```

Voir `n8n/README.md` pour la documentation complète.
