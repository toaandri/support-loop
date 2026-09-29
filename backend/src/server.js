import { createApp } from './app.js';
import { createKnowledgeStore } from './services/knowledgeStore.js';
import { createOpenAIProvider } from './services/openaiProvider.js';
import { createMemorySupportStore, createPostgresSupportStore } from './services/supportStore.js';
import { createSupportService } from './services/supportService.js';
import { logger } from './middleware/logger.js';

const port = Number(process.env.PORT || 3000);
const mode = process.env.AGENT_MODE || 'demo';
if (!['mock', 'demo', 'rag'].includes(mode)) throw new Error('AGENT_MODE must be demo, mock or rag.');
const storageMode = process.env.STORAGE_MODE || (mode === 'rag' ? 'postgres' : 'memory');
if (!['memory', 'postgres'].includes(storageMode)) throw new Error('STORAGE_MODE must be memory or postgres.');
if (storageMode === 'postgres' && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const store = storageMode === 'postgres' ? createPostgresSupportStore(process.env.DATABASE_URL) : createMemorySupportStore();
let knowledgeStore;
let provider;
if (mode === 'rag') {
  provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL, chatModel: process.env.OPENAI_CHAT_MODEL });
  knowledgeStore = createKnowledgeStore(process.env.DATABASE_URL);
  await knowledgeStore.check();
}
await store.check();
const minSimilarity = Number(process.env.RAG_MIN_SIMILARITY || 0.35);
if (!Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) throw new Error('Invalid RAG_MIN_SIMILARITY.');
const supportService = createSupportService({ store, provider, knowledgeStore, minSimilarity });
const demoMode = process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : storageMode === 'memory';
const app = createApp({ supportService, access: { mode, demoMode,
  customerId: process.env.SUPPORT_CUSTOMER_ID || 'customer-demo', customerKey: process.env.CUSTOMER_API_KEY,
  adminKey: process.env.SUPPORT_ADMIN_KEY, agentName: process.env.SUPPORT_AGENT_NAME || 'Support' } });

const server = app.listen(port, () => {
  logger.info('Server started', { port, mode, storageMode, version: 8 });
});

process.on('uncaughtException', (err) => logger.error('Uncaught exception', { error: err.message, stack: err.stack }));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { reason: String(reason) }));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info('Shutdown signal received', { signal });
    server.close(async () => {
      await knowledgeStore?.close();
      await store.close();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });
  });
}
