# Développement et exploitation

## Site local avec comptes

Copier `.env.example` vers `.env`, définir ADMIN_EMAIL, ADMIN_PASSWORD (12–128
caractères) et GROQ_API_KEY. Puis :

```bash
npm run setup
docker compose up -d postgres
npm run dev
```

Vite : FRONTEND_PORT, 5173 par défaut ; API : PORT, 3000 ; PostgreSQL : 55432.
Le frontend utilise `/api` de même origine. `/admin` ouvre l’espace équipe.
Le serveur applique les schémas idempotents au démarrage et crée l’administrateur
initial. Une base neuve reste vide, sans catalogue ni commandes fictives.

Lancer la stack compilée avec `docker compose up -d --build`. Nginx sert React
et relaie `/api`, y compris pour `/admin`. Les volumes conservent les données.
`docker compose stop` arrête les services sans supprimer les volumes.

## Configuration

| Variable | Usage |
|---|---|
| AUTH_MODE=session | Comptes clients et rôle administrateur |
| AGENT_MODE=groq | Génération et extraction par Groq |
| STORAGE_MODE=postgres | Persistance en lancement Node |
| DATABASE_URL | URL PostgreSQL locale ; Compose utilise son URL interne |
| BRAND_NAME | Nom affiché sur le portail |
| ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME | Création du premier compte administrateur |
| GROQ_API_KEY / GROQ_MODEL | Clé privée et modèle compatible JSON strict |
| COOKIE_SECURE | false en HTTP local, true en HTTPS |
| POSTGRES_PASSWORD | Mot de passe du conteneur DB, à adapter avec DATABASE_URL |
| CUSTOMER_API_KEY / SUPPORT_ADMIN_KEY | Accès de service facultatifs pour n8n |
| SUPPORT_CUSTOMER_ID | Identité fixe d’un appel via clé de service client |
| KNOWLEDGE_DIRECTORY | Dossier local Markdown/texte à ingérer |
| DOCKER_KNOWLEDGE_DIRECTORY | Chemin du dossier dans le conteneur ; /knowledge/local par défaut |

Une clé Groq absente n’empêche pas le démarrage. Les demandes passent à un conseiller.
Après ajout de la clé, redémarrer le backend puis cliquer **Réglages → Tester la
connexion**. Ce test vérifie l’accès aux modèles. Envoyer ensuite une vraie question
sur un article publié pour vérifier une génération avec citation. Les quotas et
l’accès au modèle dépendent du compte Groq.

Changer BRAND_NAME ne crée aucune politique ou identité commerciale. Publier vos
articles et renseigner le catalogue dans l’administration. Les commandes se lisent
dans PostgreSQL ; leur alimentation depuis votre source métier reste à connecter.

## Mot de passe administrateur

Les valeurs initiales sont dans `.env`, jamais dans Git ou le build frontend.
Un redémarrage n’écrase pas un administrateur existant. Pour réinitialiser :

1. Modifier ADMIN_PASSWORD dans `.env` en conservant ADMIN_EMAIL.
2. Exécuter `npm run admin:reset --prefix backend`.
3. Se reconnecter. Les anciennes sessions de cet administrateur sont invalidées.

En Docker : `docker compose up -d backend` pour appliquer les variables, puis
`docker compose exec backend node scripts/resetAdmin.js`. Cette procédure ne
transforme pas un compte client en administrateur.

## Documents et migrations

La publication depuis l’interface est immédiatement persistée et indexée, sans
API d’embeddings en mode Groq. Les articles peuvent être édités ou retirés.

Pour importer vos fichiers `.md` / `.txt`, créer `knowledge/local/`, y placer vos
documents, puis `npm run knowledge:ingest --prefix backend`. Ce dossier est privé
et ignoré par Git. Les fichiers importés alimentent l’IA ; seuls les articles
publiés depuis l’interface apparaissent dans le centre d’aide public.

