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
            Gérez les informations consultées par les clients et l’assistant.
          </p>
          <button onClick={() => setProduct({ ...blankProduct })}>
            <Plus size={16} />
            Ajouter un produit
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
                    {row.id} · {money(row.price_cents)} · Stock : {row.stock}
                  </small>
                </span>
                <span className="badge">Modifier</span>
              </button>
            ))}
            {!rows.length && (
              <p className="muted">
                Votre catalogue est vide. Ajoutez un produit pour commencer.
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
                }, "Produit enregistré.");
              }}
            >
              <h2>{product.id ? "Modifier le produit" : "Nouveau produit"}</h2>
              <label>
                Référence
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
                Nom
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
                  Prix (€)
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
                  <option value="">Illustration neutre</option>
                  <option value="/products/headphones.svg">Casque</option>
                  <option value="/products/keyboard.svg">Clavier</option>
                </select>
              </label>
              <button disabled={busy}>
                <Check size={16} />
                Enregistrer
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setProduct(null)}
              >
                Fermer
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
            <Users size={18} /> Clients
          </h2>
          <p className="muted">Les comptes clients et leur activité.</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Email</th>
                  <th>Commandes</th>
                  <th>Demandes</th>
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
            <p className="muted">Aucun compte client pour le moment.</p>
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
          <h2>Assistant IA</h2>
          <p className="muted">
            Fournisseur : Groq · Modèle : {health.aiModel || "Non configuré"}
          </p>
          <p>
            Les réponses utilisent les documents publiés, les connaissances
            validées et les données du client.
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
              }, "Connexion Groq vérifiée.")
            }
          >
            <RefreshCw size={16} />
            Tester la connexion
          </button>
          <p className="muted">
            La clé est configurée sur le serveur dans GROQ_API_KEY. L’offre
            gratuite reste soumise aux quotas de votre compte.
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
              "Seuil enregistré.",
            );
          }}
        >
          <span className="settings-icon">
            <ShieldCheck size={25} />
          </span>
          <h2>Relais humain</h2>
          <p className="muted">
            Sous ce seuil de confiance, une demande est transférée à votre
            équipe.
          </p>
          <label>
            Seuil de confiance
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
            Les actions sensibles et les demandes explicites d’un conseiller
            sont toujours transférées.
          </p>
          <button disabled={busy}>
            <Check size={16} />
            Enregistrer
          </button>
        </form>
      </div>
    </>
  );
}
