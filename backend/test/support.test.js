import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemorySupportStore } from '../src/services/supportStore.js';
import { createSupportService } from '../src/services/supportService.js';
import { createToolExecutor } from '../src/services/agentTools.js';

function setup(options = {}) {
  const store = createMemorySupportStore();
  const service = createSupportService({ store, ...options });
  return { store, service, app: createApp({ supportService: service, access: options.access }) };
}
const post = (app, message, id = 'test-chat') => request(app).post('/api/chat')
  .send({ conversationId: id, message, channel: 'web' });
const action = (app, name, content) => request(app).post(`/api/support/conversations/test-chat/${name}`).send({ content });

describe('V3 customer data', () => {
  it('lists only authenticated customer orders and ignores supplied customer identity', async () => {
    const { app } = setup();
    const response = await request(app).get('/api/orders').expect(200);
    expect(response.body.orders.map((row) => row.id)).toEqual(['ORD-1001', 'ORD-1002']);
    await request(app).get('/api/orders/ORD-2001').expect(404);
    const chat = await request(app).post('/api/chat')
      .send({ message: 'Mes commandes', customerId: 'customer-other' }).expect(200);
    expect(chat.body.message.content).toContain('ORD-1001');
    expect(chat.body.message.content).not.toContain('ORD-2001');
  });
  it('requires distinct customer and support credentials outside demo mode', async () => {
    const { app } = setup({ access: { demoMode: false, customerKey: 'customer-secret', adminKey: 'admin-secret' } });
    await request(app).get('/api/orders').expect(401);
    await request(app).get('/api/orders').set('x-customer-key', 'customer-secret').expect(200);
    await request(app).get('/api/support/conversations').set('x-support-key', 'customer-secret').expect(401);
    await request(app).get('/api/support/conversations').set('x-support-key', 'admin-secret').expect(200);
  });
  it('does not permit ownership changes on an existing conversation', async () => {
    const { store, service } = setup();
    await service.chat({ conversationId: 'private', customerId: 'customer-other', message: 'Bonjour', channel: 'web' });
    await expect(service.chat({ conversationId: 'private', customerId: 'customer-demo', message: 'Bonjour' })).rejects.toMatchObject({ status: 404 });
    await expect(store.conversation('private', 'customer-demo')).rejects.toMatchObject({ status: 404 });
  });
});

describe('V4 bounded tools', () => {
  it('reads stock and logs successful tool execution for the human context', async () => {
    const { app } = setup();
    const response = await post(app, 'Stock PRD-002 ?').expect(200);
    expect(response.body.status).toBe('ai');
    expect(response.body.message.content).toContain('indisponible');
    const detail = await request(app).get('/api/support/conversations/test-chat').expect(200);
    expect(detail.body.traces[0]).toMatchObject({ name: 'check_stock', status: 'success', result: { stock: 0 } });
  });
  it('opens exactly one ticket for a conversation and transfers the incident', async () => {
    const { app } = setup();
    const response = await post(app, 'Ouvre un ticket pour mon probleme').expect(200);
    expect(response.body.status).toBe('waiting');
    await post(app, 'Encore un ticket').expect(200);
    const tickets = await request(app).get('/api/tickets').expect(200);
    expect(tickets.body.tickets).toHaveLength(1);
  });
  it('rejects unlisted tools, invalid arguments and unauthorized ticket creation', async () => {
    const { store } = setup();
    await store.withConversation('x', 'customer-demo', async (state, repo) => {
      state.messages.push({ role: 'user', content: 'Bonjour' });
      const tools = createToolExecutor({ state, repo });
      await expect(tools.execute('send_email', {})).rejects.toThrow('not allowed');
      await expect(tools.execute('get_order', { orderId: 'ORD-1001', customerId: 'customer-other' })).rejects.toThrow('Invalid tool');
      await expect(tools.execute('create_ticket', {})).rejects.toThrow('not authorized');
      await expect(tools.execute('get_order', { orderId: 'ORD-2001' })).rejects.toThrow('not found');
    });
  });
});

