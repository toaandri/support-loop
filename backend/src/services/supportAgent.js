import { normalize, supportToolDefinitions } from './agentTools.js';

export function escalationReason(question) {
  const text = normalize(question);
  if (/humain|human|conseiller|personne reelle|parler.*agent/.test(text)) return 'customer-request';
  if (/rembours|refund|supprim.*compte|delete.*account|jurid|legal|avocat|lawyer|annul|cancel|chang.*adress|modifi.*adress/.test(text)) return 'sensitive-action';
  if (/furieux|scandale|inadmissible|arnaque|furious|unacceptable/.test(text)) return 'customer-distress';
  return null;
}

export async function generateDemoSupportResponse(question, { execute }) {
  const text = normalize(question);
  if (/ticket|incident|probleme|panne|reclamation|problem|complaint/.test(text)) {
    const ticket = await execute('create_ticket', {});
    return { content: `Your ticket ${ticket.id} is open. An advisor will review your request.`,
      confidence: 0.95, needsHuman: true, reason: 'ticket-created' };
  }
  if (/commande|order|colis|suivi|tracking/.test(text)) {
    const orderId = question.toUpperCase().match(/ORD-\d+/)?.[0];
    const orders = orderId ? [await execute('get_order', { orderId })] : await execute('get_customer_orders', {});
    const labels = { shipped: 'shipped', processing: 'processing', delivered: 'delivered', cancelled: 'cancelled' };
    return { content: orders.length ? orders.map((order) =>
      `${order.id} : ${labels[order.status] || order.status}.${order.tracking_number ? ` Tracking: ${order.tracking_number}.` : ''}`).join('\n') :
      'You have no orders.', confidence: 0.98, needsHuman: false };
  }
  if (/stock|produit|product|casque|clavier|disponib/.test(text)) {
    const productId = question.toUpperCase().match(/PRD-\d+/)?.[0];
    const products = productId ? [await execute('check_stock', { productId })] :
      await execute('search_product', { query: /casque/.test(text) ? 'casque' : /clavier/.test(text) ? 'clavier' : 'PRD' });
    return { content: products.length ? products.map((product) =>
      `${product.name} (${product.id}) : ${product.stock > 0 ? `${product.stock} in stock` : 'unavailable'}.`).join('\n') :
      'No matching product.', confidence: products.length ? 0.97 : 0.4, needsHuman: !products.length };
  }
  if (/retour|livraison|delai|delivery|shipping|return/.test(text)) {
    const sources = await execute('search_knowledge_base', { query: question });
    return { content: sources.length ? `${sources[0].content} [1]` : 'No relevant knowledge.',
      confidence: sources.length ? 0.9 : 0.3, needsHuman: !sources.length };
  }
  if (/^(bonjour|salut|hello|merci)[!.\s]*$/.test(text)) {
    return { content: 'Hello. How can I help?', confidence: 0.95, needsHuman: false };
  }
  const learned = await execute('search_knowledge_base', { query: question });
  if (learned.length) return { content: `${learned[0].content} [1]`, confidence: 0.9, needsHuman: false };
  return { content: 'Your request needs review by an advisor.', confidence: 0.3,
    needsHuman: true, reason: 'missing-knowledge' };
}

export function createSupportAgent(provider) {
  return async (question, { history, execute }) => {
    if (!provider) return generateDemoSupportResponse(question, { execute });
    return provider.runTools({ question, history, tools: supportToolDefinitions, execute });
  };
}
