import React, { useEffect, useRef } from 'react';
import { User, Bot, Headset, Sparkles, BookOpen } from 'lucide-react';

export default function MessageList({ messages = [], brandName='SupportLoop', friendlySources=false }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages.length]);
  return <div className="messages" aria-live="polite" role="log" aria-label="Historique des messages">
    {!messages.length ? <div className="empty-state"><span className="welcome-icon"><Sparkles size={29} /></span><span className="eyebrow">{brandName.toUpperCase()}</span>
      <h3>Une question ? On est là.</h3><p>Suivez une commande, consultez nos politiques<br />ou échangez avec un conseiller.</p></div> : null}
    {messages.map((message) => {
      const Icon = message.role === 'user' ? User : message.role === 'human' ? Headset : Bot;
      return <article className={`message ${message.role}`} key={message.id}>
        <div className="message-author"><Icon size={14} />{message.role === 'user' ? 'Vous' : message.role === 'human' ?
          message.metadata?.agentName || 'Conseiller' : message.role === 'system' ? 'Conversation' : brandName}
          <time>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</time></div>
        <p>{message.content}</p>
        {message.metadata?.sources?.length ? <div className="sources">{message.metadata.sources.map((source, index) =>
          <details key={`${source.id}-${index}`}><summary><BookOpen size={12} />Source [{source.citation}] · {source.source.startsWith('learned/') ? 'Connaissance validée' : friendlySources ? source.content?.split('\n')[0].replace(/^#\s*/,'') || 'Centre d’aide' : source.source}</summary><p>{source.excerpt || source.content}</p></details>)}</div> : null}
      </article>;
    })}
    <div ref={end} />
  </div>;
}
