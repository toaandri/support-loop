import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, ChevronRight, CircleHelp, Headset, KeyRound,
  LayoutDashboard, MessageCircle, MessagesSquare, Package, Plus, Search, Send, ShieldCheck, Sparkles, X, BookOpen } from 'lucide-react';
import { api, statusLabels, money } from './api.js';
import MessageList from './MessageList.jsx';
import SupportWorkspace from './SupportWorkspace.jsx';

const storageKey = 'support-loop-conversation-id';
const navigation = [
  { id: 'dashboard', label: "Overview", icon: LayoutDashboard, group: "Advisor workspace" },
  { id: 'conversations', label: "Conversations", icon: MessagesSquare },
  { id: 'knowledge', label: "Knowledge", icon: BookOpen },
  { id: 'chat', label: "Customer conversation", icon: MessageCircle, group: "Customer workspace" },
  { id: 'catalog', label: "Catalogue", icon: Package }
];
const headings = {
  dashboard: ["Support that learns.", "Follow activity, help your customers and improve your knowledge base."],
  conversations: ["Every conversation counts.", "Take over with the full context and provide the right answer."],
  knowledge: ["Experience becomes knowledge.", "Review human answers before sharing them with your agent."],
  chat: ["How can we help?", "Your orders, your questions and a team to support you."],
  catalog: ["The essentials, simply.", "Browse our demonstration shop products and availability."]
};
const orderLabels = { shipped: "Shipped", processing: "Processing", delivered: "Delivered", cancelled: "Cancelled" };
function conversationId() {
  let id = localStorage.getItem(storageKey);
  if (!id) { id = `local-${crypto.randomUUID()}`; localStorage.setItem(storageKey, id); }
  return id;
}
function initialView() {
  const hash = window.location.hash.slice(1);
  return navigation.some((item) => item.id === hash) ? hash : 'dashboard';
}

