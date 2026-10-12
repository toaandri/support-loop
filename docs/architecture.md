# Architecture

Le navigateur appelle une API de même origine, via Vite en développement et Nginx
en Docker. Les données et permissions sont gérées dans le backend.

| Composant | Responsabilité |
|---|---|
| App / PortalApp | Détection du mode, navigation client et administration |
| CustomerPortal | Centre d’aide, catalogue, demandes, commandes et échanges |
| SupportWorkspace / Dashboard | Travail du conseiller, revue et indicateurs |
| AdminSettings / AdminDocuments | Gestion du catalogue, des articles et des réglages |
| authService / authRoutes | Scrypt, comptes, sessions et cookies |
| supportRoutes | Validation des requêtes, identités et permissions |
| supportService | Conversations, transferts, résolution et apprentissage |
| supportStore | Repositories mémoire de test ou PostgreSQL |
| groqProvider | Génération et extraction JSON strictes, sans embeddings |
| knowledgeStore | Plein texte français ou similarité vectorielle |
| documentIngestion | Markdown/texte, découpage et remplacement transactionnel |

## Authentification et données

`auth-schema.sql` crée les utilisateurs et sessions. Chaque compte client est lié
à un enregistrement `customers`. Le serveur ignore l’identité fournie dans le
corps du chat et utilise le compte de la session. Les routes support vérifient le
rôle administrateur ou une clé de service explicitement configurée.

`support-schema.sql` conserve les produits, commandes, dossiers JSON, tickets,
seuil et propositions apprises. Les actions de conversation utilisent une
transaction et un verrou de ligne. La prise en charge est liée à l’identifiant
de l’administrateur, indépendamment de son nom affiché.

`schema.sql` conserve les documents, leur contenu original et les chunks. Un
remplacement de document est atomique. Les embeddings sont facultatifs : Groq
utilise l’index plein texte ; le fournisseur OpenAI peut utiliser pgvector.

## Réponse et apprentissage

Le backend applique d’abord les règles de relais humain. Sinon, il récupère des
extraits et les données métier autorisées avant l’appel Groq. Les sorties JSON,
la confiance et les citations sont vérifiées. Une panne crée un relais humain.

La résolution du dossier est persistée avant l’extraction de la règle. Une panne
d’extraction garde la correction à réviser. L’approbation Groq exige une règle
générale et indexe uniquement cette règle. Le retrait enlève son document de
l’index. Les opérations sur une même connaissance sont sérialisées localement.

## Modes

| Mode | Fournisseur | Recherche | Usage |
|---|---|---|---|
| groq | Groq, clé personnelle | Plein texte PostgreSQL | Portail et comptes |
| rag | OpenAI, appels payants | Embeddings / pgvector | Variante de recherche sémantique |
| demo / mock | Moteur déterministe | Lexicale locale | Fixtures et régression hors ligne |

Le mode sans configuration reste la démo historique. `.env.example` et Docker
configurent le portail Groq persistant avec sessions. n8n appelle l’API via des
clés de service facultatives, avec une identité client configurée côté serveur.
