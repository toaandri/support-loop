import React, { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, CheckCheck, Clock3, Headset, MessagesSquare, Sparkles, ShieldCheck } from 'lucide-react';
import { api, statusLabels, reasonLabels } from './api.js';

const n = (value) => Number(value) || 0;
const pct = (a, b) => b > 0 ? `${Math.round(n(a) / n(b) * 100)}%` : '—';
export default function Dashboard({ apiKey, onSelect, onKnowledge, onUnauthorized }) {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [data, conversations] = await Promise.all([api('/support/stats', { support: true, key: apiKey }),
          api('/support/conversations', { support: true, key: apiKey })]);
        if (active) { setStats(data); setRows(conversations.conversations); setError(''); }
      } catch (err) { if (active) { setError(err.message); if (err.status === 401) onUnauthorized(err.message); } }
    }
    refresh(); const interval = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [apiKey]);
  if (!stats) return <p className={error ? 'error' : 'muted'} role="status">{error || "Loading your activity…"}</p>;
  const total = n(stats.conversations_total);
  const resolved = n(stats.conversations_resolved);
  const escalated = n(stats.conversations_escalated);
  const active = n(stats.learned_knowledge_active);
  const pending = n(stats.learned_knowledge_pending_review);
  const split = [
    { label: "Automatic", value: n(stats.conversations_ai), color: '#3b8068' },
    { label: "Resolved", value: resolved, color: '#b9d6bf' },
    { label: "Waiting", value: n(stats.conversations_waiting), color: '#e3ad58' },
    { label: "With an advisor", value: n(stats.conversations_human), color: '#8197bd' }
  ];
  let angle = 0;
  const gradient = split.map((item) => { const start = angle; angle += total ? item.value / total * 360 : 0; return `${item.color} ${start}deg ${angle}deg`; }).join(',');
  const response = stats.average_response_ms === null ? '—' : stats.average_response_ms < 1000 ? '< 1 s' : `${(stats.average_response_ms / 1000).toFixed(1)} s`;
  return <div className="dashboard">
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="dashboard-toolbar"><span><i className="live-dot" />Live activity <span className="muted">· Refreshes every 5 s</span></span><span className="period-chip">Last 7 days · UTC</span></div>
    <div className="kpi-grid">
      {[
        { label: "Conversations", value: total, icon: MessagesSquare, detail: `${n(stats.conversations_today)} opened today`, color: 'green' },
        { label: "Resolution rate", value: pct(resolved, total), icon: CheckCheck, detail: `${resolved} case${resolved > 1 ? "s resolved" : " resolved"} by an advisor`, color: 'mint' },
        { label: "Human handoff", value: pct(escalated, total), icon: Headset, detail: `${n(stats.conversations_waiting)} waiting for an advisor`, color: 'amber' },
        { label: "Active knowledge", value: active, icon: BookOpen, detail: `${pending} proposal${pending > 1 ? 's' : ''} awaiting review`, color: 'blue' }
      ].map((item) => <article className="kpi" key={item.label}><div className="kpi-top"><span>{item.label}</span><span className={`kpi-icon ${item.color}`}><item.icon size={18} /></span></div>
        <strong className="kpi-value">{item.value}</strong><span className="kpi-detail">{item.detail}</span></article>)}
    </div>
    <div className="analytics-grid"><section className="panel activity-panel"><div className="section-heading"><div><h2>The rhythm of your support</h2><p className="muted">Conversations opened and handoffs per day</p></div><span className="chart-legend"><i />Conversations <i className="amber" />Handoffs</span></div>
      <ActivityChart daily={stats.daily || []} />
      <div className="chart-footer"><span><Clock3 size={15} />Average response time <strong>{response}</strong></span><span>{n(stats.ai_responses)} automatic responses</span></div>
    </section><section className="panel distribution-panel"><h2>Where do conversations stand?</h2><p className="muted">Current case distribution</p>
      <div className="donut" role="img" aria-label={split.map((s) => `${s.label} : ${s.value}`).join(', ')} style={{ background: total ? `conic-gradient(${gradient})` : '#edf0ec' }}>
        <div><strong>{total}</strong><span>conversations</span></div></div>
      <div className="distribution-legend">{split.map((item) => <div key={item.label}><span><i style={{ background: item.color }} />{item.label}</span><strong>{item.value}</strong></div>)}</div>
    </section></div>
    <div className="dashboard-bottom"><section className="panel recent-panel"><div className="section-heading"><div><h2>Recent conversations</h2><p className="muted">Useful context, close at hand.</p></div><button className="text-button" onClick={() => onSelect('')}>View all <ArrowUpRight size={16} /></button></div>
      {rows.length ? <div className="conversation-table"><div className="table-heading"><span>Customer / request</span><span>Status</span><span>Updated</span></div>
        {rows.slice(0, 4).map((row) => <button className="conversation-table-row" key={row.id} onClick={() => onSelect(row.id)}>
          <span className="table-customer"><span className="avatar">{row.customer?.name?.split(' ').map((name) => name[0]).join('') || 'CL'}</span><span><strong>{row.customer?.name || "Customer"}</strong><small>{row.preview}</small></span></span>
          <span className={`badge ${row.status}`}>{statusLabels[row.status]}</span><span className="muted">{new Date(row.updatedAt).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}<ArrowUpRight size={14} /></span>
        </button>)}</div> : <div className="workspace-empty"><MessagesSquare size={28} /><p>Your first conversation starts in the customer workspace.</p></div>}
    </section><section className="learning-card"><div className="learning-card-top"><span className="kpi-icon green"><Sparkles size={21} /></span><span className="eyebrow">LEARNING LOOP</span></div>
      <h2>The next good answer<br /> starts here.</h2><p>Every human resolution can improve your support. You have the final say.</p>
      <div className="learning-count"><strong>{pending}</strong><span>connaissance{pending > 1 ? 's' : ''}<br />to review</span></div><button onClick={onKnowledge}>Open knowledge <ArrowUpRight size={16} /></button>
      <small><ShieldCheck size={12} />Activated only after approval</small></section></div>
    <details className="metrics-details"><summary>View detailed metrics</summary><div className="metrics-grid"><div><strong>{n(stats.tickets_open)}</strong><span>Open tickets</span></div><div><strong>{n(stats.tickets_resolved)}</strong><span>Resolved tickets</span></div><div><strong>{n(stats.human_responses)}</strong><span>Human replies</span></div><div><strong>{n(stats.learned_knowledge_total)}</strong><span>Proposed knowledge</span></div></div>
      <div className="metrics-grid">{Object.entries(stats.escalation_reasons || {}).map(([reason, count]) => <div key={reason}><strong>{count}</strong><span>{reasonLabels[reason] || reason}</span></div>)}</div>
    </details>
  </div>;
}

