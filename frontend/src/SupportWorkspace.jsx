import React, { useEffect, useState } from 'react';
import { RefreshCw, UserCheck, Send, Check, Bot, KeyRound, LogOut } from 'lucide-react';
import { api, statusLabels, reasonLabels, money } from './api.js';
import MessageList from './MessageList.jsx';

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
  const request = (path, options = {}) => api(`/support${path}`, { ...options, support: true, key });
  useEffect(() => { if (demoMode) setConnected(true); }, [demoMode]);

  useEffect(() => {
    if (!connected) return;
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
  }, [connected, key]);

  useEffect(() => {
    if (!selected || !connected || busy) return;
    let active = true;
    async function refresh() {
      try {
        const data = await api(`/support/conversations/${encodeURIComponent(selected)}`, { support: true, key });
        if (active) setDetail(data);
      } catch (err) { if (active) setError(err.message); }
    }
    refresh(); const interval = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [selected, connected, key, busy]);

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

  if (!connected) return <form className="access-form" onSubmit={(event) => {
    event.preventDefault(); setKey(keyDraft); setConnected(true); setError('');
  }}><KeyRound size={24} /><h2>Acces conseiller</h2>
    <label>Cle d'acces<input type="password" autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} /></label>
    <button type="submit"><KeyRound size={16} />Connexion</button>{error ? <p className="error" role="alert">{error}</p> : null}</form>;

  const visible = rows.filter((row) => filter === 'all' || row.status === filter);
  return <section className="support-workspace">
    <div className="workspace-toolbar">
      <h2>Conversations</h2><span className="queue-count">{rows.filter((row) => row.status === 'waiting').length} en attente</span>
      <label className="threshold">Seuil <input aria-label="Seuil de confiance" type="range" min="0" max="100" step="1"
        value={Math.round(threshold * 100)} onChange={(event) => setThreshold(Number(event.target.value) / 100)} />
        <output>{Math.round(threshold * 100)}%</output></label>
      <button disabled={busy || threshold === savedThreshold} onClick={async () => {
        setBusy(true); setError('');
        try { await request('/settings', { method: 'PATCH', body: { threshold } }); setSavedThreshold(threshold); }
        catch (err) { setError(err.message); } finally { setBusy(false); }
      }}><Check size={16} />Appliquer</button>
      <button className="icon-button secondary" title="Deconnexion" aria-label="Deconnexion" onClick={() => {
        setConnected(false); setKey(''); setKeyDraft(''); setRows([]); setDetail(null);
      }}><LogOut size={17} /></button>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="support-columns">
      <aside className="queue">
        <div className="queue-toolbar"><select aria-label="Filtrer les conversations" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="waiting">En attente</option><option value="human">Prises en charge</option><option value="resolved">Resolues</option>
          <option value="ai">Automatiques</option><option value="all">Toutes</option></select>
          <button className="icon-button secondary" title="Actualiser" aria-label="Actualiser" onClick={async () => {
            try { setRows((await request('/conversations')).conversations); } catch (err) { setError(err.message); }
          }}><RefreshCw size={16} /></button></div>
        {!visible.length ? <p className="muted queue-empty">Aucune conversation.</p> : null}
        {visible.map((row) => <button className={`queue-row ${selected === row.id ? 'selected' : ''}`} key={row.id}
          onClick={() => { setSelected(row.id); setDetail(null); setReply(''); setError(''); }}>
          <strong>{row.customer?.name || row.id}</strong><span className={`badge ${row.status}`}>{statusLabels[row.status]}</span>
          <p>{row.preview}</p><small>{reasonLabels[row.escalation?.reason] || row.escalation?.reason || 'Support automatique'}</small>
        </button>)}
      </aside>
      {!detail ? <div className="workspace-empty"><UserCheck size={32} /><p>{selected ? 'Chargement...' : 'Selectionnez une conversation.'}</p></div> :
        <div className="case-workspace">
          <header className="case-header"><div><h2>{detail.customer?.name}</h2><small>{detail.customer?.email}</small></div>
            <span className={`badge ${detail.status}`}>{statusLabels[detail.status]}</span>
            {detail.status === 'waiting' ? <button disabled={busy} onClick={() => act('claim')}><UserCheck size={16} />Prendre en charge</button> : null}
            {detail.status === 'human' ? <><button className="secondary" disabled={busy} onClick={() => act('resume')}><Bot size={16} />Reprendre avec l'IA</button>
              <button disabled={busy} onClick={() => act('resolve')}><Check size={16} />Resoudre</button></> : null}
          </header>
          {detail.escalation ? <div className="handoff-context"><strong>{reasonLabels[detail.escalation.reason] || detail.escalation.reason}</strong>
            {Number.isFinite(detail.escalation.confidence) ? <span>Score estime : {Math.round(detail.escalation.confidence * 100)}%</span> : null}
            <small>Ticket {detail.escalation.ticketId}</small></div> : null}
          <details className="context-details"><summary>Commandes et outils ({detail.traces.length})</summary>
            <div className="context-grid"><div>{detail.orders.map((order) => <p key={order.id}>{order.id} · {order.status} · {money(order.total_cents)}</p>)}</div>
              <div>{detail.traces.map((trace) => <details key={trace.id}><summary>{trace.name} · {trace.status}</summary>
                <pre>{JSON.stringify(trace.result || trace.error, null, 2)}</pre></details>)}</div></div></details>
          <MessageList messages={detail.messages} />
          {detail.status === 'human' ? <form className="composer" onSubmit={(event) => { event.preventDefault(); act('reply'); }}>
            <textarea aria-label="Reponse conseiller" placeholder="Votre reponse..." maxLength={4000} rows={2} value={reply}
              onChange={(event) => setReply(event.target.value)} disabled={busy} />
            <button type="submit" disabled={busy || !reply.trim()}><Send size={16} />Envoyer</button></form> : null}
        </div>}
    </div>
  </section>;
}
