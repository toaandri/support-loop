import React, { useEffect, useRef } from 'react';
import { User, Bot, Headset, Sparkles, BookOpen } from 'lucide-react';

export default function MessageList({ messages = [], brandName='SupportLoop', friendlySources=false }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [messages.length]);
  return <div className="messages" tabIndex={0} aria-live="polite" role="log" aria-label="Message history">
    {!messages.length ? <div className="empty-state"><span className="welcome-icon"><Sparkles size={29} /></span><span className="eyebrow">{brandName.toUpperCase()}</span>
      <h3>Have a question? We are here.</h3><p>Track an order, read our policies<br />or talk to an advisor.</p></div> : null}
    {messages.map((message) => {
      const Icon = message.role === 'user' ? User : message.role === 'human' ? Headset : Bot;
      return <article className={`message ${message.role}`} key={message.id}>
        <div className="message-author"><Icon size={14} />{message.role === 'user' ? 'You' : message.role === 'human' ?
          message.metadata?.agentName || "Advisor" : message.role === 'system' ? 'Conversation' : brandName}
          <time>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' }) : ''}</time></div>
        <p>{message.content}</p>
        {message.metadata?.sources?.length ? <div className="sources">{message.metadata.sources.map((source, index) =>
          <details key={`${source.id}-${index}`}><summary><BookOpen size={12} />Source [{source.citation}] · {source.source.startsWith('learned/') ? "Approved knowledge" : friendlySources ? source.content?.split('\n')[0].replace(/^#\s*/,'') || "Help centre" : source.source}</summary><p>{source.excerpt || source.content}</p></details>)}</div> : null}
      </article>;
    })}
    <div ref={end} />
  </div>;
}
