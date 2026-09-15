import { randomUUID } from 'node:crypto';

function tool(name, description, properties = {}) {
  return { type: 'function', name, description, strict: true,
    parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
export const supportToolDefinitions = [
  tool('get_customer_orders', 'Get orders for the authenticated customer. No customer argument.'),
  tool('get_order', 'Get one order owned by the authenticated customer.', { orderId: { type: 'string' } }),
  tool('search_product', 'Find catalog products by name or ID.', { query: { type: 'string' } }),
  tool('check_stock', 'Get current stock of a catalog product.', { productId: { type: 'string' } }),
  tool('create_ticket', 'Create a support ticket only when the customer asks for a ticket or reports an incident.'),
  tool('search_knowledge_base', 'Search approved support documentation.', { query: { type: 'string' } })
];

export function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function createToolExecutor({ state, repo, provider, knowledgeStore, minSimilarity = 0.35 }) {
  const traces = [];
  let calls = 0;
  let nextCitation = 1;
  return {
    traces,
    async execute(name, args) {
      calls += 1;
      const definition = supportToolDefinitions.find((item) => item.name === name);
      if (!definition || calls > 8 || !args || Array.isArray(args) || typeof args !== 'object') {
        throw new Error('Tool is not allowed or tool budget exceeded.');
      }
      const keys = Object.keys(definition.parameters.properties);
      if (Object.keys(args).length !== keys.length || !keys.every((key) =>
        typeof args[key] === 'string' && args[key].trim() && args[key].length <= 500)) {
        throw new Error('Invalid tool arguments.');
      }
      const trace = { id: randomUUID(), name, args, createdAt: new Date().toISOString(), status: 'running' };
      traces.push(trace);
      try {
        let result;
        switch (name) {
          case 'get_customer_orders': result = await repo.orders(state.customerId); break;
          case 'get_order':
            result = await repo.order(args.orderId, state.customerId);
            if (!result) throw new Error('Order not found for this customer.');
            break;
          case 'search_product': result = await repo.products(args.query); break;
          case 'check_stock':
            result = await repo.product(args.productId);
            if (!result) throw new Error('Product not found.');
            result = { id: result.id, name: result.name, stock: result.stock };
            break;
          case 'create_ticket': {
            const latest = normalize(state.messages.filter((item) => item.role === 'user').at(-1)?.content || '');
            if (!/ticket|incident|probleme|problem|panne|reclamation|colis.*perdu/.test(latest)) {
              throw new Error('Ticket creation is not authorized by this request.');
            }
            result = await repo.createTicket(state.messages.at(-1).content.slice(0, 200));
            break;
          }
          case 'search_knowledge_base':
            if (!provider || !knowledgeStore) {
              // The demo uses the same excerpts as knowledge/demo; no semantic-search claim.
              const query = normalize(args.query);
              result = /retour|annul|rembours/.test(query) ? [{ id: 'demo-returns', source: 'demo/returns.md', chunkIndex: 0,
                content: 'Boutique fictive : retour sous 14 jours apres livraison, produit non utilise et emballage original. Une commande expediee ne peut pas etre annulee.', similarity: 1 }] :
                /livr|expedi|delai/.test(query) ? [{ id: 'demo-delivery', source: 'demo/delivery.md', chunkIndex: 0,
                  content: 'Boutique fictive : livraison standard sous 3 a 5 jours ouvrables apres expedition. Suivi envoye par email.', similarity: 1 }] : [];
              break;
            }
            result = await knowledgeStore.search((await provider.embed([args.query]))[0], {
              model: provider.embeddingModel, minSimilarity, limit: 4
            });
            break;
        }
        if (name === 'search_knowledge_base') result = result.map((row) => ({ ...row, citation: nextCitation++ }));
        trace.status = 'success'; trace.result = result;
        return result;
      } catch (error) {
        trace.status = 'error'; trace.error = 'Tool execution failed.';
        throw error;
      }
    }
  };
}
