import React, { useEffect, useState } from "react";
import {
  Plus,
  Check,
  Package,
  FileText,
  Users,
  ShieldCheck,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { api, money } from "./api.js";
import AdminDocuments from "./AdminDocuments.jsx";
const blankProduct = {
  id: "",
  name: "",
  description: "",
  price_cents: 0,
  stock: 0,
  image_url: "",
};
export default function AdminSettings({ tab, health, onUnauthorized }) {
  const [rows, setRows] = useState([]),
    [product, setProduct] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [threshold, setThreshold] = useState(0.85);
  const load = async () => {
    const data = await api(
      `/support/${tab === "settings" ? "settings" : tab}`,
      { support: true },
    );
    if (tab === "settings") setThreshold(data.threshold);
    else setRows(data[tab] || []);
  };
  useEffect(() => {
    setRows([]);
    setProduct(null);
    setError("");
    setNotice("");
    let active = true;
    api(`/support/${tab === "settings" ? "settings" : tab}`, { support: true })
      .then((data) => {
        if (active) {
          if (tab === "settings") setThreshold(data.threshold);
          else setRows(data[tab] || []);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) onUnauthorized?.();
        }
      });
    return () => {
      active = false;
    };
  }, [tab]);
  async function perform(work, message) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const feedback = (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
    </>
  );
  if (tab === "products")
    return (
      <>
        {feedback}
        <div className="section-heading">
          <p className="muted">
            Manage information available to customers and the assistant.
          </p>
          <button onClick={() => setProduct({ ...blankProduct })}>
            <Plus size={16} />
            Add a product
          </button>
        </div>
        <div className="admin-data-grid">
          <div className="panel admin-product-list">
            {rows.map((row) => (
              <button
                className="admin-product-row"
                key={row.id}
                onClick={() => setProduct({ ...row, existing: true })}
              >
                <Package size={22} />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.id} · {money(row.price_cents)} · Stock: {row.stock}
                  </small>
                </span>
                <span className="badge">Edit</span>
              </button>
            ))}
            {!rows.length && (
              <p className="muted">
                Your catalogue is empty. Add a product to get started.
              </p>
            )}
          </div>
          {product && (
            <form
              className="panel admin-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  await api("/support/products", {
                    method: "POST",
                    support: true,
                    body: product,
                  });
                  setProduct(null);
                }, "Product saved.");
              }}
            >
              <h2>{product.id ? "Edit product" : "New product"}</h2>
              <label>
                Reference
                <input
                  required
                  disabled={product.existing}
                  pattern="[A-Za-z0-9_-]+"
                  maxLength={64}
                  value={product.id}
                  onChange={(e) =>
                    setProduct({ ...product, id: e.target.value })
                  }
                />
              </label>
              <label>
                Name
                <input
                  required
                  maxLength={120}
                  value={product.name}
                  onChange={(e) =>
                    setProduct({ ...product, name: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  required
                  maxLength={2000}
                  value={product.description}
                  onChange={(e) =>
                    setProduct({ ...product, description: e.target.value })
                  }
                />
              </label>
              <div className="form-two-columns">
                <label>
                  Price (€)
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={product.price_cents / 100}
                    onChange={(e) =>
                      setProduct({
                        ...product,
                        price_cents: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={product.stock}
                    onChange={(e) =>
                      setProduct({ ...product, stock: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Illustration
                <select
                  value={
                    product.image_url?.startsWith("/products/")
                      ? product.image_url
                      : ""
                  }
                  onChange={(e) =>
                    setProduct({ ...product, image_url: e.target.value })
                  }
                >
                  <option value="">Neutral illustration</option>
                  <option value="/products/headphones.svg">Headphones</option>
                  <option value="/products/keyboard.svg">Keyboard</option>
                </select>
              </label>
              <button disabled={busy}>
                <Check size={16} />
                Save
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setProduct(null)}
              >
                Close
              </button>
            </form>
          )}
        </div>
      </>
    );
  if (tab === "documents")
    return <AdminDocuments onUnauthorized={onUnauthorized} />;
  if (tab === "customers")
    return (
      <>
        {feedback}
        <section className="panel">
          <h2>
            <Users size={18} /> Customers
          </h2>
          <p className="muted">Customer accounts and their activity.</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Orders</th>
                  <th>Requests</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.email}</td>
                    <td>{row.orders_count}</td>
                    <td>{row.requests_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="muted">No customer accounts yet.</p>
          )}
        </section>
      </>
    );
  return (
    <>
      {feedback}
      <div className="settings-grid">
        <section className="panel">
          <span className="settings-icon">
            <Cpu size={25} />
          </span>
          <h2>AI assistant</h2>
          <p className="muted">
            Provider: Groq · Model: {health.aiModel || "Not configured"}
          </p>
          <p>
            Responses use published documents, approved knowledge and customer data.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await api("/support/ai/check", {
                  method: "POST",
                  support: true,
                  body: {},
                });
              }, "Groq connection verified.")
            }
          >
            <RefreshCw size={16} />
            Test connection
          </button>
          <p className="muted">
            Set the key on the server in GROQ_API_KEY. The free plan is subject to your account quotas.
          </p>
        </section>
        <form
          className="panel admin-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              () =>
                api("/support/settings", {
                  method: "PATCH",
                  support: true,
                  body: { threshold: Number(threshold) },
                }),
              "Threshold saved.",
            );
          }}
        >
          <span className="settings-icon">
            <ShieldCheck size={25} />
          </span>
          <h2>Human handoff</h2>
          <p className="muted">
            Requests below this confidence threshold are transferred to your team.
          </p>
          <label>
            Confidence threshold
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              required
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          <p className="muted">
            Sensitive actions and explicit requests for an advisor are always transferred.
          </p>
          <button disabled={busy}>
            <Check size={16} />
            Save
          </button>
        </form>
      </div>
    </>
  );
}
