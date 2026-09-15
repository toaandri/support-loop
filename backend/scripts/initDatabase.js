import { readFile } from 'node:fs/promises';
import { createKnowledgeStore } from '../src/services/knowledgeStore.js';

const store = createKnowledgeStore(process.env.DATABASE_URL);
try {
  await store.initialize(await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
  await store.initialize(await readFile(new URL('../../database/support-schema.sql', import.meta.url), 'utf8'));
  await store.initialize(await readFile(new URL('../../database/seed.sql', import.meta.url), 'utf8'));
  console.log('Knowledge database initialized.');
} finally { await store.close(); }
