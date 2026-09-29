# SupportLoop — RAG & Knowledge Base (V2)

## Vue d'ensemble

Le système utilise Retrieval-Augmented Generation (RAG) pour ancrer les réponses de l'agent
dans des documents de politique et de procédure réels, plutôt que de laisser le LLM inventer.

## Pipeline d'ingestion

```
Documents (.md, .txt)
    │
    ▼ documentIngestion.chunkText()
Chunks (≈1200 caractères, overlap 200)
    │
    ▼ openaiProvider.embed()
Vecteurs (1536 dimensions, text-embedding-3-small)
    │
    ▼ knowledgeStore.replaceDocument()
PostgreSQL knowledge_chunks (colonne embedding vector(1536))
```

### Commande d'ingestion

```bash
# Ingérer les documents du dossier knowledge/
npm run knowledge:ingest

# Ingérer un dossier personnalisé
node --env-file=../.env scripts/ingestKnowledge.js /chemin/vers/documents
```

L'ingestion est idempotente : un document dont le hash n'a pas changé n'est pas ré-indexé.

## Pipeline de recherche

```
Question client
    │
    ▼ openaiProvider.embed([question])
Vecteur requête
    │
    ▼ knowledgeStore.search(embedding, { minSimilarity: 0.35, limit: 4 })
Chunks pertinents (cosine similarity ≥ seuil)
    │
    ▼ openaiProvider.answer({ question, history, sources })
Réponse citée ([1], [2], ...)
```

## Structure SQL

```sql
knowledge_documents (
  id uuid, source text UNIQUE, content_hash text,
  embedding_model text, indexed_at timestamptz
)
knowledge_chunks (
  id uuid, document_id uuid, chunk_index integer,
  content text, embedding vector(1536)
)
```

## Connaissances apprises (V6)

Les connaissances validées par les admins (statut `active`) sont également indexées
dans `knowledge_chunks` via `knowledgeStore.replaceDocument()`, avec un `source` du type
`learned/<uuid>.md`. Elles sont donc interrogées exactement comme les documents statiques.

## Documents de démo

```
knowledge/demo/
  delivery.md    — politique de livraison
  returns.md     — politique de retour et d'annulation
```

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Modèle d'embedding |
| `RAG_MIN_SIMILARITY` | `0.35` | Seuil de similarité cosine minimum |
| `DATABASE_URL` | — | Connexion PostgreSQL (requis en mode rag) |
