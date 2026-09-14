import cors from 'cors';
import express from 'express';
import { createChatRouter } from './routes/chatRoutes.js';
import { createConversationStore } from './services/conversationStore.js';

export function createApp(options = {}) {
  const app = express();
  const store = options.store || createConversationStore();

  app.use(cors());
  app.use(express.json());
  app.use('/api', createChatRouter(store));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    return res.status(500).json({ error: 'Unexpected backend error.' });
  });

  return app;
}
