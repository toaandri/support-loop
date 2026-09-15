export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export async function api(path, { method = 'GET', body, key = '', support = false, signal } = {}) {
  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    method, signal,
    headers: { 'Content-Type': 'application/json', [support ? 'x-support-key' : 'x-customer-key']: key },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'La requete a echoue.'), { status: response.status });
  return data;
}

export const statusLabels = { ai: 'Automatique', waiting: 'En attente', human: 'Conseiller', resolved: 'Resolue' };
export const reasonLabels = { 'customer-request': 'Demande du client', 'sensitive-action': 'Action sensible',
  'customer-distress': 'Client mecontent', 'low-confidence': 'Confiance insuffisante',
  'missing-evidence': 'Information non verifiee', 'missing-knowledge': 'Connaissance absente',
  'tool-or-provider-error': 'Erreur de service', 'ticket-created': 'Ticket ouvert', 'agent-request': 'Verification requise' };
export const money = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
