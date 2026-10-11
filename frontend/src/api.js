export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function api(path, { method = 'GET', body, key = '', support = false, signal } = {}) {
  let response;
  try { response = await fetch(`${apiBaseUrl}/api${path}`, {
    method, signal,
    headers: { 'Content-Type': 'application/json', [support ? 'x-support-key' : 'x-customer-key']: key },
    body: body === undefined ? undefined : JSON.stringify(body)
  }); } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Connexion au serveur impossible. Vérifiez que le backend est démarré.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Clé d’accès requise ou incorrecte.' :
    response.status === 429 ? 'Trop de requêtes. Réessayez dans une minute.' : data.error || 'La requête a échoué.'), { status: response.status });
  return data;
}

export const statusLabels = { ai: 'Automatique', waiting: 'En attente', human: 'Conseiller', resolved: 'Résolue' };
export const reasonLabels = { 'customer-request': 'Demande du client', 'sensitive-action': 'Action sensible',
  'customer-distress': 'Client mecontent', 'low-confidence': 'Confiance insuffisante',
  'missing-evidence': 'Information non verifiee', 'missing-knowledge': 'Connaissance absente',
  'tool-or-provider-error': 'Erreur de service', 'ticket-created': 'Ticket ouvert', 'agent-request': 'Verification requise' };
export const money = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
