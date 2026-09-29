import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemorySupportStore } from '../src/services/supportStore.js';
import { createSupportService } from '../src/services/supportService.js';

function setup(options = {}) {
  const store = createMemorySupportStore();
  const service = createSupportService({ store, ...options });
  return { store, service, app: createApp({ supportService: service, access: options.access }) };
}
const post = (app, message, id = 'test-learn') => request(app).post('/api/chat')
  .send({ conversationId: id, message, channel: 'web' });
const supportAction = (app, action, content) =>
  request(app).post(`/api/support/conversations/test-learn/${action}`).send({ content });

// ─── V6 Learning Loop ────────────────────────────────────────────────────────
describe('V6 learning loop', () => {
  it('creates a learned_knowledge entry after resolve when provider supports extraction', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({
      intent: 'cancel_shipped_order',
      condition: 'order_status = shipped',
      resolution: 'return_after_delivery',
      notes: null
    });
    const agent = vi.fn().mockResolvedValue({ content: 'Je transfère.', confidence: 0.2, needsHuman: true });
    const { app, store } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Je veux annuler ma commande expediee');
    await supportAction(app, 'claim');
    await supportAction(app, 'reply', 'Une commande expediee ne peut pas etre annulee. Retour sous 14 jours.');
    await supportAction(app, 'resolve');

    // extraction runs via setImmediate — wait one tick
    await new Promise((resolve) => setImmediate(resolve));

    const knowledge = await store.listLearnedKnowledge();
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].status).toBe('new');
    expect(knowledge[0].extracted_rule.intent).toBe('cancel_shipped_order');
    expect(knowledge[0].human_answer).toContain('14 jours');
  });

  it('does not create a learned_knowledge entry if provider has no extractKnowledge', async () => {
    const agent = vi.fn().mockResolvedValue({ content: 'Transfert.', confidence: 0.2, needsHuman: true });
    const { app, store } = setup({ agent, provider: {} });

    await post(app, 'Probleme de livraison');
    await supportAction(app, 'claim');
    await supportAction(app, 'reply', 'Nous allons investiguer.');
    await supportAction(app, 'resolve');
    await new Promise((resolve) => setImmediate(resolve));

    const knowledge = await store.listLearnedKnowledge();
    expect(knowledge).toHaveLength(0);
  });

  it('lists knowledge via GET /api/support/knowledge', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({ intent: 'test', condition: 'x', resolution: 'y', notes: null });
    const agent = vi.fn().mockResolvedValue({ content: 'Transfert.', confidence: 0.2, needsHuman: true });
    const { app } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Question test');
    await supportAction(app, 'claim');
    await supportAction(app, 'reply', 'Reponse humaine.');
    await supportAction(app, 'resolve');
    await new Promise((resolve) => setImmediate(resolve));

    const res = await request(app).get('/api/support/knowledge').expect(200);
    expect(res.body.knowledge).toHaveLength(1);
  });

  it('filters knowledge by status', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({ intent: 'test', condition: 'x', resolution: 'y', notes: null });
    const agent = vi.fn().mockResolvedValue({ content: 'Transfert.', confidence: 0.2, needsHuman: true });
    const { app } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Question test', 'conv-filter');
    await request(app).post('/api/support/conversations/conv-filter/claim').send();
    await request(app).post('/api/support/conversations/conv-filter/reply').send({ content: 'Reponse.' });
    await request(app).post('/api/support/conversations/conv-filter/resolve').send();
    await new Promise((resolve) => setImmediate(resolve));

    const newRes = await request(app).get('/api/support/knowledge?status=new').expect(200);
    expect(newRes.body.knowledge).toHaveLength(1);

    const activeRes = await request(app).get('/api/support/knowledge?status=active').expect(200);
    expect(activeRes.body.knowledge).toHaveLength(0);

    await request(app).get('/api/support/knowledge?status=invalid').expect(400);
  });

  it('approves knowledge without indexing when no knowledgeStore', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({ intent: 'test', condition: 'x', resolution: 'y', notes: null });
    const agent = vi.fn().mockResolvedValue({ content: 'Transfert.', confidence: 0.2, needsHuman: true });
    const { app, store } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Question approve', 'conv-approve');
    await request(app).post('/api/support/conversations/conv-approve/claim').send();
    await request(app).post('/api/support/conversations/conv-approve/reply').send({ content: 'Reponse humaine.' });
    await request(app).post('/api/support/conversations/conv-approve/resolve').send();
    await new Promise((resolve) => setImmediate(resolve));

    const knowledge = await store.listLearnedKnowledge();
    const id = knowledge[0].id;

    const res = await request(app).post(`/api/support/knowledge/${id}/approve`).expect(200);
    // No knowledgeStore so stays 'approved', not 'active'
    expect(res.body.status).toBe('approved');
  });

  it('rejects knowledge', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({ intent: 'test', condition: 'x', resolution: 'y', notes: null });
    const agent = vi.fn().mockResolvedValue({ content: 'Transfert.', confidence: 0.2, needsHuman: true });
    const { app, store } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Question reject', 'conv-reject');
    await request(app).post('/api/support/conversations/conv-reject/claim').send();
    await request(app).post('/api/support/conversations/conv-reject/reply').send({ content: 'Reponse.' });
    await request(app).post('/api/support/conversations/conv-reject/resolve').send();
    await new Promise((resolve) => setImmediate(resolve));

    const knowledge = await store.listLearnedKnowledge();
    const id = knowledge[0].id;

    const res = await request(app).post(`/api/support/knowledge/${id}/reject`).expect(200);
    expect(res.body.status).toBe('rejected');

    // Cannot approve or reject again
    await request(app).post(`/api/support/knowledge/${id}/approve`).expect(409);
  });

  it('edits knowledge human_answer and extracted_rule', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({ intent: 'original', condition: 'c', resolution: 'r', notes: null });
    const agent = vi.fn().mockResolvedValue({ content: 'Transfert.', confidence: 0.2, needsHuman: true });
    const { app, store } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Question edit', 'conv-edit');
    await request(app).post('/api/support/conversations/conv-edit/claim').send();
    await request(app).post('/api/support/conversations/conv-edit/reply').send({ content: 'Premiere reponse.' });
    await request(app).post('/api/support/conversations/conv-edit/resolve').send();
    await new Promise((resolve) => setImmediate(resolve));

    const knowledge = await store.listLearnedKnowledge();
    const id = knowledge[0].id;

    const patched = await request(app).patch(`/api/support/knowledge/${id}`)
      .send({ human_answer: 'Reponse corrigee.', extracted_rule: { intent: 'corrected', condition: 'c2', resolution: 'r2', notes: null } })
      .expect(200);
    expect(patched.body.human_answer).toBe('Reponse corrigee.');
    expect(patched.body.extracted_rule.intent).toBe('corrected');
  });
});

