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
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
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
          "Here to help",
          "Let’s talk about your request.",
          <button className="secondary" onClick={() => startConversation()}>
            <Plus size={16} />
            New request
          </button>,
        )}
        <div className="portal-support-grid">
          <section className="chat-panel">
            <header className="chat-header">
              <span className="agent-avatar">
                <Headset size={21} />
              </span>
              <div>
                <h2>The team {health.brandName}</h2>
                <small>Your request stays with us until it is resolved.</small>
              </div>
              <span className={`badge ${status}`}>{statusLabels[status]}</span>
            </header>
            {["waiting", "human"].includes(status) && (
              <div className="handoff-banner">
                <Headset size={17} />
                {status === "waiting"
                  ? "An advisor will take over. You can add more details."
                  : "An advisor is handling your request."}
              </div>
            )}
            {status === "resolved" && (
              <div className="handoff-banner resolved">
                This request is resolved. You can write to us again.
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
                  "I would like to track an order",
                  "I have a question about a product",
                  "I would like to speak to a human advisor",
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
                Your request is being processed…
              </p>
            )}
            <form className="composer" onSubmit={send}>
              <textarea
                aria-label="Customer message"
                maxLength={4000}
                placeholder="Describe your request…"
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
              <button disabled={sending || !draft.trim()} aria-label="Send">
                <Send size={18} />
                <span>Send</span>
              </button>
            </form>
          </section>
          <aside className="portal-history panel">
            <h2>Your recent conversations</h2>
            <p className="muted">
              Continue a request where you left it.
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
                    {new Date(row.updatedAt).toLocaleDateString("en-GB")}
                  </small>
                </button>
              ))
            ) : (
              <p className="muted">Your first conversation will appear here.</p>
            )}
          </aside>
        </div>
      </>
    );
  else if (view === "requests")
    body = (
      <>
        {heading(
          "Your progress",
          "My requests",
          <button onClick={() => startConversation()}>
            <Plus size={16} />
            Create a request
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
                    Updated on{" "}
                    {new Date(row.updatedAt).toLocaleDateString("en-GB")}
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
              title="It starts with a question."
              text="Create your first request. Our team will help you through it."
              action="Create a request"
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
          "Your workspace",
          "My orders",
          <button className="secondary" onClick={() => navigate("requests")}>
            My requests <ArrowRight size={15} />
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
                  <p className="muted">Tracking: {order.tracking_number}</p>
                )}
                <button
                  className="secondary"
                  onClick={() =>
                    startConversation(
                      `I would like information about order ${order.id}`,
                    )
                  }
                >
                  Contact support <ArrowUpRight size={15} />
                </button>
              </article>
            ))
          ) : (
            <Empty
              icon={Package}
              title="No orders yet."
              text="Orders associated with your account will appear here."
              action="Contact support"
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
          "Information & availability",
          "The catalogue",
          search("Search products", "Rechercher…"),
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
                    {product.stock > 0 ? "Available" : "Unavailable"}
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
                        `I have a question about product ${product.id} : ${product.name}`,
                      )
                    }
                  >
                    Ask a question <ArrowUpRight size={16} />
                  </button>
                </div>
              </article>
            ))}
        </div>
        {!products.length && (
          <Empty
            icon={Package}
            title="The catalogue will be available soon."
            text="Our team can already answer your questions."
            action="Contact support"
            onClick={() => startConversation()}
          />
        )}{" "}
        {!!products.length &&
          !products.some((p) =>
            `${p.name} ${p.description} ${p.id}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) && <p className="muted">No results for this search.</p>}
      </>
    );
  else if (view === "help")
    body = (
      <>
        {heading(
          "Answers within reach",
          "Help centre",
          search("Search articles", "Search for an answer…"),
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
            title="Need a personal answer?"
            text="The team is here to help."
            action="Ask my question"
            onClick={() => startConversation()}
          />
        )}
        <div className="contact-strip">
          <div>
            <h2>Your question deserves an answer.</h2>
            <p>Describe your situation. We will take it from there.</p>
          </div>
          <button onClick={() => startConversation()}>
            Contact support <ArrowRight size={17} />
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
                ? `Welcome, ${user.name.split(" ")[0].toUpperCase()}`
                : "Your support workspace"}
            </span>
            <h1>
              Clear answers.
              <br />
              <span>Support that stays with you.</span>
            </h1>
            <p>
              A question, an order to track, a problem to solve. Find our team and your conversations in one place.
            </p>
            <div className="hero-actions">
              <button onClick={() => startConversation()}>
                Write to us <ArrowUpRight size={18} />
              </button>
              <button className="secondary" onClick={() => navigate("help")}>
                Explore the help centre <ArrowRight size={17} />
              </button>
            </div>
            <span className="hero-note">
              <MessageCircle size={14} />
              Your history stays with you, across every conversation.
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
                The team {health.brandName.toUpperCase()}
              </span>
              <h2>We keep the thread.</h2>
              <p>
                From your first question
                <br />to its resolution.
              </p>
              <div className="hero-service-stages">
                <span>
                  <Check size={15} />
                  Request received
                </span>
                <span>
                  <MessagesSquare size={15} />
                  Conversation in progress
                </span>
                <span>
                  <ShieldCheck size={15} />
                  History preserved
                </span>
              </div>
            </div>
            <div className="hero-small-card">
              <BookOpen size={19} />
              <div>
                <strong>The right information</strong>
                <small>Answers at your own pace.</small>
              </div>
            </div>
          </div>
        </section>
        <section className="portal-shortcuts">
          {[
            [
              MessageCircle,
              "Have a question?",
              "Talk to our team.",
              "support",
            ],
            [
              MessagesSquare,
              "Your requests",
              "Find every conversation.",
              "requests",
            ],
            [Package, "Your orders", "Check your progress.", "orders"],
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
            <span className="eyebrow">Your next conversation</span>
            <h2>How can we help?</h2>
          </div>
          <button className="text-button" onClick={() => navigate("help")}>
            All information <ArrowRight size={15} />
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
                <h2>An answer that fits your situation.</h2>
                <p>
                  Describe what you need. The team will find the context and respond in your workspace.
                </p>
              </div>
              <button onClick={() => startConversation()}>
                Open a request <ArrowRight size={16} />
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
