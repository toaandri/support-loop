import { randomUUID } from 'node:crypto';
import pg from 'pg';

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function newConversation(id, customerId) {
  return { id, customerId, status: 'ai', assignedTo: null, escalation: null,
    messages: [], traces: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export function appendMessage(state, role, content, metadata = {}) {
  const message = { id: randomUUID(), role, content, metadata, createdAt: new Date().toISOString() };
  state.messages.push(message);
  state.updatedAt = message.createdAt;
  return message;
}

const demoCustomers = [
  { id: 'customer-demo', name: 'Camille Martin', email: 'camille@example.test' },
  { id: 'customer-other', name: 'Alex Bernard', email: 'alex@example.test' }
];
const demoProducts = [
  { id: 'PRD-001', name: 'Casque Studio', description: 'Casque audio sans fil, autonomie 30 heures.',
    price_cents: 8900, stock: 12, image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&auto=format&fit=crop' },
  { id: 'PRD-002', name: 'Clavier Compact', description: 'Clavier mecanique compact, connexion USB-C.',
    price_cents: 6900, stock: 0, image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&auto=format&fit=crop' }
];
const demoOrders = [
  { id: 'ORD-1001', customer_id: 'customer-demo', status: 'shipped', total_cents: 8900, tracking_number: 'DEMO-TRACK-1001' },
  { id: 'ORD-1002', customer_id: 'customer-demo', status: 'processing', total_cents: 6900, tracking_number: null },
  { id: 'ORD-2001', customer_id: 'customer-other', status: 'delivered', total_cents: 8900, tracking_number: 'DEMO-TRACK-2001' }
];

export function createMemorySupportStore() {
  const conversations = new Map();
  const tickets = new Map();
  const learnedKnowledge = new Map();
  const pending = new Map();
  let threshold = 0.85;
  const repo = {
    async customer(id) { return structuredClone(demoCustomers.find((row) => row.id === id)); },
    async orders(customerId) { return structuredClone(demoOrders.filter((row) => row.customer_id === customerId)); },
    async order(id, customerId) { return structuredClone(demoOrders.find((row) => row.id === id && row.customer_id === customerId)); },
    async products(query = '') {
      return structuredClone(demoProducts.filter((row) => `${row.id} ${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase())));
    },
    async product(id) { return structuredClone(demoProducts.find((row) => row.id === id)); },
    async tickets(customerId) { return structuredClone([...tickets.values()].filter((row) => row.customer_id === customerId)); }
  };
  return {
    ...repo,
    async check() {},
    async withConversation(id, customerId, work, { existingOnly = false } = {}) {
      const prior = pending.get(id) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = prior.then(() => gate);
      pending.set(id, tail);
      await prior;
      try {
        const existing = conversations.get(id);
        if (!existing && existingOnly) throw httpError(404, 'Conversation not found.');
        if (existing && customerId && existing.customerId !== customerId) throw httpError(404, 'Conversation not found.');
        if (!existing && !await repo.customer(customerId)) throw httpError(404, 'Customer not found.');
        const state = structuredClone(existing || newConversation(id, customerId));
        let stagedTicket;
        const sessionRepo = { ...repo, async createTicket(subject) {
          stagedTicket = stagedTicket || tickets.get(id) || { id: randomUUID(), conversation_id: id,
            customer_id: state.customerId, subject, status: 'open', created_at: new Date().toISOString() };
          return structuredClone(stagedTicket);
        } };
        const result = await work(state, sessionRepo);
        conversations.set(id, state);
        if (stagedTicket) tickets.set(id, stagedTicket);
        const ticket = tickets.get(id);
        if (ticket) ticket.status = state.status === 'resolved' ? 'resolved' : 'open';
        return result;
      } finally {
        release();
        if (pending.get(id) === tail) pending.delete(id);
      }
    },
    async conversation(id, customerId) {
      const state = conversations.get(id);
      if (!state || (customerId && state.customerId !== customerId)) throw httpError(404, 'Conversation not found.');
      return structuredClone(state);
    },
    async listConversations() { return structuredClone([...conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); },
    async getThreshold() { return threshold; },
    async setThreshold(value) { threshold = value; },
    async createLearnedKnowledge(entry) { learnedKnowledge.set(entry.id, structuredClone(entry)); },
    async getLearnedKnowledge(id) {
      const entry = learnedKnowledge.get(id);
      if (!entry) throw httpError(404, 'Learned knowledge not found.');
      return structuredClone(entry);
    },
    async listLearnedKnowledge({ status } = {}) {
      const rows = [...learnedKnowledge.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return structuredClone(status ? rows.filter((row) => row.status === status) : rows);
    },
    async updateLearnedKnowledge(id, patch) {
      const existing = learnedKnowledge.get(id);
      if (!existing) throw httpError(404, 'Learned knowledge not found.');
      Object.assign(existing, patch);
    },
    async stats() {
      const all = [...conversations.values()];
      const allTickets = [...tickets.values()];
      const lk = [...learnedKnowledge.values()];
      return {
        conversations_total: all.length,
        conversations_resolved: all.filter((c) => c.status === 'resolved').length,
        conversations_waiting: all.filter((c) => c.status === 'waiting').length,
        conversations_human: all.filter((c) => c.status === 'human').length,
        conversations_ai: all.filter((c) => c.status === 'ai').length,
        tickets_open: allTickets.filter((t) => t.status === 'open').length,
        tickets_resolved: allTickets.filter((t) => t.status === 'resolved').length,
        learned_knowledge_total: lk.length,
        learned_knowledge_pending_review: lk.filter((k) => k.status === 'new' || k.status === 'review').length,
        learned_knowledge_active: lk.filter((k) => k.status === 'active').length,
      };
    },
    async close() {}
  };
}

function sqlRepository(query) {
  return {
    async customer(id) { return (await query('SELECT id, name, email FROM customers WHERE id = $1', [id])).rows[0]; },
    async orders(customerId) {
      return (await query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY id', [customerId])).rows;
    },
    async order(id, customerId) {
      const order = (await query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [id, customerId])).rows[0];
      if (order) order.items = (await query(`SELECT i.product_id, p.name, i.quantity FROM order_items i
        JOIN products p ON p.id = i.product_id WHERE i.order_id = $1`, [id])).rows;
      return order;
    },
    async products(search = '') {
      return (await query(`SELECT * FROM products WHERE position(lower($1) in lower(id || ' ' || name || ' ' || description)) > 0
        ORDER BY id LIMIT 20`, [search])).rows;
    },
    async product(id) { return (await query('SELECT * FROM products WHERE id = $1', [id])).rows[0]; },
    async tickets(customerId) {
      return (await query('SELECT * FROM tickets WHERE customer_id = $1 ORDER BY created_at DESC', [customerId])).rows;
    }
  };
}

export function createPostgresSupportStore(connectionString) {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const repo = sqlRepository((sql, values) => pool.query(sql, values));
  return {
    ...repo,
    async check() { await pool.query('SELECT id FROM support_conversations LIMIT 1'); },
    async withConversation(id, customerId, work, { existingOnly = false } = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (!existingOnly) {
          await client.query(`INSERT INTO support_conversations (id, customer_id, state)
            VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, customerId, newConversation(id, customerId)]);
        }
        const row = (await client.query('SELECT * FROM support_conversations WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!row || (customerId && row.customer_id !== customerId)) throw httpError(404, 'Conversation not found.');
        const state = row.state;
        const sessionRepo = sqlRepository((sql, values) => client.query(sql, values));
        sessionRepo.createTicket = async (subject) => (await client.query(`
          INSERT INTO tickets (id, conversation_id, customer_id, subject) VALUES ($1, $2, $3, $4)
          ON CONFLICT (conversation_id) DO UPDATE SET status = 'open' RETURNING *`,
        [randomUUID(), id, state.customerId, subject])).rows[0];
        const result = await work(state, sessionRepo);
        await client.query('UPDATE support_conversations SET state = $2, updated_at = now() WHERE id = $1', [id, state]);
        await client.query('UPDATE tickets SET status = $2 WHERE conversation_id = $1', [id, state.status === 'resolved' ? 'resolved' : 'open']);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK'); throw error;
      } finally { client.release(); }
    },
    async conversation(id, customerId) {
      const result = await pool.query('SELECT state, customer_id FROM support_conversations WHERE id = $1', [id]);
      const row = result.rows[0];
      if (!row || (customerId && row.customer_id !== customerId)) throw httpError(404, 'Conversation not found.');
      return row.state;
    },
    async listConversations() {
      return (await pool.query('SELECT state FROM support_conversations ORDER BY updated_at DESC LIMIT 200')).rows.map((row) => row.state);
    },
    async getThreshold() { return (await pool.query('SELECT confidence_threshold FROM support_settings WHERE id = 1')).rows[0].confidence_threshold; },
    async setThreshold(value) { await pool.query('UPDATE support_settings SET confidence_threshold = $1 WHERE id = 1', [value]); },
    async createLearnedKnowledge(entry) {
      await pool.query(`INSERT INTO learned_knowledge
        (id, conversation_id, question, ai_answer, human_answer, extracted_rule, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.id, entry.conversation_id, entry.question, entry.ai_answer || null,
        entry.human_answer, entry.extracted_rule ? JSON.stringify(entry.extracted_rule) : null,
        entry.status, entry.created_at]);
    },
    async getLearnedKnowledge(id) {
      const row = (await pool.query('SELECT * FROM learned_knowledge WHERE id = $1', [id])).rows[0];
      if (!row) throw httpError(404, 'Learned knowledge not found.');
      return row;
    },
    async listLearnedKnowledge({ status } = {}) {
      if (status) return (await pool.query('SELECT * FROM learned_knowledge WHERE status = $1 ORDER BY created_at DESC', [status])).rows;
      return (await pool.query('SELECT * FROM learned_knowledge ORDER BY created_at DESC')).rows;
    },
    async updateLearnedKnowledge(id, patch) {
      const fields = Object.keys(patch).map((key, index) => `${key} = $${index + 2}`).join(', ');
      await pool.query(`UPDATE learned_knowledge SET ${fields} WHERE id = $1`, [id, ...Object.values(patch)]);
    },
    async stats() {
      const [convRow, ticketRow, lkRow] = await Promise.all([
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE TRUE) AS conversations_total,
          COUNT(*) FILTER (WHERE state->>'status' = 'resolved') AS conversations_resolved,
          COUNT(*) FILTER (WHERE state->>'status' = 'waiting') AS conversations_waiting,
          COUNT(*) FILTER (WHERE state->>'status' = 'human') AS conversations_human,
          COUNT(*) FILTER (WHERE state->>'status' = 'ai') AS conversations_ai
          FROM support_conversations`),
        pool.query(`SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS tickets_open,
          COUNT(*) FILTER (WHERE status = 'resolved') AS tickets_resolved
          FROM tickets`),
        pool.query(`SELECT
          COUNT(*) AS learned_knowledge_total,
          COUNT(*) FILTER (WHERE status IN ('new','review')) AS learned_knowledge_pending_review,
          COUNT(*) FILTER (WHERE status = 'active') AS learned_knowledge_active
          FROM learned_knowledge`)
      ]);
      return { ...convRow.rows[0], ...ticketRow.rows[0], ...lkRow.rows[0] };
    },
    async close() { await pool.end(); }
  };
}
