import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createConversationStore } from '../src/services/conversationStore.js';

describe('chat API', () => {
  let app;
  let store;

  beforeEach(() => {
    store = createConversationStore();
    app = createApp({ store });
  });

  it('responds to health checks', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', service: 'support-loop-backend' });
  });

  it('returns 400 when message is missing', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ conversationId: 'local-demo' })
      .expect(400);

    expect(response.body).toEqual({ error: 'Message is required.' });
  });

  it('returns 400 when message is blank', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ conversationId: 'local-demo', message: '   ' })
      .expect(400);

    expect(response.body).toEqual({ error: 'Message is required.' });
  });

  it('stores user and assistant messages for a chat request', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ conversationId: 'local-demo', message: 'Ou est ma commande ?', channel: 'web' })
      .expect(200);

    expect(response.body.conversationId).toBe('local-demo');
    expect(response.body.message.role).toBe('assistant');
    expect(response.body.message.metadata.source).toBe('mock-agent');
    expect(response.body.history).toHaveLength(2);
    expect(response.body.history[0].role).toBe('user');
    expect(response.body.history[1].role).toBe('assistant');
  });

  it('returns history for one conversation', async () => {
    await request(app)
      .post('/api/chat')
      .send({ conversationId: 'local-demo', message: 'Bonjour', channel: 'web' })
      .expect(200);

    const response = await request(app)
      .get('/api/conversations/local-demo/messages')
      .expect(200);

    expect(response.body.conversationId).toBe('local-demo');
    expect(response.body.messages).toHaveLength(2);
  });
});
