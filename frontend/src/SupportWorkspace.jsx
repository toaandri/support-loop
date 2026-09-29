import React, { useEffect, useState } from 'react';
import { RefreshCw, UserCheck, Send, Check, Bot, KeyRound, LogOut, BookOpen, BarChart2, X, Pencil } from 'lucide-react';
import { api, statusLabels, reasonLabels, money } from './api.js';
import MessageList from './MessageList.jsx';

// ─── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ apiKey }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const data = await api('/support/stats', { support: true, key: apiKey });
        if (active) setStats(data);
      } catch (err) { if (active) setError(err.message); }
    }
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [apiKey]);

  const n = (v) => Number(v) || 0;
  const pct = (a, b) => b > 0 ? `${Math.round((n(a) / n(b)) * 100)}%` : '—';

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!stats) return <p className="muted" style={{ padding: '24px' }}>Chargement...</p>;

  const total = n(stats.conversations_total);
  const resolved = n(stats.conversations_resolved);
  const waiting = n(stats.conversations_waiting);
  const human = n(stats.conversations_human);
  const lkTotal = n(stats.learned_knowledge_total);
  const lkPending = n(stats.learned_knowledge_pending_review);
  const lkActive = n(stats.learned_knowledge_active);

  return (
    <div className="dashboard">
      <h2>Tableau de bord</h2>
      <div className="kpi-grid">
        <div className="kpi"><span className="kpi-value">{total}</span><span className="kpi-label">Conversations</span></div>
        <div className="kpi resolved"><span className="kpi-value">{resolved}</span><span className="kpi-label">Résolues</span></div>
        <div className="kpi waiting"><span className="kpi-value">{waiting}</span><span className="kpi-label">En attente</span></div>
        <div className="kpi human"><span className="kpi-value">{human}</span><span className="kpi-label">Avec conseiller</span></div>
        <div className="kpi"><span className="kpi-value">{pct(resolved, total)}</span><span className="kpi-label">Taux de résolution</span></div>
        <div className="kpi"><span className="kpi-value">{pct(n(stats.conversations_waiting) + n(stats.conversations_human), total)}</span><span className="kpi-label">Taux d'escalade</span></div>
        <div className="kpi"><span className="kpi-value">{n(stats.tickets_open)}</span><span className="kpi-label">Tickets ouverts</span></div>
        <div className="kpi"><span className="kpi-value">{n(stats.tickets_resolved)}</span><span className="kpi-label">Tickets résolus</span></div>
      </div>
      <h2 style={{ marginTop: 32 }}>Learning Loop</h2>
      <div className="kpi-grid">
        <div className="kpi"><span className="kpi-value">{lkTotal}</span><span className="kpi-label">Connaissances extraites</span></div>
        <div className="kpi waiting"><span className="kpi-value">{lkPending}</span><span className="kpi-label">En attente de validation</span></div>
        <div className="kpi resolved"><span className="kpi-value">{lkActive}</span><span className="kpi-label">Actives dans le RAG</span></div>
      </div>
    </div>
  );
}

// ─── Knowledge Review ────────────────────────────────────────────────────────
const knowledgeStatusLabels = { new: 'Nouvelle', review: 'En révision', approved: 'Approuvée', rejected: 'Rejetée', active: 'Active' };

