import React, { useEffect, useState } from 'react';
import { RefreshCw, UserCheck, Send, Check, Bot, KeyRound, LogOut, BookOpen, Search, X, Pencil, Eye, ShieldCheck } from 'lucide-react';
import { api, statusLabels, reasonLabels, money } from './api.js';
import MessageList from './MessageList.jsx';
import Dashboard from './Dashboard.jsx';

const knowledgeStatusLabels = { new: 'New', review: "Under review", approved: "Approved", rejected: "Rejected", active: 'Active' };

function KnowledgeReview({ apiKey, onUnauthorized, structured = false }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
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
        if (active) { setRows(data.knowledge); setError(''); }
      } catch (err) { if (active) { setError(err.message); if (err.status === 401) onUnauthorized(err.message); } }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [filter, apiKey]);

  async function act(action) {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      let updated;
      if (action === 'approve') updated = await request(`/knowledge/${selected.id}/approve`, { method: 'POST' });
      else if (action === 'reject') updated = await request(`/knowledge/${selected.id}/reject`, { method: 'POST' });
      else if (action === 'revoke') updated = await request(`/knowledge/${selected.id}/revoke`, { method: 'POST' });
      else if (action === 'review') updated = await request(`/knowledge/${selected.id}/review`, { method: 'POST' });
      else if (action === 'save') {
        const patch = {};
        if (editAnswer.trim()) patch.human_answer = editAnswer.trim();
        try { patch.extracted_rule = editRule.trim() ? JSON.parse(editRule.trim()) : null; } catch { throw new Error("Invalid JSON rule."); }
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
        <h2>Learned knowledge</h2>
        <label className="search-field"><Search size={16} /><input aria-label="Search knowledge" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All</option>
          {Object.entries(knowledgeStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="icon-button secondary" title="Refresh" aria-label="Refresh knowledge" onClick={async () => {
          try { const data = await request(`/knowledge${filter ? `?status=${filter}` : ''}`); setRows(data.knowledge); setError(''); }
          catch (err) { setError(err.message); }
        }}><RefreshCw size={16} /></button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="support-columns">
        <aside className="queue">
          {!rows.length ? <p className="muted queue-empty">No knowledge yet.</p> : null}
          {rows.filter((row) => `${row.question} ${row.human_answer} ${row.extracted_rule?.intent || ''}`.toLowerCase().includes(query.toLowerCase())).map((row) => (
            <button key={row.id} data-knowledge-id={row.id}
              className={`queue-row ${selected?.id === row.id ? 'selected' : ''}`}
              onClick={() => { setSelected(row); setEditing(false); setError(''); }}>
              <strong>{row.extracted_rule?.intent || "Answer awaiting approval"}</strong>
              <span className={`badge ${row.status === 'active' ? 'resolved' : row.status === 'rejected' ? '' : 'waiting'}`}>
                {knowledgeStatusLabels[row.status] || row.status}
              </span>
              <p>{row.question}</p>
            </button>
          ))}
        </aside>

        {!selected
          ? <div className="workspace-empty"><BookOpen size={32} /><p>Select a knowledge entry.</p></div>
          : (
            <div className="case-workspace">
              <header className="case-header">
                <div>
                  <h2>{selected.extracted_rule?.intent || "Knowledge from support"}</h2>
                  <small>{new Date(selected.created_at).toLocaleString("en-GB")}</small>
                </div>
                <span className={`badge ${selected.status === 'active' ? 'resolved' : selected.status === 'rejected' ? '' : 'waiting'}`}>
                  {knowledgeStatusLabels[selected.status] || selected.status}
                </span>
                {selected.status === 'new' ? <button className="secondary" disabled={busy || editing} onClick={() => act('review')}><Eye size={16} />Review</button> : null}
                {selected.status === 'active' ? <button className="secondary" disabled={busy} onClick={()=>act('revoke')}><X size={16}/>Remove from assistant</button> : null}
                {['new', 'review', 'approved'].includes(selected.status) ? <>
                  <button disabled={busy || editing} onClick={() => act('approve')}><Check size={16} />{selected.status === 'approved' ? "Retry indexing" : "Approve"}</button>
                  {selected.status !== 'approved' ? <><button className="secondary" disabled={busy || editing} onClick={() => act('reject')}><X size={16} />Reject</button>
                  <button className="secondary" disabled={busy} onClick={() => openEdit(selected)}><Pencil size={16} />Edit</button></> : null}
                </> : null}
              </header>

              <div className="knowledge-detail" style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
                {selected.status === 'active' ? <div className="knowledge-notice"><ShieldCheck size={16} />Approved and available for future answers.</div> : null}
                <div className="knowledge-section">
                  <h3>Customer question</h3>
                  <p className="knowledge-text">{selected.question}</p>
                </div>
                {selected.ai_answer ? <div className="knowledge-section">
                  <h3>Original AI answer</h3>
                  <p className="knowledge-text ai-answer">{selected.ai_answer}</p>
                </div> : null}
                <div className="knowledge-section">
                  <h3>Advisor’s reply</h3>
                  {editing
                    ? <textarea aria-label="Advisor reply" rows={4} value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)} style={{ width: '100%' }} />
                    : <p className="knowledge-text human-answer">{selected.human_answer}</p>}
                </div>
                <div className="knowledge-section">
                  <h3>Extracted rule</h3>
                  {editing && structured ? <div className="admin-edit-form">{[['intent',"Topic"],['condition',"When this rule applies"],['resolution',"General answer"],['notes',"Details (optional)"]].map(([field,label])=><label key={field}>{label}<textarea aria-label={label} rows={field==='resolution'?4:2} maxLength={2000} value={(editRule?JSON.parse(editRule):{})[field]||''} onChange={(event)=>setEditRule(JSON.stringify({...editRule?JSON.parse(editRule):{},[field]:event.target.value||null}))}/></label>)}<p className="muted">Keep only information that applies to all customers.</p></div> : editing
                    ? <textarea aria-label="JSON rule" rows={8} value={editRule}
                        onChange={(e) => setEditRule(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
                    : selected.extracted_rule && structured ? <div className="rule-fields">{[['intent',"Topic"],['condition','Condition'],['resolution',"General answer"],['notes',"Details"]].map(([field,label])=>selected.extracted_rule[field]&&<div key={field}><strong>{label}</strong><p className="knowledge-text">{selected.extracted_rule[field]}</p></div>)}</div> : selected.extracted_rule
                      ? <pre className="knowledge-rule">{JSON.stringify(selected.extracted_rule, null, 2)}</pre>
                      : <p className="muted">No extracted rule.</p>}
                </div>
                {editing
                  ? <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                      <button disabled={busy} onClick={() => act('save')}><Check size={16} />Save</button>
                      <button className="secondary" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                  : null}
              </div>
            </div>
          )}
      </div>
    </section>
  );
}

export default function SupportWorkspace({ demoMode, sessionUser, onUnauthorized, loading, tab = 'dashboard', onTabChange }) {
  const [key, setKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [connected, setConnected] = useState(demoMode || sessionUser?.role==='admin');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('waiting');
  const [threshold, setThreshold] = useState(0.85);
  const [savedThreshold, setSavedThreshold] = useState(0.85);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setTab = onTabChange;
  const [query, setQuery] = useState('');
  const request = (path, options = {}) => api(`/support${path}`, { ...options, support: true, key });
  useEffect(() => { if (demoMode) setConnected(true); }, [demoMode]);

  useEffect(() => {
    if (!connected || tab !== 'conversations') return;
    let active = true;
    async function refresh() {
      try {
        const data = await api('/support/conversations', { support: true, key });
        if (active) { setRows(data.conversations); setError(''); }
      } catch (err) {
        if (active) { setError(err.message); if (err.status === 401) {setConnected(false);onUnauthorized?.();} }
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

  if (loading) return <p className="muted" role="status">Connecting to your workspace…</p>;
  if (!connected) return (
    <form className="access-form" onSubmit={(event) => {
      event.preventDefault(); setKey(keyDraft); setConnected(true); setError('');
    }}>
      <KeyRound size={24} /><h2>Advisor access</h2>
      <label>Access key<input type="password" autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} /></label>
      <button type="submit"><KeyRound size={16} />Sign in</button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );

  return (
    <section style={{ minHeight: 560 }}>
      {!demoMode && !sessionUser ? <div className="support-session"><span><ShieldCheck size={14} />Advisor session</span>
        <button className="icon-button secondary" style={{ marginLeft: 'auto' }} title="Sign out" aria-label="Sign out" onClick={() => {
          setConnected(false); setKey(''); setKeyDraft(''); setRows([]); setDetail(null);
        }}><LogOut size={17} /></button>
      </div> : null}

      {tab === 'dashboard' ? <Dashboard apiKey={key} onUnauthorized={(message) => { setError(message); setConnected(false); onUnauthorized?.(); }} onKnowledge={() => setTab('knowledge')} onSelect={(id) => {
        setSelected(id); setDetail(null); setReply(''); setFilter('all'); setTab('conversations');
      }} /> : null}
      {tab === 'knowledge' ? <KnowledgeReview structured={!!sessionUser} apiKey={key} onUnauthorized={(message) => { setError(message); setConnected(false); onUnauthorized?.(); }} /> : null}

      {tab === 'conversations' ? (
        <section className="support-workspace">
          <div className="workspace-toolbar">
            <h2>Conversations</h2>
            <span className="queue-count">{rows.filter((row) => row.status === 'waiting').length} waiting</span>
            <label className="threshold">Threshold <input aria-label="Confidence threshold" type="range" min="0" max="100" step="1"
              value={Math.round(threshold * 100)} onChange={(event) => setThreshold(Number(event.target.value) / 100)} />
              <output>{Math.round(threshold * 100)}%</output></label>
            <button disabled={busy || threshold === savedThreshold} onClick={async () => {
              setBusy(true); setError('');
              try { await request('/settings', { method: 'PATCH', body: { threshold } }); setSavedThreshold(threshold); }
              catch (err) { setError(err.message); } finally { setBusy(false); }
            }}><Check size={16} />Apply</button>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="support-columns">
            <aside className="queue">
              <label className="search-field queue-search"><Search size={16} /><input aria-label="Search conversations" placeholder="Search customers or messages…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
              <div className="queue-toolbar">
                <select aria-label="Filter conversations" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="waiting">Waiting</option>
                  <option value="human">Assigned</option>
                  <option value="resolved">Resolved</option>
                  <option value="ai">Automatic</option>
                  <option value="all">All</option>
                </select>
                <button className="icon-button secondary" title="Refresh" aria-label="Refresh" onClick={async () => {
                  try { setRows((await request('/conversations')).conversations); } catch (err) { setError(err.message); }
                }}><RefreshCw size={16} /></button>
              </div>
              {(() => {
                const visible = rows.filter((row) => (filter === 'all' || row.status === filter) &&
                  `${row.id} ${row.customer?.name || ''} ${row.preview}`.toLowerCase().includes(query.toLowerCase()));
                return <>
                  {!visible.length ? <p className="muted queue-empty">No conversations yet.</p> : null}
                  {visible.map((row) => (
                    <button className={`queue-row ${selected === row.id ? 'selected' : ''}`} key={row.id} data-conversation-id={row.id}
                      onClick={() => { setSelected(row.id); setDetail(null); setReply(''); setError(''); }}>
                      <strong>{row.customer?.name || row.id}</strong>
                      <span className={`badge ${row.status}`}>{statusLabels[row.status]}</span>
                      <p>{row.preview}</p>
                      <small>{reasonLabels[row.escalation?.reason] || row.escalation?.reason || "Automatic support"}</small>
                    </button>
                  ))}
                </>;
              })()}
            </aside>

            {!detail
              ? <div className="workspace-empty"><UserCheck size={32} /><p>{selected ? 'Chargement...' : "Select a conversation."}</p></div>
              : (
                <div className="case-workspace">
                  <header className="case-header">
                    <div><h2>{detail.customer?.name}</h2><small>{detail.customer?.email}</small></div>
                    <span className={`badge ${detail.status}`}>{statusLabels[detail.status]}</span>
                    {detail.status === 'waiting' ? <button disabled={busy} onClick={() => act('claim')}><UserCheck size={16} />Take over</button> : null}
                    {detail.status === 'human' ? <>
                      <button className="secondary" disabled={busy} onClick={() => act('resume')}><Bot size={16} />Resume with AI</button>
                      <button disabled={busy} onClick={() => act('resolve')}><Check size={16} />Resolve</button>
                    </> : null}
                  </header>
                  {detail.escalation ? (
                    <div className="handoff-context">
                      <strong>{reasonLabels[detail.escalation.reason] || detail.escalation.reason}</strong>
                      {Number.isFinite(detail.escalation.confidence) ? <span>Estimated score: {Math.round(detail.escalation.confidence * 100)}%</span> : null}
                      <small>Ticket {detail.escalation.ticketId}</small>
                    </div>
                  ) : null}
                  <details className="context-details">
                    <summary>Orders and tools ({detail.traces.length})</summary>
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
                      <textarea aria-label="Advisor reply" placeholder="Your reply…" maxLength={4000} rows={2}
                        value={reply} onChange={(event) => setReply(event.target.value)} disabled={busy} />
                      <button type="submit" disabled={busy || !reply.trim()}><Send size={16} />Send</button>
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
