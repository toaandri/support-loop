import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { chunkText } from '../src/services/documentIngestion.js';
import { createRagAgent } from '../src/services/ragAgent.js';
import { createOpenAIProvider } from '../src/services/openaiProvider.js';

describe('document chunking', () => {
  it('normalizes text and preserves coverage with bounded overlapping chunks', () => {
    const text = 'a'.repeat(3000);
    const chunks = chunkText(text);
    expect(chunks.map((chunk) => chunk.length)).toEqual([1200, 1200, 1000]);
    expect(chunkText('\uFEFF  Bonjour\r\n retour  ')).toEqual(['Bonjour\n retour']);
    expect(chunkText('  ')).toEqual([]);
    expect(() => chunkText('test', { size: 10, overlap: 10 })).toThrow();
  });
});

describe('RAG chat', () => {
  const source = { id: 'chunk-1', source: 'returns.md', chunkIndex: 0,
    content: 'Retour sous 14 jours.', similarity: 0.8 };

  function setup(sources) {
    const provider = { embeddingModel: 'test-model', embed: vi.fn().mockResolvedValue([[1]]),
      answer: vi.fn().mockResolvedValue('Retour sous 14 jours [1].') };
    const knowledgeStore = { search: vi.fn().mockResolvedValue(sources) };
    return { provider, knowledgeStore, generateResponse: createRagAgent({ provider, knowledgeStore }) };
  }

  it('returns retrieved excerpts and passes prior conversation to the provider', async () => {
    const deps = setup([source]);
    const app = createApp(deps);
    await request(app).post('/api/chat').send({ conversationId: 'a', message: 'Retour ?' }).expect(200);
    const response = await request(app).post('/api/chat')
      .send({ conversationId: 'a', message: 'Combien de jours ?' }).expect(200);
    expect(response.body.history).toHaveLength(4);
    expect(response.body.message.metadata.sources[0]).toMatchObject({ source: 'returns.md', citation: 1 });
    expect(response.body.message.metadata.confidence).toBeUndefined();
    expect(deps.provider.answer.mock.calls[1][0].history).toHaveLength(2);
    expect(deps.knowledgeStore.search).toHaveBeenCalledWith([1], { model: 'test-model', minSimilarity: 0.35, limit: 4 });
    const other = await request(app).get('/api/conversations/b/messages').expect(200);
    expect(other.body.messages).toEqual([]);
  });

  it('does not call generation when no knowledge is found', async () => {
    const deps = setup([]);
    const response = await deps.generateResponse('Stock ?');
    expect(response.category).toBe('no-knowledge');
    expect(response.sources).toEqual([]);
    expect(deps.provider.answer).not.toHaveBeenCalled();
  });

  it('does not persist a partial turn or expose provider errors', async () => {
    const deps = setup([source]);
    deps.provider.embed.mockRejectedValue(new Error('secret provider details'));
    const app = createApp(deps);
    const response = await request(app).post('/api/chat').send({ message: 'Retour ?' }).expect(500);
    expect(response.body.error).toBe('Unexpected backend error.');
    const history = await request(app).get('/api/conversations/local-demo/messages');
    expect(history.body.messages).toEqual([]);
  });

  it.each([{ conversationId: {} }, { channel: [] }, { message: 'a'.repeat(4001) }])(
    'rejects invalid payloads before invoking the agent: %j', async (payload) => {
      const deps = setup([]);
      await request(createApp(deps)).post('/api/chat').send({ message: 'Hello', ...payload }).expect(400);
      expect(deps.provider.embed).not.toHaveBeenCalled();
    });
});

describe('OpenAI provider', () => {
  it('executes function calls and sends their results back before returning a structured answer', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [
        { type: 'function_call', name: 'get_order', call_id: 'call-1', arguments: '{"orderId":"ORD-1001"}' }
      ] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed', output: [
        { content: [{ type: 'output_text', text: JSON.stringify({ content: 'Commande expediee.', confidence: 0.95,
          needsHuman: false, reason: '' }) }] }
      ] }) });
    const execute = vi.fn().mockResolvedValue({ id: 'ORD-1001', status: 'shipped' });
    const provider = createOpenAIProvider({ apiKey: 'test', fetchImpl });
    const answer = await provider.runTools({ question: 'Commande ?', history: [], tools: [], execute });
    expect(answer.content).toBe('Commande expediee.');
    expect(execute).toHaveBeenCalledWith('get_order', { orderId: 'ORD-1001' });
    const secondRequest = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(secondRequest.input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call-1' });
    expect(JSON.parse(secondRequest.input.at(-1).output).status).toBe('shipped');
    expect(secondRequest.text.format.type).toBe('json_schema');
  });

  it('orders embedding results by their input index and requests fixed dimensions', async () => {
    const vector = Array(1536).fill(0.1);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ data: [{ index: 1, embedding: vector }, { index: 0, embedding: vector }] }) });
    const provider = createOpenAIProvider({ apiKey: 'test', fetchImpl });
    expect(await provider.embed(['a', 'b'])).toEqual([vector, vector]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).dimensions).toBe(1536);
  });

  it('rejects malformed vectors and failed requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [1] }] }) });
    const provider = createOpenAIProvider({ apiKey: 'test', fetchImpl });
    await expect(provider.embed(['a'])).rejects.toThrow('Invalid embedding');
    fetchImpl.mockResolvedValue({ ok: false, status: 429 });
    await expect(provider.embed(['a'])).rejects.toThrow('(429)');
  });

  it('extracts text from raw Responses output and rejects incomplete output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed',
      output: [{ type: 'reasoning' }, { content: [{ type: 'output_text', text: 'Answer [1]' }] }] }) });
    const provider = createOpenAIProvider({ apiKey: 'test', fetchImpl });
    expect(await provider.answer({ question: 'Question', history: [], sources: [] })).toBe('Answer [1]');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).store).toBe(false);
    fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) });
    await expect(provider.answer({ question: '?', history: [], sources: [] })).rejects.toThrow('Incomplete');
  });
});
