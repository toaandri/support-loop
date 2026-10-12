export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function api(path, { method = 'GET', body, key = '', support = false, signal } = {}) {
  let response;
  try { response = await fetch(`${apiBaseUrl}/api${path}`, {
    method, signal, credentials:'same-origin',
    headers: { 'Content-Type': 'application/json', [support ? 'x-support-key' : 'x-customer-key']: key },
    body: body === undefined ? undefined : JSON.stringify(body)
  }); } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error("Cannot connect to the server. Check that the backend is running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(response.status === 401 && data.error?.includes('access key required') ? "An access key is required or incorrect." :
    response.status === 429 ? "Too many requests. Try again in one minute." : data.error || "The request failed."), { status: response.status });
  return data;
}

export const statusLabels = { ai: "Automatic", waiting: "Waiting", human: "Advisor", resolved: "Resolved" };
export const reasonLabels = { 'customer-request': "Customer request", 'sensitive-action': "Sensitive action",
  'customer-distress': "Customer distress", 'low-confidence': "Insufficient confidence",
  'missing-evidence': "Unverified information", 'missing-knowledge': "Missing knowledge",
  'tool-or-provider-error': "Service error", 'ticket-created': "Ticket opened", 'agent-request': "Verification required" };
export const money = (cents) => new Intl.NumberFormat("en-GB", { style: 'currency', currency: 'EUR' }).format(cents / 100);
