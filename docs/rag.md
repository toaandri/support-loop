# IA et recherche documentaire

## Groq, mode du portail

Configuration : AGENT_MODE=groq, STORAGE_MODE=postgres, AUTH_MODE=session et
GROQ_API_KEY. Le modèle par défaut est `openai/gpt-oss-20b`.

Le backend recherche jusqu’à quatre extraits dans l’index plein texte français
PostgreSQL. Il essaie les mots de la question, puis les termes significatifs en
cas d’absence de résultat. Le catalogue et les commandes sont récupérés par les
outils autorisés, dans le contexte du client authentifié.

Ces faits sont fournis à un appel `chat/completions` Groq, avec un schéma JSON
strict pour content, confidence, needsHuman et reason. Le serveur valide la sortie
et les numéros de citation. Aucun tool calling Groq ou streaming n’est combiné
avec le JSON strict : les outils sont exécutés par le serveur avant la génération.
Voir les [sorties structurées Groq](https://console.groq.com/docs/structured-outputs).

Les clés restent dans le backend. Sans clé, quota disponible, preuves suffisantes
ou réponse valide, la demande est transférée à l’équipe. Les quotas gratuits sont
ceux du [compte Groq](https://console.groq.com/docs/rate-limits), sans promesse d’usage illimité.

## Publication et ingestion

Les articles publiés dans l’administration alimentent immédiatement l’index et
le centre d’aide. Leur texte original est conservé ; les chunks de recherche
utilisent environ 1200 caractères avec un recouvrement de 200 caractères.

Les fichiers Markdown/texte peuvent être ingérés depuis KNOWLEDGE_DIRECTORY ou
`knowledge/local/`. Maximum un MiB par fichier. Le hash et le modèle d’index
permettent de sauter les fichiers inchangés. Le remplacement est transactionnel.
L’ingestion Groq utilise des embeddings nuls et ne contacte aucune API de vecteurs.

Les règles validées sont indexées sous `learned/<uuid>.md`. En mode Groq, elles
contiennent uniquement la règle générale revue par l’équipe. Les détails bruts
client ne sont pas recopiés dans l’index partagé. Une règle retirée disparaît de
la recherche. Les documents importés et les règles apprises ne sont pas publiés
automatiquement dans le centre d’aide.

## OpenAI et pgvector, variante facultative

AGENT_MODE=rag utilise OPENAI_API_KEY, OPENAI_CHAT_MODEL et
OPENAI_EMBEDDING_MODEL. Les appels de génération et d’embeddings sont payants.
La configuration par défaut utilise text-embedding-3-small et 1536 dimensions.
La recherche filtre par modèle et similarité cosine (RAG_MIN_SIMILARITY).

L’intégration OpenAI conserve sa boucle de tools contrôlés : huit outils maximum
par message et cinq tours de génération. Les extraits, règles et données métier
restent des données de contexte, sans pouvoir autoriser une action sensible.
Ne pas mélanger les index text:v1 et vectoriels en changeant de fournisseur sans
réingérer les documents pour le modèle choisi.

## Ce que les tests prouvent

Les tests vérifient les requêtes structurées Groq, les erreurs, la recherche
PostgreSQL, la confidentialité de la règle indexée, l’absence de réutilisation
avant validation et le retrait. La génération externe est une doublure contrôlée
dans les tests. Une clé réelle est nécessaire pour évaluer la pertinence des
réponses sur vos documents et vos cas métier. La recherche plein texte n’est pas
une recherche sémantique multilingue ; elle cible principalement le français.
