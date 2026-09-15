import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createPostgresSupportStore } from '../src/services/supportStore.js';
import { createSupportService } from '../src/services/supportService.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL support persistence', () => {
  it('persists handoff, tools, human messages and ticket status across store instances', async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const id = `test-${randomUUID()}`;
    let store = createPostgresSupportStore(process.env.TEST_DATABASE_URL);
    try {
      for (const file of ['support-schema.sql', 'seed.sql']) {
        await pool.query(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
      }
      let service = createSupportService({ store });
      await service.chat({ conversationId: id, customerId: 'customer-demo', message: 'Stock PRD-001', channel: 'test' });
      await service.chat({ conversationId: id, customerId: 'customer-demo', message: 'Je veux un humain', channel: 'test' });
      await store.close();
      store = createPostgresSupportStore(process.env.TEST_DATABASE_URL);
      service = createSupportService({ store });
      let conversation = await store.conversation(id, 'customer-demo');
      expect(conversation.status).toBe('waiting');
      expect(conversation.traces[0].name).toBe('check_stock');
      await service.action(id, 'claim', { agentName: 'Test Support' });
      await service.action(id, 'reply', { agentName: 'Test Support', content: 'Reponse humaine persistante.' });
      conversation = await store.conversation(id, 'customer-demo');
      expect(conversation.messages.at(-1).role).toBe('human');
      await service.action(id, 'resolve', { agentName: 'Test Support' });
      const tickets = await store.tickets('customer-demo');
      expect(tickets.find((ticket) => ticket.conversation_id === id).status).toBe('resolved');
      expect(await store.order('ORD-2001', 'customer-demo')).toBeUndefined();
      const failedId = `test-rollback-${randomUUID()}`;
      await expect(store.withConversation(failedId, 'customer-demo', async (state, repo) => {
        await repo.createTicket('Rollback test'); throw new Error('abort');
      })).rejects.toThrow('abort');
      await expect(store.conversation(failedId)).rejects.toMatchObject({ status: 404 });
    } finally {
      await pool.query('DELETE FROM tickets WHERE conversation_id = $1', [id]);
      await pool.query('DELETE FROM support_conversations WHERE id = $1', [id]);
      await store.close(); await pool.end();
    }
  });
});
