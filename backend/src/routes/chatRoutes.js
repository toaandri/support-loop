import { Router } from 'express';
import { generateMockResponse } from '../services/mockAgent.js';

export function createChatRouter(store) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'support-loop-backend' });
  });

  router.post('/chat', (req, res) => {
    const { conversationId = 'local-demo', message, channel = 'web' } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    store.addMessage(conversationId, {
      role: 'user',
      content: message.trim(),
      channel
    });

    const agentResponse = generateMockResponse(message, { conversationId, channel });
    const assistantMessage = store.addMessage(conversationId, {
      role: 'assistant',
      content: agentResponse.content,
      metadata: {
        confidence: agentResponse.confidence,
        source: agentResponse.source,
        category: agentResponse.category
      }
    });

    return res.json({
      conversationId,
      message: assistantMessage,
      history: store.getMessages(conversationId)
    });
  });

  router.get('/conversations/:conversationId/messages', (req, res) => {
    res.json({
      conversationId: req.params.conversationId,
      messages: store.getMessages(req.params.conversationId)
    });
  });

  return router;
}