function ActivityChart({ daily }) {
  const max = Math.max(1, ...daily.map((day) => day.conversations), ...daily.map((day) => day.escalations));
  const width = 640, height = 210, left = 28, top = 18, bottom = 180;
  const x = (i) => left + i * ((width - left - 20) / 6);
  const y = (v) => bottom - v / max * (bottom - top);
  const points = daily.map((day, i) => `${x(i)},${y(day.conversations)}`).join(' ');
  return <svg className="activity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Activity over seven days: ${daily.map((d) => `${d.date}, ${d.conversations} conversations, ${d.escalations} handoffs`).join('; ')}`}>
    <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3b8068" stopOpacity=".16" /><stop offset="100%" stopColor="#3b8068" stopOpacity=".01" /></linearGradient></defs>
    {[0, .5, 1].map((v) => <g key={v}><line x1={left} y1={y(max * v)} x2={width - 20} y2={y(max * v)} stroke="#e9ece7" strokeDasharray="3 5" /><text x="2" y={y(max * v) + 4}>{Math.round(max * v)}</text></g>)}
    {points ? <><polygon points={`${x(0)},${bottom} ${points} ${x(daily.length - 1)},${bottom}`} fill="url(#chart-fill)" /><polyline points={points} fill="none" stroke="#3b8068" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={daily.map((day, i) => `${x(i)},${y(day.escalations)}`).join(' ')} fill="none" stroke="#daa044" strokeWidth="2" strokeDasharray="5 5" />
      {daily.map((day, i) => <g key={day.date}><circle cx={x(i)} cy={y(day.conversations)} r="4" fill="#3b8068" stroke="white" strokeWidth="2"><title>{day.date} : {day.conversations} conversations, {day.escalations} transferts</title></circle>
        <text x={x(i)} y={203} textAnchor="middle">{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: 'short', timeZone: 'UTC' })}</text></g>)}</> : null}
  </svg>;
}
