# API REST

Base locale : `http://localhost:3000/api`. En passant par le frontend : `/api`.
Corps et réponses JSON. `/health`, `/products` et `/articles` sont publics en mode
sessions. Les autres routes demandent un cookie de session et le rôle approprié.
Les clés de service restent facultatives pour les intégrations serveur.

## Comptes

| Méthode | Route | Usage / corps |
|---|---|---|
| GET | `/auth/me` | Utilisateur de la session ou null |
| POST | `/auth/register` | `{ name, email, password }`, 12–128 caractères pour le mot de passe ; rôle client imposé |
| POST | `/auth/login` | `{ email, password }` ; cookie HttpOnly / SameSite=Strict |
| POST | `/auth/logout` | Invalidation du jeton et expiration du cookie |

La session dure sept jours. Les routes ne renvoient jamais le hash du mot de passe.
Le premier administrateur est configuré côté serveur ; l’inscription ne donne
aucun droit administrateur.

## Routes client

La session identifie le client et son customerId. Un `customerId` envoyé dans le
corps est ignoré. Pour un adaptateur serveur, `x-customer-key` peut être configuré
explicitement ; il correspond seulement à SUPPORT_CUSTOMER_ID.

| Méthode | Route | Usage |
|---|---|---|
| GET | `/health` | État, mode, version et indicateur démo |
| POST | `/chat` | Message client ; réponse automatique ou transfert |
| GET | `/conversations/:id/messages` | Historique et statut, pour le polling client |
| GET | `/customer` | Identité du client connecté |
| GET | `/conversations` | Résumés privés des 100 dernières demandes |
| GET | `/articles` | Articles publics publiés depuis l’administration |
| GET | `/orders` | Commandes de ce client |
| GET | `/orders/:id` | Une commande appartenant à ce client |
| GET | `/products?q=` | Catalogue et recherche (100 caractères maximum) |
| GET | `/tickets` | Tickets du client |

```json
{
  "conversationId": "web-session-123",
  "message": "Où est ma commande ORD-1001 ?",
  "channel": "web"
}
```

`message` : 1–4000 caractères, `conversationId` : 1–128, `channel` : 1–32.
La réponse contient `conversationId`, `status`, `message`, `history` et
`escalation`. Pendant une prise en charge humaine, `message` vaut `null` et le
message client est ajouté à l’historique sans réponse IA.

## Routes conseiller

Rôle administrateur requis. Le nom affiché et l’identité de prise en charge
viennent de la session. Une clé x-support-key distincte peut être configurée pour
les appels serveur ; son nom de conseiller vient de SUPPORT_AGENT_NAME.

| Méthode | Route | Usage / corps |
|---|---|---|
| GET | `/support/conversations` | File ; 200 dernières en PostgreSQL |
| GET | `/support/conversations/:id` | Historique, commandes, tickets, outils |
| POST | `/support/conversations/:id/claim` | `waiting` → `human` |
| POST | `/support/conversations/:id/reply` | `{ "content": "Réponse" }`, maximum 4000 caractères |
| POST | `/support/conversations/:id/resolve` | Résoudre et proposer une connaissance si réponse humaine |
| POST | `/support/conversations/:id/resume` | Reprendre le support automatique |
| POST | `/support/conversations/:id/learn` | Relancer la collecte d’une résolution, sans duplicata identique |
| GET | `/support/settings` | Seuil et nom de l’agent |
| PATCH | `/support/settings` | `{ "threshold": 0.85 }`, valeur 0–1 |
| GET | `/support/stats` | Indicateurs, activité quotidienne UTC, canaux, motifs |
| GET | `/support/knowledge?status=` | Propositions ; filtre new/review/approved/rejected/active |
| GET | `/support/knowledge/:id` | Détail et provenance |
| POST | `/support/knowledge/:id/review` | Nouvelle proposition → révision |
| PATCH | `/support/knowledge/:id` | Édition avant validation uniquement |
| POST | `/support/knowledge/:id/approve` | Validation et activation ; relance possible si `approved` |
| POST | `/support/knowledge/:id/reject` | Rejet d’une proposition `new` ou `review` |
| POST | `/support/ingest` | Ingestion du répertoire serveur en mode Groq ou RAG |
| GET | `/support/customers` | Clients et compteurs d’activité |
| GET | `/support/products` | Catalogue, maximum 200 entrées |
| POST | `/support/products` | Créer/modifier `{ id, name, description, price_cents, stock, image_url }` |
| GET | `/support/documents` | Documents indexés et contenu |
| POST | `/support/documents` | Publier `{ title, content }`, max 120 / 20000 caractères |
| PUT | `/support/documents/:ref` | Modifier un article manuel ; ref = UUID.md |
| DELETE | `/support/documents/:ref` | Retirer cet article de l’index et du centre d’aide |
| POST | `/support/knowledge/:id/revoke` | Retirer une connaissance active |
| POST | `/support/ai/check` | Vérifier la clé et l’accès au modèle Groq |

Exemple d’édition :

```json
{
  "human_answer": "La garantie atelier dure deux ans.",
  "extracted_rule": {
    "intent": "garantie_atelier",
    "condition": "Demande de garantie atelier",
    "resolution": "Deux ans, sur justificatif d’achat",
    "notes": null
  }
}
```

Une règle peut valoir `null` avant approbation ; le mode Groq exige une règle
générale pour l’activer. Sinon `intent`, `condition`, `resolution` sont des
chaînes non vides (2000 caractères maximum), `notes` est optionnel ou nul, et
aucun champ supplémentaire n’est accepté.

## Indicateurs

`conversations_total`, `conversations_ai`, `conversations_waiting`,
`conversations_human`, `conversations_resolved`, `conversations_today`,
`conversations_escalated`, `ai_responses`, `human_responses`, `average_response_ms`,
`tickets_open`, `tickets_resolved`, `learned_knowledge_total`,
`learned_knowledge_pending_review`, `learned_knowledge_active`, `daily`,
`escalation_reasons`, `channels`.

Le taux de résolution est le nombre de conversations actuellement résolues / total.
Le taux de transfert est le nombre de conversations ayant connu au moins un
transfert / total. Le délai moyen mesure le temps entre un message client et la
réponse assistant/humain immédiatement suivante ; il inclut l’attente humaine.
`daily` couvre sept jours UTC. Aucun indicateur de satisfaction n’est inventé.

## Erreurs et limites

Format : `{ "error": "Description" }`. Codes : `400` données invalides, `401`
session ou clé absente/incorrecte, `403` rôle ou requête refusée, `404` ressource absente ou inaccessible, `409` transition invalide,
`413` corps trop grand, `429` limite de débit, `500` erreur interne masquée, `503` fournisseur indisponible.
Une erreur d’outil ou de modèle pendant le chat provoque normalement un transfert.

Limites par IP/processus : connexion/inscription 10/min, chat 30/min, connaissances 60/min, ingestion 2/min.
`429` inclut `Retry-After`. Ne pas utiliser l’ingestion avec un chemin fourni par
le client : seul `KNOWLEDGE_DIRECTORY` côté serveur détermine les fichiers lus.