export default function SupportApp() {
  const [view, setView] = useState(initialView);
  const [id, setId] = useState(conversationId);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('ai');
  const [health, setHealth] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [draft, setDraft] = useState('');
  const [key, setKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [showAccess, setShowAccess] = useState(false);
  const [help, setHelp] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const isClient = ['chat', 'catalog'].includes(view);

  function navigate(next) { window.location.hash = next; setView(next); }
  useEffect(() => { const sync = () => setView(initialView()); window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync); }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => api('/health').then((data) => { if (active) setHealth(data); }).catch(() => { if (active) setHealth(false); });
    refresh(); const interval = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!isClient) return;
    let active = true;
    Promise.all([api('/customer', { key }), api('/orders', { key }), api('/products', { key }), api('/tickets', { key })])
      .then(([a, b, c, d]) => { if (active) { setCustomer(a.customer); setOrders(b.orders); setProducts(c.products); setTickets(d.tickets); setError(''); } })
      .catch((err) => { if (active) { setError(err.message); if (err.status === 401) setShowAccess(true); } });
    return () => { active = false; };
  }, [key, isClient, status]);
  useEffect(() => {
    if (sending || view !== 'chat') return;
    let active = true;
    async function refresh() {
      try { const data = await api(`/conversations/${encodeURIComponent(id)}/messages`, { key });
        if (active) { setMessages(data.messages); setStatus(data.status); }
      } catch (err) { if (active) setError(err.message); }
    }
    refresh(); const interval = setInterval(refresh, 2500);
    return () => { active = false; clearInterval(interval); };
  }, [id, sending, key, view]);

  async function send(event) {
    event.preventDefault(); if (sending || !draft.trim()) return;
    setSending(true); setError('');
    try { const data = await api('/chat', { method: 'POST', key, body: { conversationId: id, message: draft.trim(), channel: 'web' } });
      setMessages(data.history); setStatus(data.status); setDraft('');
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }
  function newChat() {
    const next = `local-${crypto.randomUUID()}`; localStorage.setItem(storageKey, next);
    setId(next); setMessages([]); setStatus('ai'); setDraft(''); setError('');
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a href="#dashboard" className="brand" aria-label="SupportLoop, home"><span className="brand-mark"><Activity size={22} /></span>
        <span>SupportLoop<span className="brand-caption">CUSTOMER CARE, CONTINUOUSLY.</span></span></a>
      <nav aria-label="Workspace" className="main-nav">{navigation.map((item) => <React.Fragment key={item.id}>
        {item.group ? <p className="nav-group">{item.group}</p> : null}
        <button className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined}
          onClick={() => navigate(item.id)}><item.icon size={19} /><span>{item.label}</span>{view === item.id ? <span className="nav-dot" /> : null}</button>
      </React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="loop-note"><Sparkles size={19} /><strong>A little better with every answer.</strong>
        <p>Your human resolutions grow the team’s knowledge.</p><button onClick={() => setHelp(true)}>Explore the loop <ArrowUpRight size={15} /></button></div>
        <div className="sidebar-profile"><span className="avatar">SL</span><div><strong>SupportLoop team</strong><small>{health?.demoMode ? "Demonstration workspace" : "Support workspace"}</small></div></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="app-header"><div className="breadcrumb">Workspace <ChevronRight size={14} /><strong>{navigation.find((item) => item.id === view)?.label}</strong></div>
        <div className="header-right"><span className={`connection ${health === false ? 'offline' : ''}`}><i />{health === null ? 'Connexion…' : health === false ? "Server offline" : "System operational"}</span>
          {health?.demoMode ? <span className="badge demo">Demo</span> : null}
          <button className="icon-button secondary" aria-label="Demonstration guide" title="Demonstration guide" onClick={() => setHelp(true)}><CircleHelp size={18} /></button>
          {isClient ? <button className="icon-button secondary" title="Customer access" aria-label="Customer access" onClick={() => setShowAccess(!showAccess)}><KeyRound size={18} /></button> : null}
        </div></header>
      <main id="main-content" tabIndex={-1} className="page-content">
        <div className="page-heading"><div><span className="eyebrow">{isClient ? "Here to help" : "Your support workspace"}</span>
          <h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div>
          <span className="date-label">{new Date().toLocaleDateString("en-GB", { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        {health === false ? <p role="alert" className="error">The server is unavailable. Start the project with npm run dev.</p> : null}
        {showAccess && isClient ? <form className="customer-access" onSubmit={(e) => { e.preventDefault(); setKey(keyDraft); }}>
          <label htmlFor="customer-key">Customer access key</label><input id="customer-key" type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
          <button type="submit">Sign in</button></form> : null}
        {error && isClient ? <p role="alert" className="error">{error}</p> : null}
        {!isClient ? <SupportWorkspace demoMode={!!health?.demoMode} loading={health === null} tab={view} onTabChange={navigate} /> : view === 'catalog' ?
          <section className="catalog"><div className="section-heading"><div><h2>Our collection</h2><p className="muted">{products.length} products · Fictional shop</p></div>
            <label className="search-field"><Search size={17} /><input aria-label="Search products" placeholder="Search products…" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} /></label></div>
            <div className="product-grid">{products.filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(productQuery.toLowerCase())).map((product) =>
              <article className="product" key={product.id}><div className="product-visual"><img src={product.id === 'PRD-001' ? '/products/headphones.svg' : '/products/keyboard.svg'} alt={product.name} />
                <span className={`badge ${product.stock ? 'resolved' : 'waiting'}`}>{product.stock ? "Available" : "Out of stock"}</span></div>
                <div className="product-info"><span className="eyebrow">{product.id}</span><h3>{product.name}</h3><p>{product.description}</p>
                  <div className="product-price"><strong>{money(product.price_cents)}</strong><span className="muted">{product.stock} in stock</span></div>
                  <button className="secondary" onClick={() => { setDraft(`What is the stock level for product ${product.id} ?`); navigate('chat'); }}>Ask support <ArrowUpRight size={16} /></button></div></article>)}</div>
            {!products.length ? <div className="workspace-empty"><Package size={32} /><p>No products available.</p></div> : null}
            {products.length > 0 && !products.some((p) => `${p.id} ${p.name}`.toLowerCase().includes(productQuery.toLowerCase())) ? <p className="muted">No products match your search.</p> : null}</section> :
          <div className="client-columns"><section className="chat-panel" aria-label="Support conversation">
            <header className="chat-header"><span className="agent-avatar"><Headset size={21} /></span><div><h2>Your SupportLoop assistant</h2><small>A verified answer, or a handoff to an advisor.</small></div>
              <span className={`badge ${status}`}>{statusLabels[status]}</span><button disabled={sending} className="icon-button secondary" title="New conversation" aria-label="New conversation" onClick={newChat}><Plus size={18} /></button></header>
            {status === 'waiting' || status === 'human' ? <div className="handoff-banner"><Headset size={17} />{status === 'waiting' ? "Your request is waiting for an advisor. You can add more details." : "An advisor has taken over your conversation."}</div> : null}
            {status === 'resolved' ? <div className="handoff-banner resolved">Your request is resolved. A new message will reopen the conversation.</div> : null}
            <MessageList messages={messages} />
            {!messages.length ? <div className="quick-prompts">{["Where is my order ORD-1001?", "What are the delivery times?", "I want to speak to a human"].map((prompt) =>
              <button className="secondary" key={prompt} onClick={() => setDraft(prompt)}>{prompt}<ArrowUpRight size={14} /></button>)}</div> : null}
            {sending ? <p className="status" role="status"><span className="typing-dots">•••</span> SupportLoop is preparing your answer…</p> : null}
            <form className="composer" onSubmit={send}><textarea aria-label="Customer message" maxLength={4000} rows={2} placeholder="Write your message…" value={draft}
              onChange={(e) => setDraft(e.target.value)} disabled={sending} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }} />
              <button type="submit" disabled={sending || !draft.trim()} aria-label="Send"><Send size={18} /><span>Send</span></button></form>
            <div className="composer-footer"><ShieldCheck size={12} />Answers supported by your data and our knowledge.<span>Enter to send</span></div>
          </section><aside className="customer-context"><div className="customer-card"><span className="avatar large">{customer?.name?.split(' ').map((n) => n[0]).join('') || 'CM'}</span>
              <span className="eyebrow">Your workspace</span><h2>{customer?.name || "Customer"}</h2><p className="muted">{customer?.email}</p><span className="badge">{health?.demoMode ? "Demonstration customer" : "Customer workspace"}</span></div>
            <div className="context-card"><h3><Package size={17} />Your orders <span>{orders.length}</span></h3>{orders.map((order) => <button className="order-row" key={order.id} onClick={() => setDraft(`Where is my order ${order.id} ?`)}>
              <strong>{order.id}<ArrowUpRight size={14} /></strong><span><i className={`order-dot ${order.status}`} />{orderLabels[order.status]}</span><small>{money(order.total_cents)}</small></button>)}
              {!orders.length ? <p className="muted">No orders.</p> : null}</div>
            <div className="context-card"><h3><ArrowDownLeft size={17} />Your tickets <span>{tickets.length}</span></h3>{tickets.length ? tickets.slice(0, 3).map((ticket) =>
              <div className="ticket-row" key={ticket.id}><p>{ticket.subject}</p><span className={`badge ${ticket.status === 'resolved' ? 'resolved' : 'waiting'}`}>{ticket.status === 'resolved' ? "Resolved" : "Open"}</span></div>) : <p className="muted">All clear, no open tickets.</p>}</div>
          </aside></div>}
        <footer className="page-footer"><span>SupportLoop <span className="footer-dot">·</span> Customer care, continuously.</span><span><ShieldCheck size={13} />Human approval included</span></footer>
      </main>
    </div>
    {help ? <Guide onClose={() => setHelp(false)} onStart={() => { setHelp(false); navigate('chat'); }} /> : null}
  </div>;
}

function Guide({ onClose, onStart }) {
  const dialog = useRef(null);
  const previousFocus = useRef(document.activeElement);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.querySelector('button')?.focus();
    const trap = (event) => {
      if (event.key !== 'Tab') return;
      const buttons = dialog.current.querySelectorAll('button');
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
    };
    window.addEventListener('keydown', trap);
    return () => { window.removeEventListener('keydown', trap); document.body.style.overflow = overflow; previousFocus.current?.focus(); };
  }, []);
  useEffect(() => { const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="guide-title" className="guide-modal" onClick={(e) => e.stopPropagation()}>
    <button autoFocus className="icon-button secondary close-modal" aria-label="Close guide" onClick={onClose}><X size={19} /></button><span className="agent-avatar"><Sparkles size={24} /></span>
    <span className="eyebrow">The learning loop</span><h2 id="guide-title">One team. Growing knowledge.</h2>
    <p>The agent answers when it has verified information. When uncertain, an advisor takes over.</p>
    <ol><li>In Customer conversation, ask about ORD-1001.</li><li>Ask for a human, then open Conversations.</li><li>Take over, reply and resolve the case.</li><li>In Knowledge, review and approve the answer.</li><li>A similar question can now reuse the approved answer.</li></ol>
    <p className="muted">In demo mode, search is lexical and data is fictional. RAG mode uses OpenAI and pgvector. The model is not retrained.</p>
    <button onClick={onStart}>Try the walkthrough <ArrowUpRight size={16} /></button>
  </section></div>;
}
