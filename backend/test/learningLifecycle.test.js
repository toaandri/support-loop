import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemorySupportStore } from '../src/services/supportStore.js';
import { createSupportService } from '../src/services/supportService.js';

function setup(options = {}) {
  const store = createMemorySupportStore();
  const service = createSupportService({ store, ...options });
  return { store, service, app: createApp({ supportService: service }) };
}
async function resolve(service, id = 'learning') {
  await service.chat({ conversationId: id, customerId: 'customer-demo', message: 'Comment fonctionne la garantie atelier ?', channel: 'web' });
  await service.action(id, 'claim', { agentName: 'Support' });
  await service.action(id, 'reply', { agentName: 'Support', content: 'La garantie atelier dure deux ans, avec le justificatif d’achat.' });
  await service.action(id, 'resolve', { agentName: 'Support' });
}
describe('Complete learning lifecycle', () => {
  it('learns without a paid provider, only reuses validated knowledge, and preserves human safeguards', async () => {
    const { service, store } = setup();
    await resolve(service);
    const [entry] = await store.listLearnedKnowledge();
    expect(entry.status).toBe('new');
    const before = await service.chat({ conversationId: 'before', customerId: 'customer-demo', message: entry.question, channel: 'test' });
    expect(before.status).toBe('waiting');
    await service.reviewKnowledge(entry.id);
    await service.approveKnowledge(entry.id, { reviewedBy: 'Support' });
    const after = await service.chat({ conversationId: 'after', customerId: 'customer-demo', message: entry.question, channel: 'test' });
    expect(after.status).toBe('ai');
    expect(after.message.content).toContain('deux ans');
    expect(after.message.metadata.sources[0].source).toContain('learned/');
    const sensitive = await service.chat({ conversationId: 'sensitive', customerId: 'customer-demo', message: 'Remboursez la garantie atelier', channel: 'test' });
    expect(sensitive.escalation.reason).toBe('sensitive-action');
    await expect(service.editKnowledge(entry.id, { human_answer: 'changed' })).rejects.toMatchObject({ status: 409 });
    await service.retryLearning('learning');
    expect(await store.listLearnedKnowledge()).toHaveLength(1);
  });

  it('retains the human answer when extraction fails', async () => {
    const { service, store } = setup({ provider: { extractKnowledge: vi.fn().mockRejectedValue(new Error('offline')) },
      agent: vi.fn().mockResolvedValue({ content: 'Transfer', confidence: .1, needsHuman: true }) });
    await resolve(service);
    const [entry] = await store.listLearnedKnowledge();
    expect(entry.human_answer).toContain('deux ans');
    expect(entry.extracted_rule).toBeNull();
    expect((await store.conversation('learning')).status).toBe('resolved');
  });

  it('retries failed indexing without activating partial knowledge', async () => {
    const provider = { embeddingModel: 'test', embed: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([[1]]) };
    const knowledgeStore = { replaceDocument: vi.fn().mockResolvedValue(undefined) };
    const { service, store } = setup();
    await resolve(service);
    const [entry] = await store.listLearnedKnowledge();
    await expect(service.approveKnowledge(entry.id, { providerRef: provider, knowledgeStoreRef: knowledgeStore })).rejects.toThrow('offline');
    expect((await store.getLearnedKnowledge(entry.id)).status).toBe('approved');
    const result = await service.approveKnowledge(entry.id, { providerRef: provider, knowledgeStoreRef: knowledgeStore });
    expect(result.status).toBe('active');
    expect(knowledgeStore.replaceDocument).toHaveBeenCalledTimes(1);
  });

  it('validates structured rules and rejects edits after approval', async () => {
    const { app, service, store } = setup();
    await resolve(service);
    const [entry] = await store.listLearnedKnowledge();
    const url = `/api/support/knowledge/${entry.id}`;
    await request(app).patch(url).send({ extracted_rule: ['bad'] }).expect(400);
    await request(app).patch(url).send({ extracted_rule: { intent: 'missing-fields' } }).expect(400);
    await request(app).patch(url).send({ extracted_rule: null }).expect(200);
    await request(app).post(`${url}/review`).expect(200);
    await request(app).post(`${url}/approve`).expect(200);
    await request(app).patch(url).send({ human_answer: 'Change after approval' }).expect(409);
  });

  it('keeps historical escalations in analytics after resolution', async () => {
    const { service, store } = setup();
    await resolve(service);
    const stats = await store.stats();
    expect(stats.conversations_escalated).toBe(1);
    expect(stats.conversations_waiting).toBe(0);
    expect(stats.conversations_resolved).toBe(1);
    expect(stats.daily.at(-1).conversations).toBe(1);
    expect(stats.daily.at(-1).escalations).toBe(1);
    expect(stats.daily.at(-1).resolutions).toBe(1);
  });
});