L’ingestion remplace les documents modifiés dans une transaction. Le dossier de
démonstration n’est pas ingéré automatiquement en mode Groq.

`npm run db:init --prefix backend` applique seulement les schémas. Les données
fictives sont optionnelles : ajouter `-- --seed` dans une base de démonstration.
Les schémas sont appliqués aussi au démarrage du serveur.

## Tests et médias

Créer une base de test séparée :

```bash
docker compose exec postgres psql -U supportloop -d supportloop -c "CREATE DATABASE supportloop_test;"
```

PowerShell :

```powershell
$env:TEST_DATABASE_URL='postgresql://supportloop:supportloop@localhost:55432/supportloop_test'
npm run check
npm run evaluate
python -m pip install -r scripts/media-requirements.txt
python -m playwright install chromium
npm run test:portal
npm run test:e2e
npm run docs:media
```

Sur Linux/macOS, exporter TEST_DATABASE_URL avant les mêmes commandes. Pour
Chromium sur Linux, utiliser `python -m playwright install --with-deps chromium`.
Sans TEST_DATABASE_URL, les intégrations backend sont explicitement ignorées.

Le test portail crée ou réutilise une base **jetable** nommée `supportloop_portal_test`
et en nettoie les tables. Il démarre ses serveurs sur 3102/5181 et les arrête après
le test. Ne jamais utiliser cette base pour des données à conserver. Variables
optionnelles : PORTAL_BACKEND_PORT, PORTAL_FRONTEND_PORT. Les logs privés sont dans
`.superpowers/portal-check/`. Aucun appel Groq réel n’est effectué.

La régression historique utilise la mémoire sur 3101/5180. `docs:media:demo`
reproduit ses anciens médias ; `docs:media` produit le portail réel, deux GIFs et
les captures desktop/mobile dans `docs/media/`.

## Sauvegardes

```bash
python scripts/db_backup.py
```

Ce script sauvegarde la base du service Compose `postgres`, dans `backups/`, hors
Git. Le nom de base vient de DATABASE_URL dans l’environnement ou `.env` ; utiliser
`--database supportloop` pour cibler explicitement la base de la stack complète,
et `--project NOM` pour un projet Compose distinct. Une base hébergée ailleurs
nécessite pg_dump avec son URL. Conserver une copie privée indépendante et
vérifier régulièrement une restauration dans une base séparée :

```bash
docker compose cp backups/nom-du-dump.dump postgres:/tmp/supportloop.dump
docker compose exec postgres createdb -U supportloop supportloop_restore_test
docker compose exec postgres pg_restore -U supportloop -d supportloop_restore_test /tmp/supportloop.dump
```

Contrôler les comptes, dossiers, tickets, règles et chunks restaurés. Les credentials
et la clé de chiffrement n8n nécessitent une sauvegarde indépendante.

## Diagnostic

| Symptôme | Vérification |
|---|---|
| Port occupé | Changer PORT / FRONTEND_PORT ; ne pas arrêter un autre projet |
| Accès admin refusé | Vérifier ADMIN_EMAIL ; utiliser la procédure de réinitialisation |
| Modèle indisponible | Réglages → Tester la connexion, clé, modèle, quotas Groq |
| Toute demande est transférée | Vérifier la clé et publier des sources correspondant aux questions |
| Résolution sans règle | La correction est conservée ; rédiger la règle ou relancer /learn |
| Connaissance sans activation | Vérifier PostgreSQL puis relancer l’indexation |
| Articles absents du centre d’aide | Publier via l’interface ; les fichiers importés restent des sources IA |
| Webhook n8n refusé | Credentials webhook et clés de service explicitement configurés |

Le healthcheck confirme le service HTTP, pas la disponibilité de Groq. Les logs
JSON ne contiennent pas les secrets ou corps des messages. Ajouter une supervision
et une politique de conservation adaptées avant une exposition publique.