// ─── V7 Dashboard stats ───────────────────────────────────────────────────────
describe('V7 dashboard stats', () => {
  it('returns zero stats for an empty store', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/support/stats').expect(200);
    expect(Number(res.body.conversations_total)).toBe(0);
    expect(Number(res.body.tickets_open)).toBe(0);
    expect(Number(res.body.learned_knowledge_total)).toBe(0);
  });

  it('counts conversations by status correctly', async () => {
    const agent = vi.fn().mockResolvedValue({ content: 'Bonjour', confidence: 0.99, needsHuman: false });
    const { app } = setup({ agent });

    // One auto-resolved AI conversation
    await post(app, 'Bonjour', 'conv-ai');
    // One escalated and resolved
    const agentEscalate = vi.fn().mockResolvedValue({ content: 'T.', confidence: 0.2, needsHuman: true });
    const { app: app2 } = setup({ agent: agentEscalate });
    await request(app2).post('/api/chat').send({ conversationId: 'conv-esc', message: 'Escalade', channel: 'web' });
    await request(app2).post('/api/support/conversations/conv-esc/claim').send();
    await request(app2).post('/api/support/conversations/conv-esc/resolve').send();

    const res2 = await request(app2).get('/api/support/stats').expect(200);
    expect(Number(res2.body.conversations_total)).toBe(1);
    expect(Number(res2.body.conversations_resolved)).toBe(1);
    expect(Number(res2.body.tickets_resolved)).toBe(1);
  });

  it('counts learned_knowledge_pending_review', async () => {
    const extractKnowledge = vi.fn().mockResolvedValue({ intent: 'i', condition: 'c', resolution: 'r', notes: null });
    const agent = vi.fn().mockResolvedValue({ content: 'T.', confidence: 0.2, needsHuman: true });
    const { app } = setup({ agent, provider: { extractKnowledge } });

    await post(app, 'Question stats', 'conv-stats');
    await request(app).post('/api/support/conversations/conv-stats/claim').send();
    await request(app).post('/api/support/conversations/conv-stats/reply').send({ content: 'Rep.' });
    await request(app).post('/api/support/conversations/conv-stats/resolve').send();
    await new Promise((resolve) => setImmediate(resolve));

    const res = await request(app).get('/api/support/stats').expect(200);
    expect(Number(res.body.learned_knowledge_total)).toBe(1);
    expect(Number(res.body.learned_knowledge_pending_review)).toBe(1);
    expect(Number(res.body.learned_knowledge_active)).toBe(0);
  });
});

// ─── V8 Rate limiting ─────────────────────────────────────────────────────────
describe('V8 rate limiting', () => {
  it('returns 429 after exceeding the chat rate limit', async () => {
    const agent = vi.fn().mockResolvedValue({ content: 'ok', confidence: 0.99, needsHuman: false });
    const store = createMemorySupportStore();
    const service = createSupportService({ store, agent });
    // Set a very low limit for testing
    const { rateLimit } = await import('../src/middleware/rateLimit.js');
    const express = (await import('express')).default;
    const { createSupportRouter } = await import('../src/routes/supportRoutes.js');
    const { requestLogger } = await import('../src/middleware/logger.js');
    const app = express();
    app.use(express.json());
    app.use(requestLogger);
    app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 2 }));
    app.use('/api', createSupportRouter(service, {}));
    app.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.message }); });

    await request(app).post('/api/chat').send({ conversationId: 'rl', message: 'msg1' }).expect(200);
    await request(app).post('/api/chat').send({ conversationId: 'rl', message: 'msg2' }).expect(200);
    await request(app).post('/api/chat').send({ conversationId: 'rl', message: 'msg3' }).expect(429);
  });
});
