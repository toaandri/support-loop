// Opt-in demo activity, created through the same API as real conversations.
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const base = process.env.DEMO_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}/api`;
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method,
    headers: { 'Content-Type': 'application/json', 'x-customer-key': process.env.CUSTOMER_API_KEY || '', 'x-support-key': process.env.SUPPORT_ADMIN_KEY || '' },
    body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}
const health = await request('/health');
if (!health.demoMode || health.mode !== 'demo') throw new Error('Seeding is only available in AGENT_MODE=demo and DEMO_MODE=true.');
const existing = new Set((await request('/support/conversations')).conversations.map((row) => row.id));
const scenarios = [
  ['demo-order', 'Où est ma commande ORD-1001 ?'],
  ['demo-stock', 'Stock PRD-001 ?'],
  ['demo-delivery', 'Quels sont les délais de livraison ?'],
  ['demo-human', 'Je veux parler à un humain'],
  ['demo-return', 'Je souhaite un remboursement'],
  ['demo-warranty', 'Comment fonctionne la garantie atelier ?', 'La garantie atelier dure deux ans avec un justificatif d’achat.', 'approve'],
  ['demo-review', 'Comment entretenir les coussinets audio ?', 'Nettoyez les coussinets avec un chiffon doux légèrement humide, sans solvant.', 'review'],
  ['demo-claim', 'Mon colis a un problème', 'Bonjour Camille, je vérifie votre livraison.', 'claim']
];
for (const [id, message, answer, action] of scenarios) {
  if (existing.has(id)) continue;
  await request('/chat', 'POST', { conversationId: id, message, channel: 'web' });
  if (answer) {
    await request(`/support/conversations/${id}/claim`, 'POST');
    await request(`/support/conversations/${id}/reply`, 'POST', { content: answer });
    if (action !== 'claim') {
      await request(`/support/conversations/${id}/resolve`, 'POST');
      const { knowledge } = await request('/support/knowledge');
      const entry = knowledge.find((row) => row.conversation_id === id);
      if (entry && action === 'approve') await request(`/support/knowledge/${entry.id}/approve`, 'POST');
      if (entry && action === 'review') await request(`/support/knowledge/${entry.id}/review`, 'POST');
    }
  }
}
console.log(`Demo scenarios are ready. Open http://localhost:${process.env.FRONTEND_PORT || 5173}. Existing demo conversations were preserved.`);
