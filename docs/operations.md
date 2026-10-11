# Développement et exploitation

## Démarrage local

Node.js 22.16+ et npm. Depuis la racine :

```bash
npm run setup
npm run dev
```

Le lanceur démarre Express (PORT, 3000 par défaut) et Vite (FRONTEND_PORT, 5173).
Le frontend et le backend lisent
le `.env` racine s’il existe. Sans configuration, la démo utilise la mémoire et
ne contacte pas OpenAI. Les données disparaissent au redémarrage du backend.

Dans un second terminal, `npm run demo:seed` crée huit scénarios de démonstration
par l’API. La commande conserve les conversations portant déjà les mêmes IDs
et refuse de fonctionner hors démo. Les indicateurs sont calculés à partir de
ces événements réels, sans inventer d’historique sur les jours précédents.

## Docker

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend
```

Frontend Nginx : 5173 ; API : 3000 ; PostgreSQL : 55432. Les ports sont liés à
localhost. Le stockage Compose est toujours PostgreSQL ; `STORAGE_MODE` concerne
le lancement Node local. Images construites avec `npm ci`, frontend compilé,
backend exécuté sans dépendances de développement et sous l’utilisateur `node`.
Des healthchecks vérifient les trois services.

Les scripts SQL s’exécutent à la création du volume. Pour une base existante :

```bash
docker compose exec backend node scripts/initDatabase.js
```

Les schémas sont idempotents, les données de démonstration ne sont pas écrasées.
`docker compose stop` arrête les services en conservant les données. Les volumes
contiennent les conversations et l’espace n8n ; les conserver lors des mises à jour.

## RAG

Copier `.env.example` vers `.env`, puis définir `AGENT_MODE=rag`,
`STORAGE_MODE=postgres`, `DATABASE_URL` et `OPENAI_API_KEY`.

```bash
docker compose up -d postgres
npm run db:init --prefix backend
npm run knowledge:ingest --prefix backend
npm run dev
```

Avec la stack complète :

```bash
docker compose up -d --build
docker compose exec backend node scripts/ingestKnowledge.js /knowledge/demo
```

Le `.env` local utilise `localhost:55432` ; Compose configure l’URL interne.
`KNOWLEDGE_DIRECTORY` personnalise le répertoire local utilisé par l’API
d’ingestion ; Compose monte `./knowledge` dans `/knowledge`.
Les embeddings et les réponses RAG effectuent des appels payants.

## Tests PostgreSQL

Créer une base dédiée, jamais une base avec des données réelles :

```bash
docker compose up -d postgres
docker compose exec postgres psql -U supportloop -d supportloop -c "CREATE DATABASE supportloop_test;"
```

PowerShell :

```powershell
$env:TEST_DATABASE_URL='postgresql://supportloop:supportloop@localhost:55432/supportloop_test'
npm test
```

Linux/macOS :

```bash
TEST_DATABASE_URL=postgresql://supportloop:supportloop@localhost:55432/supportloop_test npm test
```

Les tests appliquent leurs schémas et nettoient leurs ressources. Sans cette
variable, les tests d’intégration sont explicitement ignorés. Les tests OpenAI
utilisent des doublures, jamais une vraie clé.

## Tests navigateur et médias

Python 3.10+, Playwright, Pillow :

```bash
python -m pip install -r scripts/media-requirements.txt
python -m playwright install chromium
npm run test:e2e
npm run docs:media
```

Sous Linux, utiliser `python -m playwright install --with-deps chromium` si les
dépendances système manquent. Le script démarre des serveurs isolés sur 3101 et
5180, en mémoire, puis les arrête. Il vérifie le parcours humain/apprentissage,
le catalogue et les layouts à 390, 768 et 1440 px. Les captures et GIFs se trouvent
dans `docs/media/`. Aucun service externe n’est contacté par la démonstration.
Variables optionnelles : `CAPTURE_BACKEND_PORT` et `CAPTURE_FRONTEND_PORT`.
Les logs de test sont dans `.superpowers/browser-check/`, hors Git.

## Sauvegardes

```bash
python scripts/db_backup.py
```

Le dump PostgreSQL binaire est enregistré dans `backups/`, hors Git. La commande
évite la redirection binaire incorrecte de PowerShell 5. Planifier cette commande
avec le Planificateur Windows ou cron, puis copier les dumps vers un stockage
privé indépendant. Tester régulièrement une restauration dans une base dédiée :

```bash
docker compose cp backups/nom-du-dump.dump postgres:/tmp/supportloop.dump
docker compose exec postgres createdb -U supportloop supportloop_restore_test
docker compose exec postgres pg_restore -U supportloop -d supportloop_restore_test /tmp/supportloop.dump
```

Vérifier les commandes, conversations, tickets, règles et chunks dans cette base.
Cette procédure n’écrase pas la base en service. La configuration n8n est dans un
volume séparé ; exporter ses workflows et sauvegarder sa clé de chiffrement et ses
credentials indépendamment, selon la procédure de votre instance.

## Accès protégés

Définir `DEMO_MODE=false` et deux clés différentes. Les clés sont entrées dans
l’interface, restent en mémoire et ne sont pas incluses dans le build. Ajouter
HTTPS et une authentification par utilisateur avant une exposition à des clients
réels. La version fournie ne représente qu’un client et un conseiller configurés.
Pour déployer sur Internet, définir volontairement les interfaces/ports exposés.

## Diagnostic

| Symptôme | Vérification |
|---|---|
| Port occupé | Arrêter le processus concerné ou changer PORT/FRONTEND_PORT ; Vite ne choisit pas silencieusement un autre port |
| Serveur hors ligne | Consulter le terminal backend ou `docker compose logs backend` |
| Clé incorrecte | Vérifier le rôle, les en-têtes et les deux clés distinctes |
| Tables absentes | Exécuter `db:init` avant un backend PostgreSQL |
| Aucune source RAG | Ingérer les documents et vérifier le modèle / seuil |
| Connaissance `approved` | Réessayer l’indexation après correction de la connexion OpenAI/DB |
| Résolution sans proposition | Une réponse humaine est nécessaire ; utiliser `/learn` pour relancer |
| Webhook n8n refusé | Configurer le credential Header Auth et les variables côté n8n |

Les logs HTTP sont des lignes JSON ; ils n’incluent pas les clés ni le corps des
messages. Le healthcheck vérifie le service HTTP ; la supervision de la disponibilité
des fournisseurs et la collecte centrale des métriques restent à configurer.
