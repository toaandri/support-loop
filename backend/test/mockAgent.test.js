import { describe, expect, it } from 'vitest';
import { createConversationStore } from '../src/services/conversationStore.js';
import { generateMockResponse } from '../src/services/mockAgent.js';

describe('generateMockResponse', () => {
  it('returns an order-status response for delivery messages', () => {
    const response = generateMockResponse('Ou est ma commande ?');

    expect(response.source).toBe('mock-agent');
    expect(response.category).toBe('order-status');
    expect(response.confidence).toBeGreaterThan(0.7);
    expect(response.content).toContain('commande');
  });

  it('returns a policy response for refund messages', () => {
    const response = generateMockResponse('Je veux un remboursement');

    expect(response.category).toBe('policy');
    expect(response.content).toContain('retour');
  });

  it('returns a product response for stock messages', () => {
    const response = generateMockResponse('Ce produit est disponible en stock ?');

    expect(response.category).toBe('product');
    expect(response.content).toContain('produit');
  });

  it('returns a generic response for unknown messages', () => {
    const response = generateMockResponse('Bonjour');

    expect(response.category).toBe('generic');
    expect(response.content).toContain('support');
  });
});

describe('createConversationStore', () => {
  it('stores messages by conversation id and can clear them', () => {
    const store = createConversationStore();

    const message = store.addMessage('local-demo', {
      role: 'user',
      content: 'Bonjour'
    });

    expect(message.id).toBeTruthy();
    expect(message.createdAt).toBeTruthy();
    expect(store.getMessages('local-demo')).toEqual([message]);
    expect(store.getMessages('other-demo')).toEqual([]);

    store.clear();

    expect(store.getMessages('local-demo')).toEqual([]);
  });
});