describe('V5 human handoff', () => {
  it('rejects confident model answers with no verified tool evidence', async () => {
    const { app } = setup({ provider: {}, agent: vi.fn().mockResolvedValue({
      content: 'Une politique inventee.', confidence: 0.99, needsHuman: false, reason: ''
    }) });
    const response = await post(app, 'Question de politique').expect(200);
    expect(response.body.status).toBe('waiting');
    expect(response.body.escalation.reason).toBe('missing-evidence');
    expect(response.body.message.content).not.toContain('inventee');
  });
  it('escalates sensitive requests before model or tool execution', async () => {
    const agent = vi.fn(); const { app } = setup({ agent });
    const response = await post(app, 'Rembourse ma commande').expect(200);
    expect(response.body.status).toBe('waiting');
    expect(response.body.escalation.reason).toBe('sensitive-action');
    expect(agent).not.toHaveBeenCalled();
  });
  it('supports claim, human reply, paused AI, resume and resolution', async () => {
    const agent = vi.fn().mockResolvedValue({ content: 'Bonjour', confidence: 0.99, needsHuman: false });
    const { app } = setup({ agent });
    await post(app, 'Je veux un humain').expect(200);
    await action(app, 'reply', 'Bonjour').expect(409);
    await action(app, 'claim').expect(200);
    await action(app, 'claim').expect(409);
    const pending = await post(app, 'Voici une precision').expect(200);
    expect(pending.body.message).toBeNull(); expect(pending.body.status).toBe('human');
    expect(agent).not.toHaveBeenCalled();
    await action(app, 'reply', 'Je vous aide.').expect(200);
    let history = await request(app).get('/api/conversations/test-chat/messages').expect(200);
    expect(history.body.messages.at(-1)).toMatchObject({ role: 'human', content: 'Je vous aide.' });
    await action(app, 'resume').expect(200);
    await post(app, 'Bonjour').expect(200); expect(agent).toHaveBeenCalledTimes(1);
    await post(app, 'Un humain svp').expect(200);
    await action(app, 'claim').expect(200);
    await action(app, 'resolve').expect(200);
    history = await request(app).get('/api/conversations/test-chat/messages');
    expect(history.body.status).toBe('resolved');
    const tickets = await request(app).get('/api/tickets'); expect(tickets.body.tickets[0].status).toBe('resolved');
  });
  it('honors the configured confidence threshold', async () => {
    const { app } = setup();
    await request(app).patch('/api/support/settings').send({ threshold: 0.99 }).expect(200);
    const response = await post(app, 'Stock PRD-001').expect(200);
    expect(response.body.escalation.reason).toBe('low-confidence');
    expect(response.body.escalation.confidence).toBe(0.97);
    await request(app).patch('/api/support/settings').send({ threshold: 1.1 }).expect(400);
  });
  it('escalates missing knowledge and tool errors without leaking internals', async () => {
    const { app } = setup();
    expect((await post(app, 'Quelle est la garantie apres une reparation ?')).body.status).toBe('waiting');
    const response = await post(app, 'Commande ORD-2001', 'tool-error').expect(200);
    expect(response.body.escalation.reason).toBe('tool-or-provider-error');
    expect(response.body.message.content).not.toContain('Order not found');
  });
  it('serializes simultaneous messages to preserve complete turns', async () => {
    const { app } = setup();
    await Promise.all([post(app, 'Bonjour'), post(app, 'Mes commandes')]);
    const history = await request(app).get('/api/conversations/test-chat/messages');
    expect(history.body.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
  it('allows only one claim for simultaneous human requests', async () => {
    const { service } = setup();
    await service.chat({ conversationId: 'claim-race', customerId: 'customer-demo', message: 'Humain', channel: 'web' });
    const results = await Promise.allSettled([
      service.action('claim-race', 'claim', { agentName: 'Alice' }),
      service.action('claim-race', 'claim', { agentName: 'Bob' })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find((result) => result.status === 'fulfilled').value.assignedTo;
    await expect(service.action('claim-race', 'reply', { agentName: winner === 'Alice' ? 'Bob' : 'Alice', content: 'Hello' }))
      .rejects.toMatchObject({ status: 409 });
  });
});
