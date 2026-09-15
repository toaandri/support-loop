import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { httpError } from '../services/supportStore.js';

function matches(actual, expected) {
  if (!actual || !expected || typeof actual !== 'string') return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;

export function createSupportRouter(service, { demoMode = true, customerKey, adminKey,
  customerId = 'customer-demo', agentName = 'Support', mode = 'demo' } = {}) {
  if (!demoMode && (!customerKey || !adminKey || customerKey === adminKey)) {
    throw new Error('Distinct CUSTOMER_API_KEY and SUPPORT_ADMIN_KEY are required outside demo mode.');
  }
  const router = Router();
  router.get('/health', (req, res) => res.json({ status: 'ok', service: 'support-loop-backend', mode, demoMode, version: 5 }));
  router.use('/support', (req, res, next) => {
    if (matches(req.get('x-support-key'), adminKey) || (demoMode && !adminKey)) return next();
    return res.status(401).json({ error: 'Support access key required.' });
  });
  router.get('/support/settings', wrap(async (req, res) => res.json({ threshold: await service.store.getThreshold(), agentName })));
  router.patch('/support/settings', wrap(async (req, res) => {
    const threshold = req.body?.threshold;
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw httpError(400, 'Threshold must be between 0 and 1.');
    await service.store.setThreshold(threshold); res.json({ threshold });
  }));
  router.get('/support/conversations', wrap(async (req, res) => {
    const states = await service.store.listConversations();
    res.json({ conversations: await Promise.all(states.map(async (state) => ({
      id: state.id, status: state.status, assignedTo: state.assignedTo, escalation: state.escalation,
      updatedAt: state.updatedAt, preview: state.messages.at(-1)?.content || '',
      customer: await service.store.customer(state.customerId)
    }))) });
  }));
  router.get('/support/conversations/:id', wrap(async (req, res) => {
    const conversation = await service.store.conversation(req.params.id);
    res.json({ ...conversation, customer: await service.store.customer(conversation.customerId),
      orders: await service.store.orders(conversation.customerId), tickets: await service.store.tickets(conversation.customerId) });
  }));
  router.post('/support/conversations/:id/:action', wrap(async (req, res) => {
    if (req.params.action === 'reply' && !text(req.body?.content, 4000)) throw httpError(400, 'Reply is required (max 4000 characters).');
    res.json(await service.action(req.params.id, req.params.action, { agentName,
      content: req.params.action === 'reply' ? req.body.content.trim() : undefined }));
  }));
  router.use((req, res, next) => {
    if (req.path.startsWith('/support')) return next();
    if (matches(req.get('x-customer-key'), customerKey) || (demoMode && !customerKey)) return next();
    return res.status(401).json({ error: 'Customer access key required.' });
  });
  router.get('/customer', wrap(async (req, res) => {
    const customer = await service.store.customer(customerId);
    if (!customer) throw httpError(404, 'Customer not found.');
    res.json({ customer });
  }));
  router.get('/orders', wrap(async (req, res) => res.json({ orders: await service.store.orders(customerId) })));
  router.get('/orders/:id', wrap(async (req, res) => {
    const order = await service.store.order(req.params.id, customerId);
    if (!order) throw httpError(404, 'Order not found.'); res.json({ order });
  }));
  router.get('/products', wrap(async (req, res) => {
    if (req.query.q !== undefined && !text(req.query.q, 100)) throw httpError(400, 'Invalid product query.');
    res.json({ products: await service.store.products(req.query.q || '') });
  }));
  router.get('/tickets', wrap(async (req, res) => res.json({ tickets: await service.store.tickets(customerId) })));
  router.post('/chat', wrap(async (req, res) => {
    const { conversationId = 'local-demo', message, channel = 'web' } = req.body || {};
    if (!text(message, 4000) || !text(conversationId, 128) || !text(channel, 32)) throw httpError(400, 'Invalid chat payload.');
    // Identity always comes from server configuration, never the request or model.
    res.json(await service.chat({ conversationId, customerId, message: message.trim(), channel }));
  }));
  router.get('/conversations/:id/messages', wrap(async (req, res) => {
    try {
      const state = await service.store.conversation(req.params.id, customerId);
      res.json({ conversationId: state.id, status: state.status, messages: state.messages, escalation: state.escalation });
    } catch (error) {
      if (error.status !== 404) throw error;
      res.json({ conversationId: req.params.id, status: 'ai', messages: [], escalation: null });
    }
  }));
  return router;
}