function KnowledgeReview({ apiKey, agentKey }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('new');
  const [editRule, setEditRule] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = (path, options = {}) => api(`/support${path}`, { ...options, support: true, key: apiKey });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await request(`/knowledge${filter ? `?status=${filter}` : ''}`);
        if (active) setRows(data.knowledge);
      } catch (err) { if (active) setError(err.message); }
    }
    load();
  }, [filter, apiKey]);

  async function act(action) {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      let updated;
      if (action === 'approve') updated = await request(`/knowledge/${selected.id}/approve`, { method: 'POST' });
      else if (action === 'reject') updated = await request(`/knowledge/${selected.id}/reject`, { method: 'POST' });
      else if (action === 'save') {
        const patch = {};
        if (editAnswer.trim()) patch.human_answer = editAnswer.trim();
        try { if (editRule.trim()) patch.extracted_rule = JSON.parse(editRule.trim()); } catch { throw new Error('Règle JSON invalide.'); }
        updated = await api(`/support/knowledge/${selected.id}`, { method: 'PATCH', support: true, key: apiKey, body: patch });
      }
      setSelected(updated);
      const data = await request(`/knowledge${filter ? `?status=${filter}` : ''}`);
      setRows(data.knowledge);
      setEditing(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function openEdit(entry) {
    setEditRule(entry.extracted_rule ? JSON.stringify(entry.extracted_rule, null, 2) : '');
    setEditAnswer(entry.human_answer || '');
    setEditing(true);
  }

  return (
    <section className="support-workspace">
      <div className="workspace-toolbar">
        <h2>Connaissances apprises</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Toutes</option>
          {Object.entries(knowledgeStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="icon-button secondary" title="Actualiser" onClick={async () => {
          const data = await request(`/knowledge${filter ? `?status=${filter}` : ''}`);
          setRows(data.knowledge);
        }}><RefreshCw size={16} /></button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="support-columns">
        <aside className="queue">
          {!rows.length ? <p className="muted queue-empty">Aucune connaissance.</p> : null}
          {rows.map((row) => (
            <button key={row.id}
              className={`queue-row ${selected?.id === row.id ? 'selected' : ''}`}
              onClick={() => { setSelected(row); setEditing(false); setError(''); }}>
              <strong>{row.extracted_rule?.intent || 'Sans intention'}</strong>
              <span className={`badge ${row.status === 'active' ? 'resolved' : row.status === 'rejected' ? '' : 'waiting'}`}>
                {knowledgeStatusLabels[row.status] || row.status}
              </span>
              <p>{row.question}</p>
            </button>
          ))}
        </aside>

        {!selected
          ? <div className="workspace-empty"><BookOpen size={32} /><p>Sélectionnez une connaissance.</p></div>
          : (
            <div className="case-workspace">
              <header className="case-header">
                <div>
                  <h2>{selected.extracted_rule?.intent || 'Connaissance'}</h2>
                  <small>{new Date(selected.created_at).toLocaleString('fr-FR')}</small>
                </div>
                <span className={`badge ${selected.status === 'active' ? 'resolved' : selected.status === 'rejected' ? '' : 'waiting'}`}>
                  {knowledgeStatusLabels[selected.status] || selected.status}
                </span>
                {['new', 'review'].includes(selected.status) ? <>
                  <button disabled={busy} onClick={() => act('approve')}><Check size={16} />Approuver</button>
                  <button className="secondary" disabled={busy} onClick={() => act('reject')}><X size={16} />Rejeter</button>
                  <button className="secondary" disabled={busy} onClick={() => openEdit(selected)}><Pencil size={16} />Éditer</button>
                </> : null}
              </header>

              <div className="knowledge-detail" style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
                <div className="knowledge-section">
                  <h3>Question client</h3>
                  <p className="knowledge-text">{selected.question}</p>
                </div>
                {selected.ai_answer ? <div className="knowledge-section">
                  <h3>Réponse IA initiale</h3>
                  <p className="knowledge-text ai-answer">{selected.ai_answer}</p>
                </div> : null}
                <div className="knowledge-section">
                  <h3>Réponse du conseiller</h3>
                  {editing
                    ? <textarea aria-label="Réponse conseiller" rows={4} value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)} style={{ width: '100%' }} />
                    : <p className="knowledge-text human-answer">{selected.human_answer}</p>}
                </div>
                <div className="knowledge-section">
                  <h3>Règle extraite</h3>
                  {editing
                    ? <textarea aria-label="Règle JSON" rows={8} value={editRule}
                        onChange={(e) => setEditRule(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
                    : selected.extracted_rule
                      ? <pre className="knowledge-rule">{JSON.stringify(selected.extracted_rule, null, 2)}</pre>
                      : <p className="muted">Aucune règle extraite.</p>}
                </div>
                {editing
                  ? <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                      <button disabled={busy} onClick={() => act('save')}><Check size={16} />Sauvegarder</button>
                      <button className="secondary" onClick={() => setEditing(false)}>Annuler</button>
                    </div>
                  : null}
              </div>
            </div>
          )}
      </div>
    </section>
  );
}

// ─── Main Workspace ──────────────────────────────────────────────────────────
export default function SupportWorkspace({ demoMode }) {
  const [key, setKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [connected, setConnected] = useState(demoMode);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('waiting');
  const [threshold, setThreshold] = useState(0.85);
  const [savedThreshold, setSavedThreshold] = useState(0.85);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('conversations');
  const request = (path, options = {}) => api(`/support${path}`, { ...options, support: true, key });
  useEffect(() => { if (demoMode) setConnected(true); }, [demoMode]);

  useEffect(() => {
    if (!connected || tab !== 'conversations') return;
    let active = true;
    async function refresh() {
      try {
        const data = await api('/support/conversations', { support: true, key });
        if (active) setRows(data.conversations);
      } catch (err) {
        if (active) { setError(err.message); if (err.status === 401) setConnected(false); }
      }
    }
    refresh();
    api('/support/settings', { support: true, key }).then((data) => {
      if (active) { setThreshold(data.threshold); setSavedThreshold(data.threshold); }
    }).catch((err) => { if (active) setError(err.message); });
    const interval = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [connected, key, tab]);

  useEffect(() => {
    if (!selected || !connected || busy || tab !== 'conversations') return;
    let active = true;
    async function refresh() {
      try {
        const data = await api(`/support/conversations/${encodeURIComponent(selected)}`, { support: true, key });
        if (active) setDetail(data);
      } catch (err) { if (active) setError(err.message); }
    }
    refresh(); const interval = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [selected, connected, key, busy, tab]);

  async function act(action) {
    setBusy(true); setError('');
    try {
      await request(`/conversations/${encodeURIComponent(selected)}/${action}`, { method: 'POST', body: { content: reply } });
      setDetail(await request(`/conversations/${encodeURIComponent(selected)}`));
      setRows((await request('/conversations')).conversations);
      if (action === 'claim') setFilter('human');
      if (action === 'resolve') setFilter('resolved');
      if (action === 'resume') setFilter('ai');
      if (action === 'reply') setReply('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (!connected) return (
    <form className="access-form" onSubmit={(event) => {
      event.preventDefault(); setKey(keyDraft); setConnected(true); setError('');
    }}>
      <KeyRound size={24} /><h2>Accès conseiller</h2>
      <label>Clé d'accès<input type="password" autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} /></label>
      <button type="submit"><KeyRound size={16} />Connexion</button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );

  return (
    <section style={{ minHeight: 560 }}>
      {/* Sous-navigation */}
      <nav className="view-tabs" aria-label="Espace conseiller" style={{ marginBottom: 0 }}>
        <button className={tab === 'conversations' ? 'active' : ''} onClick={() => setTab('conversations')}>
          <UserCheck size={16} />Conversations
        </button>
        <button className={tab === 'knowledge' ? 'active' : ''} onClick={() => setTab('knowledge')}>
          <BookOpen size={16} />Connaissances
        </button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          <BarChart2 size={16} />Tableau de bord
        </button>
        <button className="icon-button secondary" style={{ marginLeft: 'auto' }} title="Déconnexion" aria-label="Déconnexion" onClick={() => {
          setConnected(false); setKey(''); setKeyDraft(''); setRows([]); setDetail(null);
        }}><LogOut size={17} /></button>
      </nav>

      {tab === 'dashboard' ? <Dashboard apiKey={key} /> : null}
      {tab === 'knowledge' ? <KnowledgeReview apiKey={key} /> : null}

      {tab === 'conversations' ? (
        <section className="support-workspace">
          <div className="workspace-toolbar">
            <h2>Conversations</h2>
            <span className="queue-count">{rows.filter((row) => row.status === 'waiting').length} en attente</span>
            <label className="threshold">Seuil <input aria-label="Seuil de confiance" type="range" min="0" max="100" step="1"
              value={Math.round(threshold * 100)} onChange={(event) => setThreshold(Number(event.target.value) / 100)} />
              <output>{Math.round(threshold * 100)}%</output></label>
            <button disabled={busy || threshold === savedThreshold} onClick={async () => {
              setBusy(true); setError('');
              try { await request('/settings', { method: 'PATCH', body: { threshold } }); setSavedThreshold(threshold); }
              catch (err) { setError(err.message); } finally { setBusy(false); }
            }}><Check size={16} />Appliquer</button>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="support-columns">
            <aside className="queue">
              <div className="queue-toolbar">
                <select aria-label="Filtrer les conversations" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="waiting">En attente</option>
                  <option value="human">Prises en charge</option>
                  <option value="resolved">Résolues</option>
                  <option value="ai">Automatiques</option>
                  <option value="all">Toutes</option>
                </select>
                <button className="icon-button secondary" title="Actualiser" aria-label="Actualiser" onClick={async () => {
                  try { setRows((await request('/conversations')).conversations); } catch (err) { setError(err.message); }
                }}><RefreshCw size={16} /></button>
              </div>
              {(() => {
                const visible = rows.filter((row) => filter === 'all' || row.status === filter);
                return <>
                  {!visible.length ? <p className="muted queue-empty">Aucune conversation.</p> : null}
                  {visible.map((row) => (
                    <button className={`queue-row ${selected === row.id ? 'selected' : ''}`} key={row.id}
                      onClick={() => { setSelected(row.id); setDetail(null); setReply(''); setError(''); }}>
                      <strong>{row.customer?.name || row.id}</strong>
                      <span className={`badge ${row.status}`}>{statusLabels[row.status]}</span>
                      <p>{row.preview}</p>
                      <small>{reasonLabels[row.escalation?.reason] || row.escalation?.reason || 'Support automatique'}</small>
                    </button>
                  ))}
                </>;
              })()}
            </aside>

            {!detail
              ? <div className="workspace-empty"><UserCheck size={32} /><p>{selected ? 'Chargement...' : 'Sélectionnez une conversation.'}</p></div>
              : (
                <div className="case-workspace">
                  <header className="case-header">
                    <div><h2>{detail.customer?.name}</h2><small>{detail.customer?.email}</small></div>
                    <span className={`badge ${detail.status}`}>{statusLabels[detail.status]}</span>
                    {detail.status === 'waiting' ? <button disabled={busy} onClick={() => act('claim')}><UserCheck size={16} />Prendre en charge</button> : null}
                    {detail.status === 'human' ? <>
                      <button className="secondary" disabled={busy} onClick={() => act('resume')}><Bot size={16} />Reprendre avec l'IA</button>
                      <button disabled={busy} onClick={() => act('resolve')}><Check size={16} />Résoudre</button>
                    </> : null}
                  </header>
                  {detail.escalation ? (
                    <div className="handoff-context">
                      <strong>{reasonLabels[detail.escalation.reason] || detail.escalation.reason}</strong>
                      {Number.isFinite(detail.escalation.confidence) ? <span>Score estimé : {Math.round(detail.escalation.confidence * 100)}%</span> : null}
                      <small>Ticket {detail.escalation.ticketId}</small>
                    </div>
                  ) : null}
                  <details className="context-details">
                    <summary>Commandes et outils ({detail.traces.length})</summary>
                    <div className="context-grid">
                      <div>{detail.orders.map((order) => <p key={order.id}>{order.id} · {order.status} · {money(order.total_cents)}</p>)}</div>
                      <div>{detail.traces.map((trace) => (
                        <details key={trace.id}><summary>{trace.name} · {trace.status}</summary>
                          <pre>{JSON.stringify(trace.result || trace.error, null, 2)}</pre>
                        </details>
                      ))}</div>
                    </div>
                  </details>
                  <MessageList messages={detail.messages} />
                  {detail.status === 'human' ? (
                    <form className="composer" onSubmit={(event) => { event.preventDefault(); act('reply'); }}>
                      <textarea aria-label="Réponse conseiller" placeholder="Votre réponse..." maxLength={4000} rows={2}
                        value={reply} onChange={(event) => setReply(event.target.value)} disabled={busy} />
                      <button type="submit" disabled={busy || !reply.trim()}><Send size={16} />Envoyer</button>
                    </form>
                  ) : null}
                </div>
              )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
