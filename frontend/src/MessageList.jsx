import React, { useEffect, useRef } from 'react';
import { User, Bot, Headset } from 'lucide-react';

export default function MessageList({ messages = [] }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  return <div className="messages" aria-live="polite">
    {!messages.length ? <div className="empty-state"><Headset size={32} /><p>Bonjour. Comment pouvons-nous vous aider ?</p></div> : null}
    {messages.map((message) => {
      const Icon = message.role === 'user' ? User : message.role === 'human' ? Headset : Bot;
      return <article className={`message ${message.role}`} key={message.id}>
        <div className="message-author"><Icon size={14} />{message.role === 'user' ? 'Client' : message.role === 'human' ?
          message.metadata?.agentName || 'Conseiller' : message.role === 'system' ? 'Conversation' : 'SupportLoop'}</div>
        <p>{message.content}</p>
        {Number.isFinite(message.metadata?.confidence) ? <small>Score estime : {Math.round(message.metadata.confidence * 100)}%</small> : null}
        {message.metadata?.tools?.length ? <small>{message.metadata.tools.map((tool) => tool.name).join(' · ')}</small> : null}
        {message.metadata?.sources?.length ? <div className="sources">{message.metadata.sources.map((source, index) =>
          <details key={`${source.id}-${index}`}><summary>[{source.citation}] {source.source}</summary><p>{source.excerpt || source.content}</p></details>)}</div> : null}
        <time>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</time>
      </article>;
    })}
    <div ref={end} />
  </div>;
}
