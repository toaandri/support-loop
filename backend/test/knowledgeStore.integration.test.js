import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createKnowledgeStore } from '../src/services/knowledgeStore.js';

// Use a dedicated test database. Test documents are uniquely named and removed.
describe.skipIf(!process.env.TEST_DATABASE_URL)('pgvector integration', () => {
  it('retrieves matching vectors, filters models, and replaces old chunks', async () => {
    const store = createKnowledgeStore(process.env.TEST_DATABASE_URL);
    const cleanup = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const source = `test-${randomUUID()}.md`;
    const vector = Array(1536).fill(0); vector[0] = 1;
    const other = Array(1536).fill(0); other[1] = 1;
    try {
      await store.initialize(await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
      await store.replaceDocument({ source, hash: 'first', model: 'test-model',
        chunks: ['Retour sous 14 jours.', 'Livraison.'], embeddings: [vector, other] });
      const results = await store.search(vector, { model: 'test-model', minSimilarity: 0.9 });
      expect(results.find((row) => row.source === source)?.content).toBe('Retour sous 14 jours.');
      expect(await store.search(vector, { model: 'missing-model' })).toEqual([]);
      await store.replaceDocument({ source, hash: 'second', model: 'test-model',
        chunks: ['Retour sous 30 jours.'], embeddings: [vector] });
      expect((await store.getDocument(source)).content_hash).toBe('second');
      const chunks = await cleanup.query(`SELECT c.content FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c.document_id WHERE d.source = $1`, [source]);
      expect(chunks.rows).toEqual([{ content: 'Retour sous 30 jours.' }]);
    } finally {
      await cleanup.query('DELETE FROM knowledge_documents WHERE source = $1', [source]);
      await cleanup.end();
      await store.close();
    }
  });
});
