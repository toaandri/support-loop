# État du projet

État vérifié le 12 octobre 2026. Le fichier personnel `choses a faire.txt` est
historique ; ce document décrit la version du dépôt.

| Périmètre | État |
|---|---|
| V1 — Chat et API | Fonctionnel, démo sans clé et agent OpenAI |
| V2 — RAG | Ingestion `.md` / `.txt`, chunking, pgvector, sources citées |
| V3 — Données métier | Clients, catalogue, commandes, tickets, historique |
| V4 — Outils | Six outils autorisés, contrôle des arguments et des commandes |
| V5 — Transfert humain | File, contexte, prise en charge, réponse, résolution, reprise IA |
| V6 — Learning loop | Proposition, révision, édition, approbation, rejet, réutilisation |
| V7 — Tableau de bord | Indicateurs réels, activité quotidienne, motifs de transfert |
| V8 — Exploitation | Images Docker, proxy Nginx, limites, logs, tests, CI, sauvegarde |
| V9 — Multicanal (extension) | Webhooks n8n disponibles ; comptes email/WhatsApp non connectés |
| V10 — Évaluation (extension) | 15 cas déterministes et démonstration avant/après apprentissage |

## Ce qui a été terminé

L’interface a été refondue et vérifiée sur desktop, tablette et mobile. Le mode
démo conserve maintenant les réponses humaines, permet leur validation et les
retrouve lexicalement. Le RAG utilise l’index vectoriel et reste un mode distinct.
Une indexation en échec reste `approved` et peut être relancée. Les réponses
validées ne peuvent pas être modifiées silencieusement. Les transferts historiques
restent comptés après résolution. L’extraction se fait après la sauvegarde de la
résolution, avec conservation de la réponse même si le fournisseur est indisponible.

## Vérifications effectuées

- 56 tests backend réussis, dont les intégrations PostgreSQL/pgvector.
- Build React de production réussi et audits npm sans vulnérabilité signalée.
- 15 scénarios déterministes et parcours avant/après validation réussis.
- Parcours Chromium : chat, transfert, réponse, résolution, reprise IA, révision,
  édition, activation, réutilisation, sources, catalogue et accès protégés.
- Interface vérifiée à 390, 768 et 1440 px ; deux GIFs générés depuis ces parcours.
- Images Docker construites, trois services sains, proxy Nginx et chat compilé
  vérifiés ; conversations et connaissances conservées après redémarrage.
- Sauvegarde PostgreSQL restaurée et contrôlée dans une base distincte.

Le volume PostgreSQL local existant a reçu les schémas idempotents via `db:init`.
Les workflows n8n ont été contrôlés par des tests de graphe et d’expressions ;
les credentials et les destinations externes restent à configurer dans n8n.

## Limites assumées

L’application cible un projet d’étude et un support pour un client configuré côté
serveur. Elle n’implémente pas d’identité multi-utilisateur, d’authentification SSO,
de paiement, de remboursement automatique, ni de canal externe sans configuration.
Le rate limiting et le verrou des actions de connaissance sont locaux au processus :
la configuration fournie exécute une instance backend. Les agrégats du dashboard
relisent les états et devront être remplacés par des agrégations SQL dédiées pour
un historique très volumineux. La file PostgreSQL affiche les 200 dernières conversations.

Le score de confiance est une estimation, pas une probabilité calibrée. Le
benchmark démo valide les règles et le parcours ; il ne mesure pas la qualité
d’un modèle OpenAI réel. Aucun appel OpenAI payant n’est nécessaire aux tests.
