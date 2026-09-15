import { fileURLToPath } from 'node:url';
import { createKnowledgeStore } from '../src/services/knowledgeStore.js';
import { createOpenAIProvider } from '../src/services/openaiProvider.js';
import { ingestKnowledge } from '../src/services/documentIngestion.js';

const provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY,
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL });
const store = createKnowledgeStore(process.env.DATABASE_URL);
try {
  const directory = process.argv[2] || fileURLToPath(new URL('../../knowledge/demo/', import.meta.url));
  console.log(JSON.stringify(await ingestKnowledge(directory, { knowledgeStore: store, provider }), null, 2));
} finally { await store.close(); }
