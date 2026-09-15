import { Router } from 'express';
import { generateMockResponse } from '../services/mockAgent.js';

export function createChatRouter(store, generateResponse = generateMockResponse) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'support-loop-backend' });
  });

  router.post('/chat', async (req, res, next) => {
    const { conversationId = 'local-demo', message, channel = 'web' } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (message.length > 4000 || typeof conversationId !== 'string' || !conversationId.trim() ||
        conversationId.length > 128 || typeof channel !== 'string' || !channel.trim() || channel.length > 32) {
      return res.status(400).json({ error: 'Invalid chat payload.' });
    }

    try {
    const history = store.getMessages(conversationId);
    const agentResponse = await generateResponse(message.trim(), { conversationId, channel, history });
    store.addMessage(conversationId, {
      role: 'user',
      content: message.trim(),
      channel
    });

    const assistantMessage = store.addMessage(conversationId, {
      role: 'assistant',
      content: agentResponse.content,
      metadata: {
        confidence: agentResponse.confidence,
        source: agentResponse.source,
        category: agentResponse.category,
        retrievalSimilarity: agentResponse.retrievalSimilarity,
        sources: agentResponse.sources
      }
    });

    return res.json({
      conversationId,
      message: assistantMessage,
      history: store.getMessages(conversationId)
    });
    } catch (error) { return next(error); }
  });

  router.get('/conversations/:conversationId/messages', (req, res) => {
    res.json({
      conversationId: req.params.conversationId,
      messages: store.getMessages(req.params.conversationId)
    });
  });

  return router;
}
