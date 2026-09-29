import React, { useEffect, useState } from 'react';
import { MessagesSquare, Headset, Package, Plus, Send, KeyRound } from 'lucide-react';
import { api, statusLabels, money } from './api.js';
import MessageList from './MessageList.jsx';
import SupportWorkspace from './SupportWorkspace.jsx';

const storageKey = 'support-loop-conversation-id';
function conversationId() {
  let id = localStorage.getItem(storageKey);
  if (!id) { id = `local-${crypto.randomUUID()}`; localStorage.setItem(storageKey, id); }
  return id;
}

export default function SupportApp() {
  const [view, setView] = useState('chat');
  const [id, setId] = useState(conversationId);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('ai');
  const [health, setHealth] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [draft, setDraft] = useState('');
  const [key, setKey] = useState('');
  const [showAccess, setShowAccess] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api('/health').then(setHealth).catch(() => setError('Backend indisponible.')); }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api('/customer', { key }), api('/orders', { key }), api('/products', { key })]).then(([a, b, c]) => {
      if (active) { setCustomer(a.customer); setOrders(b.orders); setProducts(c.products); setError(''); }
    }).catch((err) => { if (active) { setError(err.message); if (err.status === 401) setShowAccess(true); } });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (sending) return;
    let active = true;
    async function refresh() {
      try {
        const data = await api(`/conversations/${encodeURIComponent(id)}/messages`, { key });
        if (active) { setMessages(data.messages); setStatus(data.status); }
      } catch (err) { if (active) setError(err.message); }
    }
    refresh(); const interval = setInterval(refresh, 2500);
    return () => { active = false; clearInterval(interval); };
  }, [id, sending, key]);

  async function send(event) {
    event.preventDefault(); if (sending || !draft.trim()) return;
    setSending(true); setError('');
    try {
      const data = await api('/chat', { method: 'POST', key, body: { conversationId: id, message: draft.trim(), channel: 'web' } });
      setMessages(data.history); setStatus(data.status); setDraft('');
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }

  return <main className="app-shell">
    <header className="app-header"><div className="brand"><MessagesSquare size={27} /><h1>SupportLoop</h1><span className="version">V8</span></div>
      <div className="header-right">{health?.demoMode ? <span className="badge demo">Boutique fictive · Demo</span> : null}
        <button className="icon-button secondary" title="Acces client" aria-label="Acces client" onClick={() => setShowAccess(!showAccess)}><KeyRound size={18} /></button></div></header>
    {showAccess ? <label className="customer-access">Cle d'acces client<input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} /></label> : null}
    <nav className="view-tabs" aria-label="Espace de travail">
      <button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}><MessagesSquare size={17} />Conversation</button>
      <button className={view === 'catalog' ? 'active' : ''} onClick={() => setView('catalog')}><Package size={17} />Catalogue</button>
      <button className={view === 'support' ? 'active' : ''} onClick={() => setView('support')}><Headset size={17} />Conseiller</button>
    </nav>
    {error && view !== 'support' ? <p role="alert" className="error">{error}</p> : null}
    {view === 'support' ? <SupportWorkspace demoMode={!!health?.demoMode} /> : view === 'catalog' ?
      <section className="catalog"><h2>Catalogue</h2><div className="product-grid">{products.map((product) =>
        <article className="product" key={product.id}><img src={product.image_url} alt={product.name} />
          <div><small>{product.id}</small><h3>{product.name}</h3><p>{product.description}</p><strong>{money(product.price_cents)}</strong>
            <span className={`stock ${product.stock ? '' : 'unavailable'}`}>{product.stock ? `${product.stock} en stock` : 'Indisponible'}</span>
            <button className="secondary" onClick={() => { setDraft(`Quel est le stock du produit ${product.id} ?`); setView('chat'); }}><MessagesSquare size={16} />Contacter le support</button></div></article>)}</div>
        {!products.length ? <p className="muted">Aucun produit.</p> : null}</section> :
      <div className="client-columns"><aside className="customer-context"><h2>{customer?.name || 'Client'}</h2><p className="muted">{customer?.email}</p>
        <h3>Vos commandes</h3>{orders.map((order) => <button className="order-row" key={order.id} onClick={() => setDraft(`Ou est ma commande ${order.id} ?`)}>
          <strong>{order.id}</strong><span>{({ shipped: 'Expediee', processing: 'En preparation', delivered: 'Livree', cancelled: 'Annulee' })[order.status]}</span>
          <small>{money(order.total_cents)}</small></button>)}
        {!orders.length ? <p className="muted">Aucune commande.</p> : null}
      </aside><section className="chat-panel" aria-label="Conversation de support">
        <header className="chat-header"><Headset size={20} /><h2>Support client</h2><span className={`badge ${status}`}>{statusLabels[status]}</span>
          <button disabled={sending} className="icon-button secondary" title="Nouvelle conversation" aria-label="Nouvelle conversation" onClick={() => {
            const next = `local-${crypto.randomUUID()}`; localStorage.setItem(storageKey, next); setId(next); setMessages([]); setStatus('ai'); setDraft(''); setError('');
          }}><Plus size={18} /></button></header>
        {status === 'waiting' || status === 'human' ? <div className="handoff-banner">{status === 'waiting' ?
          'Votre demande est en attente d’un conseiller.' : 'Un conseiller a pris en charge votre conversation.'}</div> : null}
        <MessageList messages={messages} />
        {sending ? <p className="status" role="status">Envoi en cours...</p> : null}
        <form className="composer" onSubmit={send}><textarea aria-label="Message client" maxLength={4000} rows={2}
          placeholder="Votre message..." value={draft} onChange={(event) => setDraft(event.target.value)} disabled={sending} />
          <button type="submit" disabled={sending || !draft.trim()}><Send size={17} />Envoyer</button></form>
      </section></div>}
  </main>;
}
