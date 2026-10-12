# Orchestration n8n

n8n complète le backend avec des webhooks et des schedules. Le chat web et la
boucle d’apprentissage fonctionnent aussi sans n8n.

## Compatibilité avec le portail

Le site utilise des sessions par utilisateur. Ces workflows serveur utilisent
des clés de service facultatives : configurer CUSTOMER_API_KEY et SUPPORT_ADMIN_KEY
avec deux valeurs privées distinctes. Définir SUPPORT_CUSTOMER_ID sur un client
existant pour les workflows entrants. Sans cette configuration, leurs appels sont
refusés. Ils représentent une identité fixe ; un canal multi-client nécessite
un adaptateur qui vérifie son identité avant de choisir son client. Les appels
n8n ne remplacent pas les sessions du navigateur.

## Démarrer

```bash
docker compose --profile automation up -d
```

Ouvrir `http://localhost:5678`. La configuration n8n persiste dans `n8n_data`.
Importer les fichiers de `workflows/` avec **Import from file**.

## Configuration obligatoire des webhooks

Chaque webhook utilise **Header Auth**. Créer un credential avec, par exemple,
le nom d’en-tête `x-webhook-key` et une valeur aléatoire. Associer ce credential
à chaque nœud Webhook puis publier/activer le workflow. Les credentials ne sont
jamais inclus dans les fichiers JSON du dépôt.

L’appelant doit transmettre cette clé. La clé webhook est distincte des clés
backend client/conseiller ; elle empêche un appelant externe de bénéficier des
permissions du workflow sans authentification. Restreindre les webhooks admin
à l’équipe ou au réseau interne.

## Variables côté n8n

| Variable | Usage |
|---|---|
| `SUPPORT_LOOP_BACKEND_URL` | `http://backend:3000` dans Compose |
| `CUSTOMER_API_KEY` | Routes client : `x-customer-key` |
| `SUPPORT_ADMIN_KEY` | Routes conseiller : `x-support-key` |
| `GENERIC_TIMEZONE` | Fuseau des schedules, Europe/Paris par défaut |

Compose transmet les deux clés. Les workflows fournis lisent les variables
d’environnement ; cette instance locale autorise cette lecture avec
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Sur une instance partagée, utiliser des
credentials HTTP dédiés pour remplacer ces expressions et conserver l’accès aux
variables bloqué. Le HTTP local explique `N8N_SECURE_COOKIE=false` ; activer les
cookies sécurisés si l’instance est exposée en HTTPS.

## Workflows disponibles

| Fichier | Déclencheur | Comportement |
|---|---|---|
| `incoming-message.json` | POST `support-loop/incoming-message` | Corps `{ conversationId, message, channel }` → `/api/chat` → réponse |
| `agent-router.json` | POST `support-loop/route` | Classification locale de l’intention puis appel chat |
| `knowledge-search.json` | POST `support-loop/knowledge-search` | `{ query }` → agent → réponse et sources ; crée une conversation |
| `customer-data-enrichment.json` | POST `support-loop/enrich` | Profil et commandes du client configuré |
| `confidence-check.json` | POST `support-loop/confidence` | `{ confidence, needsHuman }` → comparaison au seuil, sans modifier une conversation |
| `human-escalation.json` | POST `support-loop/escalation` | `{ conversationId }` → contexte de transfert à intégrer à une notification |
| `human-learning.json` | POST `support-loop/human-learning` | `{ action: "resolve" }` → liste des connaissances récentes ; pas de résolution automatique |
| `knowledge-review-reminder.json` | Schedule quotidien | Résumé des nouvelles propositions à relier à votre canal |
| `knowledge-ingestion.json` | POST `support-loop/ingest` | `/api/support/ingest` avec clé admin ; exige Groq ou RAG |
| `notifications.json` | POST `support-loop/notify` | Prépare les événements, adaptateurs sortants à configurer |
| `analytics.json` | Schedule quotidien | Snapshot de statistiques à stocker/envoyer selon vos besoins |
| `error-handling.json` | Error Trigger | Contexte d’erreur à relier au canal de supervision |

En production n8n, les chemins sont préfixés par `/webhook/`. Les URL de test
utilisent `/webhook-test/` pendant l’écoute manuelle.

Exemple d’appel après activation :

```bash
curl -X POST http://localhost:5678/webhook/support-loop/incoming-message \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-key: YOUR_WEBHOOK_KEY' \
  -d '{"conversationId":"n8n-example","message":"Stock PRD-001 ?","channel":"n8n"}'
```

## Périmètre réel

Les résolutions dans l’interface déclenchent directement la collecte dans le
backend ; elles n’appellent pas automatiquement le workflow `human-learning`.
Le backend n’envoie actuellement aucune notification externe de sa propre initiative.
Les nœuds de notification indiquent `sent: false` tant qu’un adaptateur réel n’a
pas été configuré. Les fichiers ne comprennent aucun compte SMTP, WhatsApp,
Slack ou PagerDuty et aucune livraison de message n’est prétendue.

Les workflows sont importables séparément ; choisir uniquement ceux utiles.
Dans les paramètres d’un workflow, sélectionner `error-handling` comme Error
Workflow si souhaité. Les tests du dépôt vérifient les graphes et les expressions
critiques ; l’envoi vers un fournisseur externe doit être testé après configuration.

La version actuelle représente un seul client configuré côté backend. Ne pas
connecter plusieurs clients à la même clé en supposant que leur identité sera
inférée depuis les messages. Ajouter une authentification liée au client pour
un réel service multicanal/multi-utilisateur.
