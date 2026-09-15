CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY,
  source text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  embedding_model text NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  UNIQUE (document_id, chunk_index)
);

-- Exact cosine search is sufficient for this prototype's small knowledge base.
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx ON knowledge_chunks(document_id);
