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
  ["dashboard", "Overview", LayoutDashboard],
  ["conversations", "Conversations", MessagesSquare],
  ["knowledge", "Knowledge", BookOpen],
  ["documents", "Help centre", FileText],
  ["products", "Catalogue", Package],
  ["customers", "Customers", Users],
  ["settings", "Settings", Settings],
];
const clientNav = [
  ["home", "Home"],
  ["help", "Help centre"],
  ["catalog", "Catalogue"],
  ["requests", "My requests"],
];
function skipToContent(event) {
  event.preventDefault();
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "start", behavior: "auto" });
}

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
          {admin ? "Support operations" : "Here to help"}
        </span>
      </span>
    </a>
  );
  if (loading)
    return (
      <div className="app-unavailable" role="status">
        Opening your workspace…
      </div>
    );
  if (admin)
    return (
      <div className="app-shell admin-app">
        <a className="skip-link" href="#main-content" onClick={skipToContent}>Skip to content</a>
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
              View customer portal <ArrowUpRight size={16} />
            </a>
            <div className="sidebar-profile">
              <span className="avatar">
                {user?.name?.slice(0, 2).toUpperCase() || "SL"}
              </span>
              <div>
                <strong>{user?.name || "Administration"}</strong>
                <small>{user?.email || "Protected access"}</small>
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
                  "Overview"}
              </strong>
            </div>
            {user && (
              <button className="secondary" onClick={logout}>
                <LogOut size={15} />
                Sign out
              </button>
            )}
          </header>
          <main className="page-content" id="main-content" tabIndex={-1}>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {user?.role === "admin" ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">Team workspace</span>
                    <h1>
                      {adminNav.find(([key]) => key === view)?.[1] ||
                        "Overview"}
                    </h1>
                  </div>
                  <span className="date-label">
                    {new Date().toLocaleDateString("en-GB", {
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
                  {health.brandName.toUpperCase()} · Administration
                </span>
                <h1>Your team, in one place.</h1>
                <p>
                  Sign in to manage requests and knowledge.
                </p>
                {user ? (
                  <>
                    <p>This account does not have administrator access.</p>
                    <button onClick={logout}>Switch account</button>
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
      <a className="skip-link" href="#portal-main" onClick={skipToContent}>
        Skip to content
      </a>
      <header className="portal-header">
        {brand}
        <nav aria-label="Customer navigation">
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
                aria-label="Sign out"
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
              My account
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
              <span className="eyebrow">Your personal workspace</span>
              <h1>
                Keep track
                <br />
                of your requests.
              </h1>
              <p>
                An account to talk to our team and follow every answer.
              </p>
              <div className="auth-benefits">
                <span>
                  <MessageCircle size={18} />
                  All your conversations
                </span>
                <span>
                  <Package size={18} />
                  Order tracking
                </span>
                <span>
                  <ShieldCheck size={18} />
                  Your information stays private
                </span>
              </div>
            </div>
            {user?.role === "admin" ? (
              <div className="panel">
                <p>
                  Sign in with a customer account to access this workspace.
                </p>
                <button onClick={logout}>Switch account</button>
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
        <span>{health.brandName} · Here to help.</span>
        <div>
          <a href="/#help">Help centre</a>
          <a href="/#requests">My requests</a>
          <a href="/admin">Team workspace</a>
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
        setError("This account does not have administrator access.");
        return;
      }
      onLogin(user);
    } catch (err) {
      setError(
        err.status === 401 ? "Incorrect email or password." : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="portal-login panel" onSubmit={submit}>
      <span className="eyebrow">
        {admin ? "Team access" : "Customer workspace"}
      </span>
      <h2>{register ? "Create my account" : "Sign in"}</h2>
      <p>
        {register
          ? "Your requests and answers, together."
          : "Good to see you again."}
      </p>
      {register && (
        <label>
          Your name
          <input name="name" autoComplete="name" maxLength={100} required />
        </label>
      )}
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? 12 : 1}
          maxLength={128}
          required
        />
      </label>
      {register && <small>At least 12 characters.</small>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} type="submit">
        {busy
          ? "Signing in…"
          : register
            ? "Create my account"
            : "Sign in"}
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
          {register ? "I already have an account" : "Create an account"}
        </button>
      )}
    </form>
  );
}
