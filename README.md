# SupportLoop

SupportLoop est un prototype d’agent de support client. Le V1 valide la boucle de conversation avec une interface React, une API Express, un agent local mock, un historique en mémoire et un workflow n8n importable.

## V1

Le V1 inclut :

- interface de chat React ;
- backend Node.js/Express ;
- réponses mockées par catégorie (commande, politique, produit) ;
- historique de conversation en mémoire ;
- workflow n8n `n8n/workflows/incoming-message.json`.

Il n’inclut pas encore de LLM réel, RAG, PostgreSQL, outils métier, authentification ou handoff humain.

## Développement local

Backend :

```bash
cd backend
npm install
npm run dev
```

Frontend, dans un autre terminal :

```bash
cd frontend
npm install
npm run dev
```

Ouvrir `http://localhost:5173`. L’API est disponible sur `http://localhost:3000`.

Vérifier l’API :

```bash
curl http://localhost:3000/api/health
```

Tester un message :

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"local-demo","message":"Ou est ma commande ?","channel":"web"}'
```

## n8n

Importer `n8n/workflows/incoming-message.json` dans n8n. Le webhook attend un payload de cette forme :

```json
{
  "conversationId": "n8n-demo",
  "message": "Ou est ma commande ?",
  "channel": "n8n"
}
```

Le workflow appelle `POST /api/chat` puis renvoie la réponse du backend.

## Docker Compose

```bash
docker compose up
```

Services : frontend `http://localhost:5173`, backend `http://localhost:3000`, n8n `http://localhost:5678`.

## Vérification

```bash
cd backend && npm test
cd frontend && npm run build
```

La persistance et les répertoires `database/` et `knowledge/` sont réservés aux versions suivantes.
