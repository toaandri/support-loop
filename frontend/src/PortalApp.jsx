import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  MessageCircle,
  MessagesSquare,
  Package,
  BookOpen,
  LayoutDashboard,
  LogOut,
  UserRound,
  Users,
  Settings,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api.js";
import SupportWorkspace from "./SupportWorkspace.jsx";
import AdminSettings from "./AdminSettings.jsx";
import CustomerPortal from "./CustomerPortal.jsx";

const adminNav = [
  ["dashboard", "Vue d’ensemble", LayoutDashboard],
  ["conversations", "Conversations", MessagesSquare],
  ["knowledge", "Connaissances", BookOpen],
  ["documents", "Centre d’aide", FileText],
  ["products", "Catalogue", Package],
  ["customers", "Clients", Users],
  ["settings", "Réglages", Settings],
];
const clientNav = [
  ["home", "Accueil"],
  ["help", "Centre d’aide"],
  ["catalog", "Catalogue"],
  ["requests", "Mes demandes"],
];
export default function PortalApp({ health }) {
  const admin = location.pathname.startsWith("/admin");
  const readView = () => {
    const value = location.hash.slice(1);
    const valid = admin ? adminNav.some(([key])=>key===value) : clientNav.some(([key])=>key===value) || ["support","orders","login"].includes(value);
    return valid ? value : admin ? "dashboard" : "home";
  };
  const [view, setView] = useState(readView);
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const navigate = (next) => {
    location.hash = next;
    setView(next);
    setError("");
  };
  useEffect(() => {
    const sync = () => setView(readView());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [admin]);
  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then(({ user: value }) => {
        if (active) setUser(value);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setUser(null);
      navigate(admin ? "dashboard" : "home");
    } catch (err) {
      setError(err.message);
    }
  }
  const onLogin = (value) => {
    setUser(value);
    if (value.role === "admin") {
      location.href = "/admin#dashboard";
      return;
    }
    navigate("home");
  };
  const brand = (
    <a className="brand" href={admin ? "/admin#dashboard" : "/#home"}>
      <span className="brand-mark">
        <Activity size={22} />
      </span>
      <span>
        {health.brandName}
        <span className="brand-caption">
          {admin ? "OPÉRATIONS DE SUPPORT" : "À VOTRE ÉCOUTE"}
        </span>
      </span>
    </a>
  );
  if (loading)
    return (
      <div className="app-unavailable" role="status">
        Ouverture de votre espace…
      </div>
    );
  if (admin)
    return (
      <div className="app-shell admin-app">
        <aside className="sidebar">
          {brand}
          <p className="nav-group">ADMINISTRATION</p>
          <nav className="main-nav" aria-label="Administration">
            {adminNav.map(([key, label, Icon]) => (
              <button
                key={key}
                className={`nav-item ${view === key ? "active" : ""}`}
                aria-current={view === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <a className="nav-item" href="/">
              Voir le portail client <ArrowUpRight size={16} />
            </a>
            <div className="sidebar-profile">
              <span className="avatar">
                {user?.name?.slice(0, 2).toUpperCase() || "SL"}
              </span>
              <div>
                <strong>{user?.name || "Administration"}</strong>
                <small>{user?.email || "Accès protégé"}</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="app-header">
            <div className="breadcrumb">
              Administration <ArrowRight size={13} />
              <strong>
                {adminNav.find(([key]) => key === view)?.[1] ||
                  "Vue d’ensemble"}
              </strong>
            </div>
            {user && (
              <button className="secondary" onClick={logout}>
                <LogOut size={15} />
                Déconnexion
              </button>
            )}
          </header>
          <main className="page-content" id="main-content">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {user?.role === "admin" ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">ESPACE ÉQUIPE</span>
                    <h1>
                      {adminNav.find(([key]) => key === view)?.[1] ||
                        "Vue d’ensemble"}
                    </h1>
                  </div>
                  <span className="date-label">
                    {new Date().toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                {["dashboard", "conversations", "knowledge"].includes(view) ? (
                  <SupportWorkspace
                    sessionUser={user}
                    onUnauthorized={() => setUser(null)}
                    loading={false}
                    tab={view}
                    onTabChange={navigate}
                  />
                ) : (
                  <AdminSettings
                    tab={view}
                    health={health}
                    onUnauthorized={() => setUser(null)}
                  />
                )}
              </>
            ) : (
              <div className="admin-auth">
                <span className="eyebrow">
                  {health.brandName.toUpperCase()} · ADMINISTRATION
                </span>
                <h1>Votre équipe, au même endroit.</h1>
                <p>
                  Connectez-vous pour gérer les demandes et les connaissances.
                </p>
                {user ? (
                  <>
                    <p>Ce compte ne dispose pas d’un accès administrateur.</p>
                    <button onClick={logout}>Changer de compte</button>
                  </>
                ) : (
                  <AuthForm admin onLogin={onLogin} />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    );
  const needsLogin =
    ["support", "requests", "orders"].includes(view) &&
    user?.role !== "customer";
  return (
    <div className="portal">
      <a className="skip-link" href="#portal-main">
        Aller au contenu
      </a>
      <header className="portal-header">
        {brand}
        <nav aria-label="Navigation client">
          {clientNav.map(([key, label]) => (
            <button
              key={key}
              className={`portal-nav ${view === key ? "active" : ""}`}
              onClick={() => navigate(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="portal-account">
          {user ? (
            <>
              <button
                className="secondary"
                onClick={() =>
                  navigate(user.role === "admin" ? "home" : "orders")
                }
              >
                <UserRound size={16} />
                {user.name.split(" ")[0]}
              </button>
              <button
                className="icon-button secondary"
                aria-label="Déconnexion"
                onClick={logout}
              >
                <LogOut size={16} />
              </button>
              {user.role === "admin" && (
                <a href="/admin" className="portal-admin-link">
                  Administration
                </a>
              )}
            </>
          ) : (
            <button className="secondary" onClick={() => navigate("login")}>
              <UserRound size={16} />
              Mon espace
            </button>
          )}
        </div>
      </header>
      <main className="portal-main" id="portal-main" tabIndex={-1}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {needsLogin || view === "login" ? (
          <div className="portal-auth">
            <div>
              <span className="eyebrow">VOTRE ESPACE PERSONNEL</span>
              <h1>
                Retrouvez le fil
                <br />
                de vos demandes.
              </h1>
              <p>
                Un compte pour échanger avec notre équipe et suivre chaque
                réponse.
              </p>
              <div className="auth-benefits">
                <span>
                  <MessageCircle size={18} />
                  Toutes vos conversations
                </span>
                <span>
                  <Package size={18} />
                  Le suivi de vos commandes
                </span>
                <span>
                  <ShieldCheck size={18} />
                  Vos informations restent privées
                </span>
              </div>
            </div>
            {user?.role === "admin" ? (
              <div className="panel">
                <p>
                  Connectez-vous avec un compte client pour accéder à cet
                  espace.
                </p>
                <button onClick={logout}>Changer de compte</button>
              </div>
            ) : (
              <AuthForm onLogin={onLogin} />
            )}
          </div>
        ) : (
          <CustomerPortal
            health={health}
            user={user}
            view={view}
            navigate={navigate}
            onUnauthorized={() => {
              setUser(null);
              navigate("login");
            }}
          />
        )}
      </main>
      <footer className="portal-footer">
        <span>{health.brandName} · À votre écoute.</span>
        <div>
          <a href="/#help">Centre d’aide</a>
          <a href="/#requests">Mes demandes</a>
          <a href="/admin">Espace équipe</a>
        </div>
      </footer>
    </div>
  );
}
function AuthForm({ admin = false, onLogin }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { user } = await api(`/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: Object.fromEntries(form),
      });
      if (admin && user.role !== "admin") {
        setError("Ce compte ne dispose pas d’un accès administrateur.");
        return;
      }
      onLogin(user);
    } catch (err) {
      setError(
        err.status === 401 ? "Email ou mot de passe incorrect." : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="portal-login panel" onSubmit={submit}>
      <span className="eyebrow">
        {admin ? "ACCÈS ÉQUIPE" : "ESPACE CLIENT"}
      </span>
      <h2>{register ? "Créer mon compte" : "Se connecter"}</h2>
      <p>
        {register
          ? "Retrouvez vos demandes et vos réponses, au même endroit."
          : "Heureux de vous retrouver."}
      </p>
      {register && (
        <label>
          Votre nom
          <input name="name" autoComplete="name" maxLength={100} required />
        </label>
      )}
      <label>
        Adresse email
        <input
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
        />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? 12 : 1}
          maxLength={128}
          required
        />
      </label>
      {register && <small>Au moins 12 caractères.</small>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} type="submit">
        {busy
          ? "Connexion en cours…"
          : register
            ? "Créer mon compte"
            : "Se connecter"}
        <ArrowRight size={16} />
      </button>
      {!admin && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "J’ai déjà un compte" : "Créer un compte"}
        </button>
      )}
    </form>
  );
}
