# SupportLoop — n8n Workflows

## Vue d'ensemble

n8n est le moteur d'orchestration de SupportLoop. Il ne contient pas la logique
métier (elle est dans le backend Node.js), mais sert de pont entre les canaux
entrants, le backend, et les intégrations externes (email, Slack, webhooks).

**Règle fondamentale :** n8n ne doit jamais accéder directement à PostgreSQL.
Toutes les interactions passent par l'API REST du backend.

## Variables d'environnement n8n

| Variable | Description | Exemple |
|---|---|---|
| `SUPPORT_LOOP_BACKEND_URL` | URL du backend (interne Docker) | `http://backend:3000` |
| `CUSTOMER_API_KEY` | Clé d'accès routes client | `your-customer-key` |
| `SUPPORT_ADMIN_KEY` | Clé d'accès routes conseiller/admin | `your-admin-key` |

En Docker Compose, ces variables sont transmises automatiquement depuis `.env`.

## Importer un workflow

1. Ouvrir n8n (`http://localhost:5678`)
2. Menu **Workflows** → **Import from file**
3. Sélectionner le fichier `.json` désiré
4. Activer le workflow (toggle en haut à droite)

## Workflows disponibles

### `incoming-message.json` ⭐ Principal

Point d'entrée pour tout message entrant via webhook externe.

```
POST /webhook/support-loop/incoming-message
    │  { conversationId, message, channel }
    ▼
POST /api/chat  →  réponse agent + statut
```

Utilisation : relier ce webhook à votre canal (formulaire web, email, etc.).

---

### `agent-router.json`

Classifie l'intention d'un message avant de le passer au backend.
Détecte : `order_tracking`, `return_refund`, `stock_inquiry`, `create_ticket`,
`human_request`, `general`.

```
POST /webhook/support-loop/route
    │  { conversationId, message, channel }
    ▼
classify intent → POST /api/chat
```

---

### `knowledge-search.json`

Expose la Knowledge Base comme endpoint de recherche depuis n8n.

```
POST /webhook/support-loop/knowledge-search
    │  { query }
    ▼
POST /api/chat (canal n8n-search) → { answer, sources, confidence }
```

---

### `customer-data-enrichment.json`

Enrichit un profil client en combinant données client et commandes.

```
POST /webhook/support-loop/enrich
    ▼
GET /api/customer + GET /api/orders → profil enrichi
```

---

### `confidence-check.json`

Évalue si un score de confiance dépasse le seuil configuré.

```
POST /webhook/support-loop/confidence
    │  { confidence, needsHuman }
    ▼
GET /api/support/settings → { shouldEscalate, reason }
```

---

### `human-escalation.json`

Notifie l'équipe quand une conversation passe en statut `waiting`.

```
POST /webhook/support-loop/escalation
    │  { conversationId, status }
    ▼
GET /api/support/conversations/:id → contexte complet
→ [Ajouter nœud Email/Slack ici]
```

---

### `human-learning.json`

Intercepte les résolutions et vérifie si une nouvelle connaissance a été extraite.

```
POST /webhook/support-loop/human-learning
    │  { action: "resolve", conversationId }
    ▼
GET /api/support/knowledge?status=new → entrées récentes
```

---

### `knowledge-review-reminder.json`

Rappel quotidien (9h) pour les connaissances en attente de validation.

```
Schedule: chaque jour à 9h
    ▼
GET /api/support/knowledge?status=new
→ [Ajouter nœud Email/Slack si count > 0]
```

---

### `knowledge-ingestion.json`

Déclenche manuellement une réingestion des documents de la Knowledge Base.

```
POST /webhook/support-loop/ingest
    ▼
exécute: node scripts/ingestKnowledge.js /knowledge/demo
```

⚠️ Nécessite que n8n soit sur le même hôte que le backend ou ait accès au volume.

---

### `notifications.json`

Hub de notifications sortantes. Route les événements vers les canaux appropriés.

```
POST /webhook/support-loop/notify
    │  { event: "escalation"|"resolved"|"knowledge_approved", ...payload }
    ▼
route → [nœuds Email/Slack/HTTP à configurer]
```

---

### `analytics.json`

Snapshot analytique quotidien (8h).

```
Schedule: chaque jour à 8h
    ▼
GET /api/support/stats → calcul métriques
→ [Ajouter nœud pour archiver ou envoyer]
```

---

### `error-handling.json`

Centralise la gestion des erreurs. À configurer comme **Error Workflow global**
dans les paramètres n8n (Settings → Error Workflow).

```
Triggered on workflow error
    ▼
log → is critical? → [Ajouter nœud alerte si critique]
```

## Connexion backend — référence des routes utilisées

| Workflow | Méthode | Route |
|---|---|---|
| incoming-message | POST | `/api/chat` |
| agent-router | POST | `/api/chat` |
| knowledge-search | POST | `/api/chat` |
| customer-data-enrichment | GET | `/api/customer`, `/api/orders` |
| confidence-check | GET | `/api/support/settings` |
| human-escalation | GET | `/api/support/conversations/:id` |
| human-learning | GET | `/api/support/knowledge?status=new` |
| knowledge-review-reminder | GET | `/api/support/knowledge?status=new` |
| analytics | GET | `/api/support/stats` |

## Architecture

```
Canal externe (web / email / WhatsApp)
        │
        POST /webhook/support-loop/incoming-message
        │
       n8n
        │
        POST /api/chat  ──────────────────────────────────────────────────┐
        │                                                                  │
   Backend Node.js                                                         │
        │                                                                  │
        ├── supportService.chat()                                          │
        │       └── agent IA + tool calling + escalade                    │
        │                                                                  │
        └── supportService.action()                                        │
                └── claim / reply / resolve / resume                       │
                        └── resolve → _extractAndStore() → learned_knowledge
                                                                           │
                                                    GET /api/support/knowledge
                                                           │
                                                   n8n human-learning / knowledge-review-reminder
                                                           │
                                                   Interface admin (Connaissances)
                                                           │
                                                   POST /api/support/knowledge/:id/approve
                                                           │
                                                   knowledgeStore.replaceDocument() → pgvector
```
