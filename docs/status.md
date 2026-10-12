# État du projet

Version vérifiée le 12 octobre 2026.

| Périmètre | État |
|---|---|
| Portail public | Accueil, recherche d’articles et catalogue configurables |
| Comptes clients | Inscription, connexion, sessions persistantes, déconnexion |
| Espace personnel | Demandes, historique, réponses et commandes propres au compte |
| Administration | Rôle protégé, vue d’ensemble, file, clients et réglages |
| Contenu | Création, modification et retrait des articles ; catalogue modifiable |
| IA Groq | Appels structurés, faits vérifiés, gestion des erreurs et quotas |
| Relais humain | Ticket, prise en charge, réponse, résolution et reprise IA |
| Apprentissage | Extraction proposée, revue, édition, validation, recherche et retrait |
| Persistance | PostgreSQL : comptes, sessions, dossiers, tickets et connaissances |
| Exploitation | Docker, Nginx, sauvegarde, CI et médias reproductibles |

## Vérifications

66 tests backend réussis, dont les intégrations PostgreSQL, comptes et apprentissage
Groq. Build React réussi. Le navigateur vérifie l’inscription, la persistance des
sessions, les droits, les articles publiés et modifiés, le catalogue, les commandes,
les échanges humains, la publication des connaissances et les pages à 390/1440 px.
La démo historique conserve ses tests de régression et son évaluation déterministe.
La stack Docker compilée, le proxy Nginx, la persistance après redémarrage et la
réinitialisation du mot de passe administrateur ont aussi été vérifiés.

Les nouvelles captures et GIFs sont produits avec des données de test isolées.
Aucune fausse génération IA n’est affichée dans le portail Groq. L’inférence externe
est simulée dans les tests automatisés ; la validation sur le vrai compte Groq
reste à effectuer après ajout de la clé personnelle.

## Périmètre des intégrations

Les informations commerciales et commandes viennent de PostgreSQL. Le catalogue
et les articles se gèrent dans l’administration ; l’import de commandes depuis
un ERP ou une plateforme marchande nécessite son adaptateur et ses credentials.
Les canaux email/WhatsApp, les paiements et les remboursements ne sont pas connectés.
Les workflows n8n sont des adaptateurs facultatifs, avec des destinations à configurer.

## Limites

L’apprentissage enrichit l’index et ne réentraîne pas le modèle. La recherche par
plein texte vise principalement le français. Une réponse sans preuve est transférée ;
la pertinence d’une source et la confiance du modèle restent à évaluer sur vos cas réels.

Le serveur fourni utilise une instance backend. Les limites de débit et les verrous
d’actions sur les connaissances sont locaux au processus. La file montre les 200
derniers dossiers, l’historique client les 100 derniers et le catalogue 200 entrées.
Ajouter une pagination et des agrégats SQL pour un volume supérieur.

Avant une exposition publique, configurer HTTPS, COOKIE_SECURE, les sauvegardes,
la conservation des données et la supervision. L’inscription ne vérifie pas l’adresse
email et il n’y a pas de SSO, de MFA ni de récupération du mot de passe par email.
L’administrateur dispose d’une procédure locale de réinitialisation documentée.
