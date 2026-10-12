import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  MessageCircle,
  MessagesSquare,
  Package,
  BookOpen,
  Plus,
  Send,
  Search,
  ShieldCheck,
  Check,
  Headset,
} from "lucide-react";
import { api, money, statusLabels } from "./api.js";
import MessageList from "./MessageList.jsx";
const orderLabels = {
  processing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};
export default function CustomerPortal({
  health,
  user,
  view,
  navigate,
  onUnauthorized,
}) {
  const [products, setProducts] = useState([]),
    [articles, setArticles] = useState([]),
    [orders, setOrders] = useState([]),
    [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]),
    [id, setId] = useState(""),
    [status, setStatus] = useState("ai"),
    [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false);
  const [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setQuery("");
    setError("");
    let active = true;
    Promise.all([api("/products"), api("/articles")])
      .then(([a, b]) => {
        if (active) {
          setProducts(a.products);
          setArticles(b.articles);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [view]);
  useEffect(() => {
    setMessages([]);
    setOrders([]);
    setConversations([]);
    setDraft("");
    if (user?.role !== "customer") {
      setId("");
      return;
    }
    const key = `supportloop-chat-${user.id}`;
    let saved = localStorage.getItem(key);
    if (!saved) {
      saved = crypto.randomUUID();
      localStorage.setItem(key, saved);
    }
    setId(saved);
    let active = true;
    const refresh = () =>
      Promise.all([api("/orders"), api("/conversations")])
        .then(([a, b]) => {
          if (active) {
            setOrders(a.orders);
            setConversations(b.conversations);
          }
        })
        .catch((err) => {
          if (active) {
            setError(err.message);
            if (err.status === 401) onUnauthorized();
          }
        });
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);
  useEffect(() => {
    if (!id || view !== "support" || sending || !user) return;
    let active = true;
    const refresh = () =>
      api(`/conversations/${encodeURIComponent(id)}/messages`)
        .then((value) => {
          if (active) {
            setMessages(value.messages);
            setStatus(value.status);
          }
        })
        .catch((err) => {
          if (active) {
            setError(err.message);
            if (err.status === 401) onUnauthorized();
          }
        });
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, view, sending, user]);
  function openConversation(cid) {
    setId(cid);
    localStorage.setItem(`supportloop-chat-${user.id}`, cid);
    setMessages([]);
    setDraft("");
    navigate("support");
  }
  function startConversation(text = "") {
    if (user?.role !== "customer") {
      navigate("support");
      return;
    }
    openConversation(crypto.randomUUID());
    setStatus("ai");
    setDraft(text);
  }
  async function send(event) {
    event.preventDefault();
    if (sending || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const result = await api("/chat", {
        method: "POST",
        body: { conversationId: id, message: draft.trim(), channel: "web" },
      });
      setMessages(result.history);
      setStatus(result.status);
      setDraft("");
    } catch (err) {
      setError(err.message);
      if (err.status === 401) onUnauthorized();
    } finally {
      setSending(false);
    }
  }
  const heading = (eyebrow, title, action) => (
    <div className="portal-section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
  const search = (label, placeholder) => (
    <label className="search-field">
      <Search size={17} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </label>
  );
  let body;
  if (view === "support")
    body = (
      <>
        {heading(
          "À VOTRE ÉCOUTE",
          "Parlons de votre demande.",
          <button className="secondary" onClick={() => startConversation()}>
            <Plus size={16} />
            Nouvelle demande
          </button>,
        )}
        <div className="portal-support-grid">
          <section className="chat-panel">
            <header className="chat-header">
              <span className="agent-avatar">
                <Headset size={21} />
              </span>
              <div>
                <h2>L’équipe {health.brandName}</h2>
                <small>Votre demande reste suivie jusqu’à sa résolution.</small>
              </div>
              <span className={`badge ${status}`}>{statusLabels[status]}</span>
            </header>
            {["waiting", "human"].includes(status) && (
              <div className="handoff-banner">
                <Headset size={17} />
                {status === "waiting"
                  ? "Un conseiller va prendre le relais. Vous pouvez ajouter des précisions."
                  : "Un conseiller suit votre demande."}
              </div>
            )}
            {status === "resolved" && (
              <div className="handoff-banner resolved">
                Cette demande est résolue. Vous pouvez nous écrire à nouveau.
              </div>
            )}
            <MessageList
              messages={messages}
              brandName={health.brandName}
              friendlySources
            />
            {!messages.length && (
              <div className="quick-prompts">
                {[
                  "Je souhaite suivre une commande",
                  "J’ai une question sur un produit",
                  "Je souhaite parler à un conseiller",
                ].map((text) => (
                  <button
                    className="secondary"
                    key={text}
                    onClick={() => setDraft(text)}
                  >
                    {text}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
            {sending && (
              <p className="status" role="status">
                Votre demande est en cours…
              </p>
            )}
            <form className="composer" onSubmit={send}>
              <textarea
                aria-label="Message client"
                maxLength={4000}
                placeholder="Décrivez votre demande…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={sending}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    send(e);
                  }
                }}
              />
              <button disabled={sending || !draft.trim()} aria-label="Envoyer">
                <Send size={18} />
                <span>Envoyer</span>
              </button>
            </form>
          </section>
          <aside className="portal-history panel">
            <h2>Vos échanges récents</h2>
            <p className="muted">
              Reprenez une demande là où vous l’avez laissée.
            </p>
            {conversations.length ? (
              conversations.slice(0, 8).map((row) => (
                <button
                  key={row.id}
                  className={`request-link ${id === row.id ? "selected" : ""}`}
                  onClick={() => openConversation(row.id)}
                >
                  <span>{row.preview}</span>
                  <small>
                    <span className={`badge ${row.status}`}>
                      {statusLabels[row.status]}
                    </span>
                    {new Date(row.updatedAt).toLocaleDateString("fr-FR")}
                  </small>
                </button>
              ))
            ) : (
              <p className="muted">Votre premier échange apparaîtra ici.</p>
            )}
          </aside>
        </div>
      </>
    );
  else if (view === "requests")
    body = (
      <>
        {heading(
          "VOTRE SUIVI",
          "Mes demandes",
          <button onClick={() => startConversation()}>
            <Plus size={16} />
            Créer une demande
          </button>,
        )}
        <div className="request-list">
          {conversations.length ? (
            conversations.map((row) => (
              <button
                key={row.id}
                className="request-card"
                onClick={() => openConversation(row.id)}
              >
                <span className="request-icon">
                  <MessageCircle size={22} />
                </span>
                <span>
                  <strong>{row.preview}</strong>
                  <small>
                    Mis à jour le{" "}
                    {new Date(row.updatedAt).toLocaleDateString("fr-FR")}
                  </small>
                </span>
                <span className={`badge ${row.status}`}>
                  {statusLabels[row.status]}
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))
          ) : (
            <Empty
              icon={MessagesSquare}
              title="Tout commence par une question."
              text="Créez votre première demande. Notre équipe vous accompagnera."
              action="Créer une demande"
              onClick={() => startConversation()}
            />
          )}
        </div>
      </>
    );
  else if (view === "orders")
    body = (
      <>
        {heading(
          "VOTRE ESPACE",
          "Mes commandes",
          <button className="secondary" onClick={() => navigate("requests")}>
            Mes demandes <ArrowRight size={15} />
          </button>,
        )}
        <div className="portal-order-grid">
          {orders.length ? (
            orders.map((order) => (
              <article className="panel order-card" key={order.id}>
                <span className="eyebrow">{order.id}</span>
                <h2>{money(order.total_cents)}</h2>
                <span
                  className={`badge ${order.status === "delivered" ? "resolved" : "ai"}`}
                >
                  {orderLabels[order.status]}
                </span>
                {order.tracking_number && (
                  <p className="muted">Suivi : {order.tracking_number}</p>
                )}
                <button
                  className="secondary"
                  onClick={() =>
                    startConversation(
                      `Je souhaite des informations sur la commande ${order.id}`,
                    )
                  }
                >
                  Contacter le support <ArrowUpRight size={15} />
                </button>
              </article>
            ))
          ) : (
            <Empty
              icon={Package}
              title="Aucune commande pour le moment."
              text="Les commandes associées à votre compte seront affichées ici."
              action="Contacter le support"
              onClick={() => startConversation()}
            />
          )}
        </div>
      </>
    );
  else if (view === "catalog")
    body = (
      <>
        {heading(
          "INFORMATIONS & DISPONIBILITÉ",
          "Le catalogue",
          search("Rechercher un produit", "Rechercher…"),
        )}
        <div className="product-grid">
          {products
            .filter((p) =>
              `${p.name} ${p.description} ${p.id}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((product) => (
              <article className="product" key={product.id}>
                <div className="product-visual">
                  {product.image_url?.startsWith("/products/") ? (
                    <img src={product.image_url} alt={product.name} />
                  ) : (
                    <Package size={72} strokeWidth={1} />
                  )}
                  <span
                    className={`badge ${product.stock > 0 ? "resolved" : "waiting"}`}
                  >
                    {product.stock > 0 ? "Disponible" : "Indisponible"}
                  </span>
                </div>
                <div className="product-info">
                  <span className="eyebrow">{product.id}</span>
                  <h2>{product.name}</h2>
                  <p>{product.description}</p>
                  <div className="product-price">
                    <strong>{money(product.price_cents)}</strong>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      startConversation(
                        `J’ai une question sur le produit ${product.id} : ${product.name}`,
                      )
                    }
                  >
                    Poser une question <ArrowUpRight size={16} />
                  </button>
                </div>
              </article>
            ))}
        </div>
        {!products.length && (
          <Empty
            icon={Package}
            title="Le catalogue sera disponible prochainement."
            text="Notre équipe peut déjà répondre à vos questions."
            action="Contacter le support"
            onClick={() => startConversation()}
          />
        )}{" "}
        {!!products.length &&
          !products.some((p) =>
            `${p.name} ${p.description} ${p.id}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) && <p className="muted">Aucun résultat pour cette recherche.</p>}
      </>
    );
  else if (view === "help")
    body = (
      <>
        {heading(
          "LES RÉPONSES À PORTÉE DE MAIN",
          "Centre d’aide",
          search("Rechercher un article", "Rechercher une réponse…"),
        )}
        <div className="help-articles">
          {articles
            .filter((a) =>
              `${a.title} ${a.content}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((article) => (
              <details className="panel help-article" key={article.id}>
                <summary>
                  <BookOpen size={18} />
                  {article.title}
                  <Plus size={18} />
                </summary>
                <p>{article.content}</p>
              </details>
            ))}
        </div>
        {!articles.length && (
          <Empty
            icon={BookOpen}
            title="Besoin d’une réponse personnalisée ?"
            text="L’équipe est disponible pour vous accompagner."
            action="Poser ma question"
            onClick={() => startConversation()}
          />
        )}
        <div className="contact-strip">
          <div>
            <h2>Votre question mérite une réponse.</h2>
            <p>Décrivez votre situation, nous nous occupons de la suite.</p>
          </div>
          <button onClick={() => startConversation()}>
            Contacter le support <ArrowRight size={17} />
          </button>
        </div>
      </>
    );
  else
    body = (
      <>
        <section className="portal-hero">
          <div>
            <span className="eyebrow">
              {user?.role === "customer"
                ? `BIENVENUE, ${user.name.split(" ")[0].toUpperCase()}`
                : "VOTRE ESPACE DE SUPPORT"}
            </span>
            <h1>
              Des réponses claires.
              <br />
              <span>Un suivi qui continue.</span>
            </h1>
            <p>
              Une question, une commande à suivre, un problème à résoudre.
              Retrouvez notre équipe et vos échanges au même endroit.
            </p>
            <div className="hero-actions">
              <button onClick={() => startConversation()}>
                Nous écrire <ArrowUpRight size={18} />
              </button>
              <button className="secondary" onClick={() => navigate("help")}>
                Explorer le centre d’aide <ArrowRight size={17} />
              </button>
            </div>
            <span className="hero-note">
              <MessageCircle size={14} />
              Votre historique vous suit, à chaque échange.
            </span>
          </div>
          <div className="hero-visual">
            <div className="hero-line" />
            <span className="hero-orbit orbit-one" />
            <span className="hero-orbit orbit-two" />
            <div className="hero-service-card">
              <span className="agent-avatar">
                <Headset size={30} />
              </span>
              <span className="eyebrow">
                L’ÉQUIPE {health.brandName.toUpperCase()}
              </span>
              <h2>On garde le fil.</h2>
              <p>
                De votre première question
                <br />à sa résolution.
              </p>
              <div className="hero-service-stages">
                <span>
                  <Check size={15} />
                  Demande reçue
                </span>
                <span>
                  <MessagesSquare size={15} />
                  Échange en cours
                </span>
                <span>
                  <ShieldCheck size={15} />
                  Suivi conservé
                </span>
              </div>
            </div>
            <div className="hero-small-card">
              <BookOpen size={19} />
              <div>
                <strong>La bonne information</strong>
                <small>Nos réponses, à votre rythme.</small>
              </div>
            </div>
          </div>
        </section>
        <section className="portal-shortcuts">
          {[
            [
              MessageCircle,
              "Une question ?",
              "Échangez avec notre équipe.",
              "support",
            ],
            [
              MessagesSquare,
              "Vos demandes",
              "Retrouvez chaque conversation.",
              "requests",
            ],
            [Package, "Vos commandes", "Consultez votre suivi.", "orders"],
          ].map(([Icon, title, text, target]) => (
            <button
              className="shortcut-card"
              key={target}
              onClick={() => navigate(target)}
            >
              <span className="shortcut-icon">
                <Icon size={24} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </section>
        <div className="portal-section-heading">
          <div>
            <span className="eyebrow">VOTRE PROCHAIN ÉCHANGE</span>
            <h2>Comment pouvons-nous vous aider ?</h2>
          </div>
          <button className="text-button" onClick={() => navigate("help")}>
            Toutes les informations <ArrowRight size={15} />
          </button>
        </div>
        <div className="home-help-grid">
          {articles.length ? (
            articles.slice(0, 3).map((article) => (
              <button
                key={article.id}
                className="home-article panel"
                onClick={() => navigate("help")}
              >
                <BookOpen size={20} />
                <strong>{article.title}</strong>
                <span>{article.content.slice(0, 100)}</span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <div className="home-support-card panel">
              <Headset size={24} />
              <div>
                <h2>Une réponse adaptée à votre situation.</h2>
                <p>
                  Décrivez votre besoin. L’équipe retrouvera le contexte et vous
                  répondra dans votre espace.
                </p>
              </div>
              <button onClick={() => startConversation()}>
                Ouvrir une demande <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </>
    );
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {body}
    </>
  );
}
function Empty({ icon: Icon, title, text, action, onClick }) {
  return (
    <div className="portal-empty panel">
      <Icon size={32} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button onClick={onClick}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
