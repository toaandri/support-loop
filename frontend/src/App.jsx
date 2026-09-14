import { useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const conversationStorageKey = 'support-loop-conversation-id';

function createConversationId() {
  const existingId = window.localStorage.getItem(conversationStorageKey);

  if (existingId) {
    return existingId;
  }

  const nextId = `local-${crypto.randomUUID()}`;
  window.localStorage.setItem(conversationStorageKey, nextId);
  return nextId;
}

export default function App() {
  const [conversationId] = useState(() => createConversationId());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const message = draft.trim();

    if (!message || isSending) {
      return;
    }

    setError('');
    setIsSending(true);
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: crypto.randomUUID(), role: 'user', content: message }
    ]);
    setDraft('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message, channel: 'web' })
      });

      if (!response.ok) {
        throw new Error('Backend request failed.');
      }

      const data = await response.json();
      setMessages(data.history || [data.message]);
    } catch (requestError) {
      setError('Impossible de contacter le backend SupportLoop. Verifie que le serveur est lance.');
      setDraft(message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">SupportLoop V1</p>
        <h1>AI Customer Support Agent</h1>
        <p>
          Premiere boucle fonctionnelle avec frontend React, backend Express et agent local mock.
        </p>
      </section>

      <section className="chat-panel" aria-label="Conversation de support">
        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              Pose une question sur une commande, un retour, un remboursement ou un produit.
            </div>
          ) : (
            messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? 'Client' : 'SupportLoop'}</span>
                <p>{message.content}</p>
                {message.metadata ? (
                  <small>
                    Confidence {Math.round(message.metadata.confidence * 100)}% - {message.metadata.category}
                  </small>
                ) : null}
              </article>
            ))
          )}
        </div>

        {isSending ? <p className="status">SupportLoop redige une reponse...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <form className="composer" onSubmit={handleSubmit}>
          <input
            aria-label="Message client"
            disabled={isSending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ex: Ou est ma commande ?"
            value={draft}
          />
          <button disabled={isSending || !draft.trim()} type="submit">
            {isSending ? 'Envoi...' : 'Envoyer'}
          </button>
        </form>
      </section>
    </main>
  );
}
