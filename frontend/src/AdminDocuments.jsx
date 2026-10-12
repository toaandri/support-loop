import React, { useEffect, useState } from "react";
import { Check, FileText, Plus, Pencil, X } from "lucide-react";
import { api } from "./api.js";

const empty = { title: "", content: "", source: "" };
export default function AdminDocuments({ onUnauthorized }) {
  const [rows, setRows] = useState([]),
    [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState("");
  async function load() {
    setRows((await api("/support/documents")).documents);
  }
  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      if (err.status === 401) onUnauthorized?.();
    });
  }, []);
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
      if (err.status === 401) onUnauthorized?.();
    } finally {
      setBusy(false);
    }
  }
  return (
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
      <div className="admin-data-grid">
        <div className="panel">
          <h2>Published information</h2>
          <p className="muted">
            Your articles appear in the help centre and inform assistant responses.
          </p>
          {rows.map((row) => (
            <details className="admin-document" key={row.id}>
              <summary>
                <FileText size={17} />
                {row.content.split("\n")[0].replace(/^#\s*/, "")}
                <span className="badge">Published</span>
              </summary>
              <p>{row.content}</p>
              {row.source.startsWith("manual/") && (
                <div className="document-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setDraft({
                        source: row.source,
                        title: row.content.split("\n")[0].replace(/^#\s*/, ""),
                        content: row.content
                          .split("\n")
                          .slice(1)
                          .join("\n")
                          .trim(),
                      });
                      setRemoving("");
                    }}
                  >
                    <Pencil size={15} />
                    Edit
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRemoving(row.source)}
                  >
                    <X size={15} />
                    Withdraw
                  </button>
                  {removing === row.source && (
                    <div className="document-removal">
                      <p>
                        Remove this article from the help centre and assistant responses?
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            await api(
                              `/support/documents/${row.source.slice(7)}`,
                              { method: "DELETE" },
                            );
                            setRemoving("");
                            if (draft.source === row.source) setDraft(empty);
                          }, "Article removed.")
                        }
                      >
                        Confirm removal
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setRemoving("")}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </details>
          ))}
          {!rows.length && (
            <p className="muted">
              No published articles. Start with the information your customers need most.
            </p>
          )}
        </div>
        <form
          className="panel admin-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            perform(
              async () => {
                await api(
                  draft.source
                    ? `/support/documents/${draft.source.slice(7)}`
                    : "/support/documents",
                  {
                    method: draft.source ? "PUT" : "POST",
                    body: { title: draft.title, content: draft.content },
                  },
                );
                setDraft(empty);
              },
              draft.source
                ? "Article updated."
                : "Article published in the help centre.",
            );
          }}
        >
          <h2>{draft.source ? "Edit article" : "Publish an article"}</h2>
          <label>
            Title
            <input
              required
              maxLength={120}
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
              placeholder="Useful information for your customers"
            />
          </label>
          <label>
            Content
            <textarea
              aria-label="Content"
              required
              rows={10}
              maxLength={20000}
              value={draft.content}
              onChange={(event) =>
                setDraft({ ...draft, content: event.target.value })
              }
              placeholder="Write a clear answer relevant to your business."
            />
          </label>
          <p className="muted">
            Publish general information. Details about a customer case belong in its conversation.
          </p>
          <button disabled={busy}>
            <Check size={16} />
            {draft.source ? "Save" : "Publish"}
          </button>
          {draft.source && (
            <button
              className="secondary"
              type="button"
              onClick={() => setDraft(empty)}
            >
              <Plus size={15} />
              New article
            </button>
          )}
        </form>
      </div>
    </>
  );
}
