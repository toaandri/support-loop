# Workflows

Les fichiers importables, leurs entrées, leurs accès et leurs limites sont
documentés dans [n8n/README.md](../n8n/README.md).

Le backend exécute seul les règles métier : recherche, outils, ownership,
transfert, résolution et apprentissage. Le frontend peut l’appeler directement.
n8n est une couche facultative d’orchestration, sans accès direct à PostgreSQL.

L’ingestion passe par `POST /api/support/ingest`. Le répertoire à ingérer est
configuré dans le backend. Aucun workflow n’exécute le script du backend à
l’intérieur du conteneur n8n.
