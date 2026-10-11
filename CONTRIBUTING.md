# Contribuer à SupportLoop

## Développement

Node.js 22.16+ ; Python et Docker sont facultatifs pour l’application de démo.

```bash
npm run setup
npm run dev
```

Le frontend utilise le proxy `/api` de Vite. La logique métier reste dans
`backend/src/services/` ; n8n appelle l’API et ne remplace pas les contrôles du backend.

## Avant une contribution

```bash
npm run check
npm run evaluate
```

Pour modifier le stockage, exécuter les tests PostgreSQL sur une base dédiée
([instructions](docs/operations.md#tests-postgresql)). Pour une modification de
parcours utilisateur, exécuter `npm run test:e2e` après installation des
[dépendances navigateur](docs/operations.md#tests-navigateur-et-médias).

Ajouter un test de comportement pour une nouvelle règle métier. Une nouvelle
politique commerciale doit provenir d’un document ou d’une réponse humaine validée.
Les tests ne doivent appeler ni OpenAI ni un service de messagerie réel.

## Pull requests

Décrire le problème, le comportement obtenu et la validation effectuée. Conserver
les lockfiles. Documenter toute nouvelle variable dans `.env.example` et toute
nouvelle route dans [l’API](docs/api.md). Ne jamais ajouter de secrets, de données
personnelles réelles ou de captures contenant des clés.
