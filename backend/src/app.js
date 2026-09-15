import cors from 'cors';
import express from 'express';
import { createChatRouter } from './routes/chatRoutes.js';
import { createConversationStore } from './services/conversationStore.js';
import { createSupportRouter } from './routes/supportRoutes.js';

export function createApp(options = {}) {
  const app = express();
  const store = options.store || createConversationStore();

  app.use(cors());
  app.use(express.json());
  app.use('/api', options.supportService ? createSupportRouter(options.supportService, options.access) :
    createChatRouter(store, options.generateResponse));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    const status = [400, 401, 403, 404, 409, 413].includes(err.status) ? err.status : 500;
    return res.status(status).json({ error: status === 500 ? 'Unexpected backend error.' :
      err.type === 'entity.parse.failed' ? 'Invalid request body.' : err.message });
  });

  return app;
}
