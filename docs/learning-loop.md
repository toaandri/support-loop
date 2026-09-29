# SupportLoop — Learning Loop (V6)

## Concept

Après chaque intervention humaine résolue, le système extrait automatiquement une connaissance structurée
depuis la réponse du conseiller. Cette connaissance passe par un workflow de validation avant d'être
indexée dans la Knowledge Base et utilisée par l'agent IA pour les futurs cas similaires.

## Pipeline

```
Conversation résolue par le conseiller
    │
    ▼ (setImmediate — arrière-plan)
supportService._extractAndStore()
    │
    ├── openaiProvider.extractKnowledge({ question, aiAnswer, humanAnswer })
    │       └── LLM → { intent, condition, resolution, notes }
    │
    └── store.createLearnedKnowledge({ status: 'new', ... })
```

## Workflow de validation

```
NEW  →  REVIEW  →  APPROVED  →  ACTIVE
                ↘
               REJECTED
```

| Statut | Description |
|---|---|
| `new` | Vient d'être extraite, pas encore vue par un admin |
| `review` | En cours de révision manuelle |
| `approved` | Approuvée, en attente d'indexation |
| `active` | Indexée dans pgvector, utilisée par le RAG |
| `rejected` | Rejetée, non utilisée |

## Routes API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/support/knowledge` | Liste (filtrable par `?status=`) |
| `GET` | `/api/support/knowledge/:id` | Détail d'une entrée |
| `POST` | `/api/support/knowledge/:id/approve` | Approuver + indexer |
| `POST` | `/api/support/knowledge/:id/reject` | Rejeter |
| `PATCH` | `/api/support/knowledge/:id` | Éditer `human_answer` et/ou `extracted_rule` |

## Indexation vectorielle

Quand une connaissance est approuvée et qu'un `knowledgeStore` + `provider` sont disponibles
(mode `rag`), le système génère un chunk markdown à partir de la règle extraite et l'indexe
via `knowledgeStore.replaceDocument()`. Le statut passe alors automatiquement à `active`.

En mode `demo` ou `memory`, l'approbation reste au statut `approved` (pas d'indexation réelle).

## Structure SQL

```sql
learned_knowledge (
  id uuid PRIMARY KEY,
  conversation_id text REFERENCES support_conversations(id),
  question text,
  ai_answer text,
  human_answer text,
  extracted_rule jsonb,   -- { intent, condition, resolution, notes }
  status text,            -- new | review | approved | rejected | active
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text
)
```

## Interface Admin

Dans l'espace conseiller, l'onglet **Connaissances** permet de :
- Lister les connaissances par statut
- Voir la question client, la réponse IA initiale, la réponse du conseiller
- Voir la règle extraite par le LLM
- **Approuver** (→ indexation vectorielle automatique)
- **Rejeter**
- **Éditer** la réponse ou la règle avant approbation
