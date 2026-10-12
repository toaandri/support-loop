# Sécurité

## Comptes et sessions

Le portail utilise des mots de passe scrypt avec sel aléatoire et comparaison à
temps constant. Les sessions ont un jeton aléatoire de 32 octets ; seul son SHA-256
est enregistré. Le cookie est HttpOnly, SameSite=Strict et expire après sept jours.
`COOKIE_SECURE=true` doit être activé derrière HTTPS. La déconnexion invalide le
jeton en base ; une connexion réussie remplace la session précédente du navigateur.

Les mutations signalées cross-site par le navigateur sont refusées. Les requêtes
attendent du JSON, le frontend passe par un proxy de même origine. Les comptes
créés par inscription ont toujours le rôle client, indépendamment du corps envoyé.
Les routes d’administration vérifient le rôle et les ressources clientes leur propriétaire.

Le premier administrateur vient des variables privées de configuration. Le redémarrage
ne modifie pas un compte existant. La réinitialisation locale invalide ses sessions.
Les emails ne sont pas vérifiés par un canal externe ; il n’y a pas de SSO ou MFA.

## Intégrations de service

`CUSTOMER_API_KEY` et `SUPPORT_ADMIN_KEY` sont des accès facultatifs pour des appels
serveur comme n8n. Ils doivent être distincts, rester privés et sont comparés à
temps constant. La clé client correspond uniquement à `SUPPORT_CUSTOMER_ID`, jamais
à un ID envoyé par l’appelant. Laisser ces clés vides si elles ne sont pas utilisées.

## IA et apprentissage

Le serveur contrôle les six outils autorisés, leurs arguments et les commandes
accessibles. Les actions sensibles restent humaines. Aucun outil ne permet d’envoyer
un email, de débiter un paiement ou de rembourser une commande.

L’historique, les faits récupérés et le texte client sont traités comme des données,
avec une instruction contre l’injection de prompt. La sortie structurée ne garantit
pas l’exactitude des faits : preuves, citations et seuil complètent le contrôle,
avec transfert en cas d’erreur. Le score reste une estimation.

Groq reçoit la question, jusqu’à six messages de contexte, les extraits nécessaires
et les données métier récupérées pour ce compte. Ses identifiants de session,
mots de passe et les dossiers d’autres clients ne sont pas transmis. Les politiques
de conservation et les données envoyées au fournisseur doivent être adaptées à
votre activité. Les secrets Groq/OpenAI restent sur le serveur.

La révision doit retirer les éléments propres à un dossier. En mode Groq, seuls
le sujet, la condition, la réponse générale et les précisions validées sont indexés ;
la question privée et la correction brute restent dans l’espace équipe. Une règle
active est immuable mais peut être retirée. Les articles du centre d’aide sont publics.

## Exploitation

Les logs JSON excluent les corps des messages, cookies et clés. Les erreurs internes
sont masquées. Les appels Groq ont un timeout de 30 secondes par tentative et deux
retries maximum sur 429/5xx. Une panne du chat déclenche un relais humain.

Limites locales par IP : connexion/inscription 10/min, chat 30/min, connaissances
60/min, ingestion 2/min. Derrière Nginx, les clients partagent son IP ; une montée
en charge nécessite une politique trust proxy restrictive et un store partagé.

Les ports Docker restent sur localhost. Avant une exposition publique : terminer
la configuration HTTPS, cookies sécurisés, sauvegardes, conservation et supervision.
Le déploiement fourni exécute une instance backend ; les verrous de connaissances
et limites de débit ne sont pas distribués. `.env` et sauvegardes sont exclus de Git.
