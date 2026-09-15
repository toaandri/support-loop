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
  if (/ticket|incident|probleme|panne|reclamation/.test(text)) {
    const ticket = await execute('create_ticket', {});
    return { content: `Votre ticket ${ticket.id} est ouvert. Un conseiller va examiner votre demande.`,
      confidence: 0.95, needsHuman: true, reason: 'ticket-created' };
  }
  if (/commande|order|colis|suivi|tracking/.test(text)) {
    const orderId = question.toUpperCase().match(/ORD-\d+/)?.[0];
    const orders = orderId ? [await execute('get_order', { orderId })] : await execute('get_customer_orders', {});
    const labels = { shipped: 'expediee', processing: 'en preparation', delivered: 'livree', cancelled: 'annulee' };
    return { content: orders.length ? orders.map((order) =>
      `${order.id} : ${labels[order.status] || order.status}.${order.tracking_number ? ` Suivi : ${order.tracking_number}.` : ''}`).join('\n') :
      'Vous ne disposez pas de commande.', confidence: 0.98, needsHuman: false };
  }
  if (/stock|produit|product|casque|clavier|disponib/.test(text)) {
    const productId = question.toUpperCase().match(/PRD-\d+/)?.[0];
    const products = productId ? [await execute('check_stock', { productId })] :
      await execute('search_product', { query: /casque/.test(text) ? 'casque' : /clavier/.test(text) ? 'clavier' : 'PRD' });
    return { content: products.length ? products.map((product) =>
      `${product.name} (${product.id}) : ${product.stock > 0 ? `${product.stock} en stock` : 'indisponible'}.`).join('\n') :
      'Aucun produit correspondant.', confidence: products.length ? 0.97 : 0.4, needsHuman: !products.length };
  }
  if (/retour|livraison|delai/.test(text)) {
    const sources = await execute('search_knowledge_base', { query: question });
    return { content: sources.length ? `${sources[0].content} [1]` : 'Aucune connaissance pertinente.',
      confidence: sources.length ? 0.9 : 0.3, needsHuman: !sources.length };
  }
  if (/^(bonjour|salut|hello|merci)[!.\s]*$/.test(text)) {
    return { content: 'Bonjour. Comment puis-je vous aider ?', confidence: 0.95, needsHuman: false };
  }
  return { content: 'Votre demande necessite une verification par un conseiller.', confidence: 0.3,
    needsHuman: true, reason: 'missing-knowledge' };
}

export function createSupportAgent(provider) {
  return async (question, { history, execute }) => {
    if (!provider) return generateDemoSupportResponse(question, { execute });
    return provider.runTools({ question, history, tools: supportToolDefinitions, execute });
  };
}
