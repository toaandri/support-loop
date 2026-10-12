import { createApp } from './app.js';
import { createKnowledgeStore } from './services/knowledgeStore.js';
import { createOpenAIProvider } from './services/openaiProvider.js';
import { createMemorySupportStore, createPostgresSupportStore } from './services/supportStore.js';
import { createSupportService } from './services/supportService.js';
import { logger } from './middleware/logger.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createGroqProvider } from './services/groqProvider.js';
import { createAuthService } from './services/authService.js';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const mode = process.env.AGENT_MODE || 'demo';
if (!['mock', 'demo', 'rag', 'groq'].includes(mode)) throw new Error('AGENT_MODE must be demo, mock, groq or rag.');
const storageMode = process.env.STORAGE_MODE || (['rag','groq'].includes(mode) ? 'postgres' : 'memory');
if (!['memory', 'postgres'].includes(storageMode)) throw new Error('STORAGE_MODE must be memory or postgres.');
if (['rag','groq'].includes(mode) && storageMode !== 'postgres') throw new Error('AI requires STORAGE_MODE=postgres.');
if (storageMode === 'postgres' && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const store = storageMode === 'postgres' ? createPostgresSupportStore(process.env.DATABASE_URL) : createMemorySupportStore();
let knowledgeStore;
let provider;
let authService;
const sessionAuth = process.env.AUTH_MODE === 'session';
if(storageMode==='postgres') {
  knowledgeStore=createKnowledgeStore(process.env.DATABASE_URL);
  await knowledgeStore.initialize(await readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
  await knowledgeStore.initialize(await readFile(new URL('../../database/support-schema.sql',import.meta.url),'utf8'));
}
if(sessionAuth) {
  if(storageMode!=='postgres') throw new Error('Session authentication requires PostgreSQL.');
  await knowledgeStore.initialize(await readFile(new URL('../../database/auth-schema.sql',import.meta.url),'utf8'));
  authService=createAuthService(process.env.DATABASE_URL);
  await authService.bootstrap({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,name:process.env.ADMIN_NAME});
}
if(mode==='groq') provider=createGroqProvider({apiKey:process.env.GROQ_API_KEY,chatModel:process.env.GROQ_MODEL});
if (mode === 'rag') {
  provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL, chatModel: process.env.OPENAI_CHAT_MODEL });
  await knowledgeStore.check();
}
await store.check();
const minSimilarity = Number(process.env.RAG_MIN_SIMILARITY || 0.35);
if (!Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) throw new Error('Invalid RAG_MIN_SIMILARITY.');
const knowledgeDirectory = process.env.KNOWLEDGE_DIRECTORY || fileURLToPath(new URL(mode==='groq'?'../../knowledge/local':'../../knowledge/demo', import.meta.url));
const supportService = createSupportService({ store, provider, knowledgeStore, knowledgeDirectory, minSimilarity });
const demoMode = process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : storageMode === 'memory';
const app = createApp({ supportService, authService, secureCookies:process.env.COOKIE_SECURE==='true', access: { mode, demoMode,sessionAuth,
  brandName:process.env.BRAND_NAME || 'SupportLoop',aiModel:provider?.chatModel,
  customerId: process.env.SUPPORT_CUSTOMER_ID || 'customer-demo', customerKey: process.env.CUSTOMER_API_KEY,
  adminKey: process.env.SUPPORT_ADMIN_KEY, agentName: process.env.SUPPORT_AGENT_NAME || 'Support' } });

const server = app.listen(port, host, () => {
  logger.info('Server started', { port, mode, storageMode, version: 9 });
});

process.on('uncaughtException', (err) => { logger.error('Uncaught exception', { error: err.message }); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', { reason: String(reason) }); process.exit(1); });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info('Shutdown signal received', { signal });
    setTimeout(() => process.exit(1), 15000).unref();
    server.close(async () => {
      await knowledgeStore?.close();
      await authService?.close();
      await store.close();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });
  });
}
