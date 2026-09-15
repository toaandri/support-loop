import pg from 'pg';
import { randomUUID } from 'node:crypto';

export const embeddingDimensions = 1536;

export function vectorLiteral(values) {
  if (!Array.isArray(values) || values.length !== embeddingDimensions ||
      !values.every(Number.isFinite) || !values.some((value) => value !== 0)) {
    throw new Error('Invalid embedding: expected 1536 finite values and a nonzero vector.');
  }
  return `[${values.join(',')}]`;
}

export function createKnowledgeStore(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required for RAG.');
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });

  return {
    async initialize(sql) { await pool.query(sql); },
    async check() { await pool.query('SELECT id FROM knowledge_chunks LIMIT 1'); },
    async getDocument(source) {
      const result = await pool.query('SELECT * FROM knowledge_documents WHERE source = $1', [source]);
      return result.rows[0];
    },
    async replaceDocument({ source, hash, model, chunks, embeddings }) {
      if (!chunks.length || chunks.length !== embeddings.length) throw new Error('Invalid document chunks.');
      const vectors = embeddings.map(vectorLiteral);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(`
          INSERT INTO knowledge_documents (id, source, content_hash, embedding_model)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (source) DO UPDATE SET content_hash = EXCLUDED.content_hash,
            embedding_model = EXCLUDED.embedding_model, indexed_at = now()
          RETURNING id`, [randomUUID(), source, hash, model]);
        const documentId = result.rows[0].id;
        await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);
        for (let index = 0; index < chunks.length; index += 1) {
          await client.query(`INSERT INTO knowledge_chunks
            (id, document_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4, $5::vector)`,
          [randomUUID(), documentId, index, chunks[index], vectors[index]]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async search(embedding, { model, limit = 4, minSimilarity = 0.35 }) {
      const result = await pool.query(`
        SELECT c.id, d.source, c.chunk_index AS "chunkIndex", c.content,
          1 - (c.embedding <=> $1::vector) AS similarity
        FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
        WHERE d.embedding_model = $2 AND 1 - (c.embedding <=> $1::vector) >= $3
        ORDER BY c.embedding <=> $1::vector LIMIT $4`,
      [vectorLiteral(embedding), model, minSimilarity, limit]);
      return result.rows;
    },
    async close() { await pool.end(); }
  };
}
