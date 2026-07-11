# AUDIT COMPLET — Phases 3B / 5 / 6 / complémentaires (constat)

> Audit page-par-page + perf + devops + RGPD/résilience + abus/observabilité (2026-07-11).
> Constat par lecture de code (fichier:ligne). Total : 22 P1 · 37 P2 · 19 P3 · 6 info.
> Les P0 de sécurité/argent ont été traités séparément (voir FINDINGS.md).


## PHASE 3B — Audit page par page (lot 1 : pages PUBLIQUES + AUTH)

_Audit d'un échantillon représentatif des pages publiques et auth de la marketplace (routing par hash dans src/App.tsx). Bonne nouvelle globale : le socle de données est RÉEL Supabase et généralement HONNÊTE — accueil (KPIs annonces/secteurs via useCategoryCounts + usePublicMachineCount = vrais COUNT Supabase), catalogue Machines (fetch réel + fallback + état vide honnête), FeaturedMachines (scoring sur vraies annonces), MachineDetail (profil vendeur Supabase ; briques nextgen Trust/Prix/Fraude conçues « anti-façade » = null si pas de donnée ; financement & logistique explicitement « indicatif _

### [P1] Note vendeur 4,5/5 FABRIQUÉE affichée comme réelle (#seller/:id)
- **Zone** : #seller/:id — SellerMachines (page vitrine vendeur publique)
- **Nature donnée** : SIMULEE
- **Fait** : La note du vendeur est codée en dur : sellerInfo = { ..., rating: 4.5 } (ligne 46), puis affichée avec une étoile et « {sellerInfo.rating}/5 » (ligne 118). TOUS les vendeurs affichent donc 4,5/5 quelle que soit la réalité — il n'existe aucune table/colonne de notation lue. C'est une donnée SIMULÉE présentée comme un avis réel, qui influence directement la confiance/décision de l'acheteur. Portée réelle atténuée : la vitrine vendeur principale est aujourd'hui #vitrine/:id (MachineDetail ligne 891 pointe vers #vitrine/…), donc #seller/:id est semi-orpheline, mais la route reste active et dans le périmètre.
- **Preuve** : `src/pages/SellerMachines.tsx:46 et src/pages/SellerMachines.tsx:118`
- **Reco** : Ne pas afficher de note tant qu'il n'existe pas de source réelle (table d'avis/ratings ou trust_score). Soit masquer le bloc note, soit brancher la vraie donnée (ex. nextgen trust_profiles déjà utilisé ailleurs). Ne jamais afficher 4,5/5 en dur.

### [P2] Requête machines du vendeur cassée : .eq('sellerId') alors que la colonne est 'sellerid'
- **Zone** : #seller/:id — SellerMachines
- **Nature donnée** : REELLE
- **Fait** : La liste des annonces du vendeur est chargée via supabase.from('machines').select(...).eq('sellerId', sellerId) (ligne 54) avec un « I » majuscule. Or la colonne réelle est en minuscules : MACHINE_LIST_COLUMNS liste 'sellerid' et 'seller_id' (machineQueryFields.ts:27-28), le chemin d'écriture écrit row.sellerid/row.seller_id (utils/api/machines.ts:45-46) et la fonction canonique getSellerMachines n'essaie QUE ['sellerid','seller_id','user_id','owner_id'] (machines.ts:66). PostgREST est sensible à la casse : le filtre 'sellerId' vise une colonne inexistante → erreur 42703, capturée et loggée, machines reste []. Résultat : sur la page d'un vendeur ayant réellement des annonces, le compteur d'en-tête affiche « 0 machine disponible » et le corps « Aucune machine disponible pour le moment ».
- **Preuve** : `src/pages/SellerMachines.tsx:54 (vs src/constants/machineQueryFields.ts:27 et src/utils/api/machines.ts:66)`
- **Reco** : Remplacer .eq('sellerId', sellerId) par la même logique multi-colonnes que getSellerMachines (essayer 'sellerid' puis 'seller_id'), ou réutiliser directement cette fonction. Corriger avant de re-lier la page.

### [P2] Page Services 100% statique : CTA téléphone factice + certifications/garanties codées en dur
- **Zone** : #services — Services
- **Nature donnée** : STATIQUE
- **Fait** : Page entièrement statique (tableau `services` en dur, aucune source de données). Problèmes de crédibilité : (1) bouton « Appeler Maintenant » → href="tel:+212XXXXXXXX" (ligne 194), lien mort qui compose un numéro invalide ; (2) bloc « Certifications » affichant « ISO 9001:2015 », « ISO 14001:2015 », « OHSAS 18001 » (lignes 244-254) présentés comme des faits — non vérifiables, et OHSAS 18001 est obsolète (remplacée par ISO 45001), signe d'un boilerplate copié ; (3) promesses « Service garanti 100% », « Disponibilité 24/7 », « Experts certifiés » (lignes 208-218) codées en dur. Rien n'atteste ces affirmations dans le code/données.
- **Preuve** : `src/pages/Services.tsx:194 et src/pages/Services.tsx:208-254`
- **Reco** : Retirer le CTA téléphone tant qu'aucun numéro réel (cf. Contact qui a déjà masqué les faux numéros). Retirer ou justifier les certifications (les afficher seulement si l'entreprise les détient vraiment ; corriger OHSAS→ISO 45001). Nuancer les promesses 24/7/100% non tenues.

### [P2] « Chat en direct » / « Support en ligne » annoncés mais assistant non configuré en production
- **Zone** : #contact (Contact) + ChatWidget global ; #services
- **Nature donnée** : STATIQUE
- **Fait** : Contact.tsx:266-273 affiche « Support en ligne — Chat en direct disponible Lundi-Vendredi 9h-17h » et Services annonce « Disponibilité 24/7 ». Le ChatWidget appelle VITE_N8N_ASSISTANT_URL et, si absent, répond honnêtement « L'assistant en ligne n'est pas encore configuré » (ChatWidget.tsx:142-155). Or VITE_N8N_ASSISTANT_URL n'est PRÉSENT que dans .env (dev) et ABSENT de .env.production ; VITE_WHATSAPP_NUMBER n'est défini nulle part (pas de bouton WhatsApp de repli). En build prod, le « chat en direct » annoncé est donc non fonctionnel. Caveat : les variables peuvent être injectées au déploiement hors fichiers versionnés — à confirmer côté CI/hébergeur.
- **Preuve** : `src/pages/Contact.tsx:266 et src/components/ChatWidget.tsx:142 (config: .env.production sans VITE_N8N_ASSISTANT_URL)`
- **Reco** : Soit configurer réellement l'assistant/WhatsApp en prod, soit retirer/atténuer la promesse « chat en direct disponible » sur Contact et « 24/7 » sur Services pour éviter une attente non tenue.

### [P3] Localisation vendeur toujours « non spécifiée » (colonne location non sélectionnée)
- **Zone** : #seller/:id — SellerMachines
- **Nature donnée** : STATIQUE
- **Fait** : Le code lit sellerData.location (ligne 47) mais la requête profil sélectionne PROFILE_PUBLIC_LIST_COLUMNS = ['id','firstname','lastname'] (machineQueryFields.ts:56) — 'location' n'est jamais chargée. sellerData.location est donc toujours undefined et la page affiche systématiquement « Localisation non spécifiée », quel que soit le profil réel.
- **Preuve** : `src/pages/SellerMachines.tsx:47 (vs src/constants/machineQueryFields.ts:56)`
- **Reco** : Ajouter 'location' (si la colonne existe et est exposée par RLS) à PROFILE_PUBLIC_LIST_COLUMNS, ou retirer l'affichage de la localisation vendeur pour ne pas montrer une valeur factice.

### [P3] Routes « métier » annoncées (#courtier, #loueur, #transporteur…) inexistantes → retombent sur l'accueil
- **Zone** : #courtier / #investisseur / #logisticien / #loueur / #mecanicien / #transitaire / #transporteur
- **Nature donnée** : SANS-OBJET
- **Fait** : Le switch de routing (src/App.tsx:255-506) n'a AUCUN case pour ces hash. Ces mots n'apparaissent qu'en tant que valeur `activeMetier` À L'INTÉRIEUR du dashboard entreprise privé (App.tsx:337-343) et dans la config des sidebars — jamais comme page publique. Naviguer vers #courtier (etc.) tombe donc sur `default` et rend l'ACCUEIL (Hero + HomeTrustSection + CategoryList + FeaturedMachines) sans aucune indication. Aucun lien du Header/Footer ne pointe vers ces hash (donc atteignables seulement à la main), mais ces « pages secteur/métier publiques » n'existent pas réellement.
- **Preuve** : `src/App.tsx:494 (default) et src/App.tsx:255`
- **Reco** : Soit créer de vraies pages métier, soit rediriger explicitement ces hash (ex. vers #machines?categorie=… ou #entreprise), soit acter qu'elles n'existent pas dans la doc de périmètre. Ne pas les présenter comme des pages livrées.

### [P3] Blog entièrement statique (contenu et « actualités » codés en dur)
- **Zone** : #blog et #blog/:id — Blog
- **Nature donnée** : STATIQUE
- **Fait** : Les 3 articles sont un tableau `blogPosts` codé en dur (Blog.tsx:24-126), aucune source Supabase. IDs non contigus (1, 2, 6). Le contenu contient des affirmations chiffrées et nominatives présentées comme factuelles (ex. « Al Maaden Construction a augmenté de 28 % la durée de vie de ses pelles Caterpillar », ligne 76 ; prix immobiliers « +12 à 18 % »), auteurs au nom sans source, et une image chargée depuis un domaine externe (lycopodium.com, ligne 44). Présenté comme « Actualités, conseils d'experts et analyses » alors que c'est du contenu figé/éditorial non sourcé.
- **Preuve** : `src/pages/Blog.tsx:24 et src/pages/Blog.tsx:76`
- **Reco** : Acceptable comme contenu éditorial, mais : vérifier/étayer les statistiques citées (28 %, +12-18 %) sous peine de fausses affirmations, héberger les images en local, et à terme brancher un vrai CMS/table si le blog doit vivre.

### [P3] Backdoor « Accès démo (code temporaire) » fabrique un utilisateur factice sans session Supabase
- **Zone** : #connexion — Login (TempAccessBlock)
- **Nature donnée** : SIMULEE
- **Fait** : Login.tsx:175-198 : si un code correspond à VITE_MONITOR_TEMP_ACCESS_CODE, le code écrit un faux utilisateur en localStorage (email 'demo@minegrid.com', prénom 'Démo'), pose selectedSubscription='gratuit' et redirige vers #dashboard SANS aucune session Supabase réelle. C'est un contournement d'auth basé localStorage. Atténuation forte : le bloc ne s'affiche que si TEMP_ACCESS_CODE est non vide, et VITE_MONITOR_TEMP_ACCESS_CODE est VIDE dans .env.production (et non défini en dev) → désactivé par défaut. Les routes payantes sont par ailleurs re-vérifiées côté serveur (RequireSubscription).
- **Preuve** : `src/pages/Login.tsx:186-198 (config: .env.production VITE_MONITOR_TEMP_ACCESS_CODE=)`
- **Reco** : Garder ce code strictement hors des builds publics (idéalement derrière import.meta.env.DEV, pas seulement une env var), et s'assurer qu'aucun état applicatif sensible ne se fie au 'user' localStorage sans session Supabase.

### [P3] Filtre #services/:group : id 'sécurité-conformité' ne matche pas le groupe 'securite-conformite'
- **Zone** : #services/:service — Services (groupes)
- **Nature donnée** : STATIQUE
- **Fait** : Le service a l'id 'sécurité-conformité' (accents, ligne 113) mais serviceGroups.support référence 'securite-conformite' (sans accents, ligne 11). filteredServices compare par inclusion d'id ; en naviguant vers #services/support, la carte Sécurité & Conformité est donc omise de la liste filtrée. Incohérence mineure, purement statique (aucune donnée réelle en jeu).
- **Preuve** : `src/pages/Services.tsx:11 et src/pages/Services.tsx:113`
- **Reco** : Uniformiser les identifiants (retirer les accents dans l'id du service, ou les ajouter dans serviceGroups.support).

### [P3] #secteur (SectorMachines) orpheline et filtre par catégorie exacte souvent vide
- **Zone** : #secteur — SectorMachines
- **Nature donnée** : REELLE
- **Fait** : Aucun lien de l'application ne pointe vers #secteur (recherche '#secteur' : 0 occurrence). La page lit ?secteur= depuis le hash et filtre les annonces par égalité stricte m.category?.toLowerCase() === secteur.toLowerCase() (ligne 83). Sans paramètre, secteur='' → filtre vide → « Aucun résultat ». Le fetch machines est réel (Supabase), mais la page est de fait inatteignable via l'UI et, atteinte à la main sans param, n'affiche rien d'utile. Incohérent avec l'accueil qui, lui, utilise le mapping resolveMachineSector (pas l'égalité brute de catégorie).
- **Preuve** : `src/pages/SectorMachines.tsx:83 (aucun lien entrant '#secteur' dans src/)`
- **Reco** : Soit supprimer la route, soit la relier correctement (avec ?secteur=) et aligner son filtrage sur resolveMachineSector comme l'accueil, sinon elle restera vide.

### [info] Simulateur logistique : estimation CALCULÉE (formule figée) sur la fiche machine
- **Zone** : #machines/:id — MachineDetail → LogisticsSimulator
- **Nature donnée** : CALCULEE
- **Fait** : Sur la fiche machine, le « Simulateur de transport International » affiche un coût et un délai calculés par une heuristique client (estimerTransport + barèmes codés en dur : distances, tarifs €/km par région, frais portuaires ~170 €, assurance 1% CIF, conversion USD→EUR 0.85 dans LogisticsSimulator.tsx:389-407). Ce n'est PAS un devis transporteur réel. Point positif : c'est explicitement libellé « Estimation indicative » (ligne 354) et le détail du calcul est montré. À noter tout de même : la mention « tarifs Nile Cargo Carrier » et « taux officiels » (ligne 356) suggère une précision qui n'est pas garantie par une API réelle.
- **Preuve** : `src/components/LogisticsSimulator.tsx:78 et src/components/LogisticsSimulator.tsx:389-407`
- **Reco** : OK tant que « indicatif » reste visible. Éviter de nommer un transporteur précis (« Nile Cargo Carrier ») si les barèmes ne proviennent pas réellement de lui, pour ne pas surévaluer la fiabilité.

**Couverture** : COUVERT (lu et vérifié fichier:ligne) : Accueil (Hero.tsx, HomeTrustSection.tsx + hooks useCategoryCounts/usePublicMachineCount = vrais Supabase, CategoryList.tsx, FeaturedMachines.tsx = réel) ; #machines (Machines.tsx = réel + fallback + état vide honnête) ; #machines/:id (MachineDetail.tsx = réel Supabase ; briques nextgen inline.tsx + priceService.ts + trustService.ts = honnêtes, null si pas de donnée ; LogisticsSimulator.tsx = estimation indicative) ; #seller/:id (SellerMachines.tsx = bugs note/colonne/location) ; #secteur (SectorMachines.tsx = orpheline) ; #services (Services.tsx = statique) ; #contact (Contact.tsx + utils/api/contact.ts = insert réel) ; #blog (Blog.tsx = statique) ; pages légales (LegalStaticPage.tsx = statique honnête) ; auth #connexion/#inscription/#mot-de-passe-ou


## PHASE 3B — Audit page par page (lot 2 : Dashboards & Métier)

_Audit des dashboards #pro, #premium-dashboard, #dashboard-entreprise(-display), #dashboard-configurator et des 8 #dashboard-*-display + leurs widgets. CONSTAT GLOBAL : l'architecture widgets Enterprise est majoritairement branchée sur des DONNÉES RÉELLES Supabase avec une discipline « anti-façade » explicite et documentée (états vides honnêtes, pas de Math.random, pas de CA fabriqué). WidgetRenderer.tsx (163 Ko) route chaque widget métier vers un composant dédié qui interroge de vraies tables via src/utils/enterpriseApi/* (fallback []), et CockpitSummary charge des loaders réels par rôle. Les _

### [P1] ProDashboard / OverviewTab : sections « Activité Récente » et « Alertes » 100% codées en dur
- **Zone** : #pro (ProDashboard → OverviewTab)
- **Nature donnée** : STATIQUE
- **Fait** : Sous les 5 cartes KPI (qui, elles, sont RÉELLES via getPortalStats), la carte « Activité Récente » affiche 3 lignes fixes (« Maintenance préventive/Terminée », « Nouvelle commande/En attente », « Diagnostic équipement/En cours ») et la carte « Alertes » affiche 3 alertes fixes (« Maintenance due dans 3 jours », « Garantie expirée - Équipement #123 », « Diagnostic OK - Équipement #456 »). Aucune source de données : texte statique JSX identique pour tous les utilisateurs.
- **Preuve** : `src/pages/pro/widgets/OverviewTab.tsx:81-115`
- **Reco** : Brancher sur données réelles (dernières interventions/commandes/notifications déjà chargées dans ProDashboard.loadDashboardData) ou retirer ces deux cartes. Ne pas afficher des #123/#456 fictifs sur l'espace Pro payant.

### [P2] ProDashboard / OverviewTab : libellés de variation (« change ») des KPI codés en dur
- **Zone** : #pro (ProDashboard → OverviewTab)
- **Nature donnée** : REELLE (valeur) / STATIQUE (libellé de variation)
- **Fait** : Les 5 cartes KPI ont des valeurs RÉELLES (stats.totalEquipment, activeEquipment, pendingOrders, upcomingInterventions, unreadNotifications) mais leur sous-libellé de tendance est une chaîne fixe : « +2 ce mois », « À traiter », « Cette semaine », « Nouvelles ». « +2 ce mois » suggère une variation calculée qui ne l'est pas.
- **Preuve** : `src/pages/pro/widgets/OverviewTab.tsx:16-52`
- **Reco** : Remplacer « +2 ce mois » par une vraie variation (getPortalStats expose déjà equipmentThisMonth) ou supprimer le libellé trompeur ; garder les libellés purement descriptifs neutres.

### [P2] PremiumDashboard : boutons « Actions rapides » non branchés (morts)
- **Zone** : #premium-dashboard (PremiumDashboard)
- **Nature donnée** : STATIQUE (boutons non-branchés)
- **Fait** : Le bloc « Actions rapides » propose 4 boutons (Nouvelle annonce, Voir les statistiques, Gérer les messages, Support) sans aucun onClick ni href — clics sans effet. Le reste de la page est RÉEL (getDashboardStats, getMessages, getOffers, getSellerMachines, getNotifications).
- **Preuve** : `src/pages/PremiumDashboard.tsx:505-521`
- **Reco** : Câbler chaque bouton vers sa route (#publication, #pro stats, #messages, #priority-support) ou retirer le bloc. Un bouton visible sans action est une façade.

### [P2] Score de Performance Commerciale : rang/classement toujours 1/1 alors que « classement anonymisé » est mis en avant
- **Zone** : #dashboard-entreprise-display (vendeur) → SalesPerformanceScoreWidget / getSalesPerformanceData
- **Nature donnée** : CALCULEE (score) / STATIQUE (rang 1/1 + cibles)
- **Fait** : Le widget est majoritairement RÉEL/CALCULÉ (score convergent à partir de machine_views, messages, offers, leads RealPipelineService). Mais rank=1 et totalVendors=1 sont codés en dur (pas de benchmarking inter-vendeurs en base), tout comme les cibles target:85, salesTarget:3000000, growthTarget:15. Or les catalogues widgets annoncent « rang anonymisé » / « comparaison avec objectif ».
- **Preuve** : `src/utils/api/dashboard.ts:402-436 (rank:1, totalVendors:1, target/salesTarget/growthTarget)`
- **Reco** : Soit implémenter un vrai classement (RPC agrégée anonymisée), soit masquer le « rang X/Y » tant qu'il n'existe pas ; rendre les cibles configurables plutôt que fixées à 3 M MAD/85/15%.

### [P2] Module constants/mockData toujours importé comme fallback dans WidgetRenderer
- **Zone** : WidgetRenderer (tous #dashboard-*-display)
- **Nature donnée** : SIMULEE (fallback), non atteint dans les rôles routés
- **Fait** : getWidgetData() retourne des données MOCK statiques (metrics/charts/lists/…); il est appelé à chaque rendu (rawData) et sert de data aux branches par défaut des cas chart/list/pipeline/metric/inventory/equipment/calendar/map. Dans les dashboards audités, chaque widget-id a une branche dédiée branchée sur du réel, donc le mock n'est atteint que par un widget-id SANS branche. C'est du code mort risqué : tout nouveau widget générique afficherait des chiffres fictifs sans alerte.
- **Preuve** : `src/components/dashboard/WidgetRenderer.tsx:3 et :1189 ; fallbacks rawData:1816,2750,2777,3232,3261,3388 ; src/constants/mockData/widget-data.ts:10-52`
- **Reco** : Remplacer les fallbacks rawData par un état vide honnête (« Aucune donnée / widget non branché ») et supprimer constants/mockData, cohérent avec la politique anti-façade déjà appliquée partout ailleurs.

### [P3] Rôle Financier : widgets sans branche WidgetRenderer → tomberaient sur le mock (route non exposée)
- **Zone** : src/pages/widgets/FinancierWidgets.js (non routé)
- **Nature donnée** : SIMULEE si rendu / SANS-OBJET (non routé)
- **Fait** : FinancierWidgets définit cash-flow, revenue-growth, payment-status, expense-breakdown (type chart/list). Aucun de ces ids n'a de branche dédiée dans WidgetRenderer → ils rendraient via getWidgetData (MOCK) ou vide. Aucune route #dashboard-financier-display n'existe dans App.tsx (le loader financier existe seulement pour le CockpitSummary), donc ces widgets ne sont pas exposés aujourd'hui.
- **Preuve** : `src/pages/widgets/FinancierWidgets.js:9-56 ; absence de case 'dashboard-financier-display' dans src/App.tsx:333-369`
- **Reco** : Si le rôle Financier doit exister : brancher ses 4 widgets sur de vraies tables (à l'image des autres rôles) avant d'ajouter une route ; sinon documenter que Financier n'est qu'un cockpit et retirer/park le fichier widgets pour éviter la confusion.

### [P3] Widgets IA & benchmark secteur dépendants d'un service externe Monitor (sinon vides)
- **Zone** : vendeur : ai-insights, ai-optimization, sales-evolution (benchmark)
- **Nature donnée** : REELLE si Monitor connecté, sinon vide (jamais simulée)
- **Fait** : AIOptimizationWidget, les « Insights du serveur IA » d'AIInsightsWidget, le benchmark secteur de SalesEvolution et les recommandations serveur passent par aiWidgetService → VITE_MONITOR_API_URL (défaut http://localhost:8000). Hors service, tout retourne [] ou data:null : états vides honnêtes (« Aucune optimisation suggérée », pas de moyenne/top25 fabriqués). Comportement anti-façade correct, MAIS en déploiement standard sans Monitor ces widgets paraissent « vides ».
- **Preuve** : `src/services/aiWidgetService.ts:81,240-253,255-262,364-373 ; src/components/dashboard/widgets/AIOptimizationWidget.tsx:35,196`
- **Reco** : Afficher un état vide explicite « Analyse IA indisponible (service non connecté) » plutôt qu'un simple « Aucune recommandation » qui laisse penser que tout va bien ; documenter la dépendance Monitor pour éviter un ressenti « widget cassé ».

### [P3] Listes de widgets bornées par slice/limit sans pagination réelle
- **Zone** : ListWidget, PremiumDashboard, enterpriseApi
- **Nature donnée** : REELLE (bornée)
- **Fait** : Les listes sont tronquées : ListWidget affiche maxItems avec un toggle « voir tout » (slice), PremiumDashboard fait slice(0,5) sur messages/offres/équipements, les providers enterpriseApi limitent (.limit(25-60)). Pas de pagination/scroll infini : au-delà du plafond, les éléments sont invisibles sans indication de troncature côté providers.
- **Preuve** : `src/components/dashboard/widgets/ListWidget.tsx:119 ; src/pages/PremiumDashboard.tsx:291,322,362 ; src/utils/enterpriseApi/logisticien.ts:86,169,213`
- **Reco** : Ajouter un compteur « X sur N » et/ou une pagination sur les listes susceptibles de dépasser le plafond (pipeline, dossiers, alertes). Priorité basse tant que les volumes restent faibles.

### [info] POSITIF — Discipline anti-façade confirmée sur les widgets métier Enterprise
- **Zone** : Tous #dashboard-*-display + CockpitSummary
- **Nature donnée** : REELLE (ou vide honnête si table non peuplée)
- **Fait** : Vérifié sur échantillon : StockStatusWidget calcule un score déterministe depuis machine_views/offers/messages (remplace un ancien Math.random), les providers logisticien/courtier/investisseur/transport/transitaire interrogent de vraies tables Supabase (fallback []), CockpitSummary charge 9 loaders réels par rôle, et les widgets planifiés non branchés sont exclus des validIds avec commentaire. getSalesPerformanceData/getSalesEvolutionSeriesData n'inventent plus de CA (commentaires « anti-façade »).
- **Preuve** : `src/components/dashboard/widgets/StockStatusWidget.tsx:213-299 ; src/utils/enterpriseApi/logisticien.ts:34-181 ; src/components/dashboard/cockpit/CockpitSummary.tsx:150-389 ; src/pages/widgets/plannedEnterpriseWidgets.ts:1-77 ; src/pages/EnterpriseDashboardMecanicienDisplay.tsx:10`
- **Reco** : KEEP. Conserver cette architecture ; l'étendre en supprimant le dernier fallback mock (constants/mockData) pour homogénéiser.

### [info] DashboardConfigurator : page de sélection de métier/widgets (catalogue marketing en dur, pas de données opérationnelles)
- **Zone** : #dashboard-entreprise & #dashboard-configurator (DashboardConfigurator)
- **Nature donnée** : SANS-OBJET (page de configuration, pas de widget de données)
- **Fait** : C'est un assistant de configuration : liste de métiers et de widgets décrite en dur (titres, descriptions, listes de « features » = copie marketing). Il persiste le choix (localStorage/compte) puis renvoie vers les *Display. Il n'affiche pas de KPI/chiffres opérationnels, donc les textes en dur ne constituent pas une façade de données.
- **Preuve** : `src/pages/DashboardConfigurator.tsx:20-72 ; src/App.tsx:330-331,374-375`
- **Reco** : KEEP tel quel ; s'assurer que les « features » listées correspondent aux widgets réellement branchés du rôle (éviter de promettre des widgets planifiés non disponibles).

**Couverture** : COUVERT (lu et tracé) : App.tsx (routing hash + gardes scope/abonnement), ProDashboard + OverviewTab, PremiumDashboard, EnterpriseDashboardShell + useShellState (grille/persistance), WidgetRenderer.tsx (dispatch par type/id, fallback rawData, ~70 branches widget-id), constants/mockData (getWidgetData), les 8 fichiers *Display + leurs validIds/defaultActiveIds, les 9 fichiers de définition de widgets par rôle (Vendeur/Courtier/Investisseur/Logisticien/Loueur/Mecanicien/Transitaire/Transporteur/Financier), plannedEnterpriseWidgets, CockpitSummary + loaders, providers enterpriseApi (logisticien lu en entier, autres via comptage .from/.rpc et signatures), widgets dédiés StockStatus/SalesPipeline/DailyActions/SalesPerformanceScore/AIInsights/AIOptimization/TransactionCases, dashboard.ts (getDas


## PHASE 3B — AUDIT PAGE PAR PAGE (lot 3 : OUTILS & TRANSACTIONNEL)

_Le socle transactionnel « sérieux » (#leads, #dossiers/#dossier, #opportunites-vente, #global-monitor projets, #planning, #devis save, #documents, #multi-user membres, #assistant-ia, #accepter-invitation, #financement) est majoritairement adossé à de VRAIES données Supabase / services, avec des états vides/erreur honnêtes et un séquestre correctement désactivé (aucun PSP : create-payment déployée mais create-escrow absente). Les problèmes se concentrent sur trois zones : (1) la Vitrine (#vitrine) truffée de données SIMULÉES présentées comme réelles (prix de location inventés, note « 5.0 / 247 _

### [P1] Documents : métadonnées perdues à l'upload (shadowing de variable)
- **Zone** : #documents — src/pages/DocumentsEspace.tsx (handleUpload)
- **Nature donnée** : REELLE (table+storage) mais insertion corrompue
- **Fait** : Ligne 121 `const { data: uploadData, error } = await supabase.storage...upload()` REDÉCLARE une variable `uploadData` qui masque l'état de formulaire `uploadData` (l.66). Les lignes 138-147 lisent alors `uploadData.name/type/category/description/tags` depuis la réponse du storage (qui ne contient que {id, path, fullPath}) → tous undefined. Le document est enregistré sans nom/type/catégorie/tags (ou l'insert échoue si colonne NOT NULL).
- **Preuve** : `src/pages/DocumentsEspace.tsx:121, 137-149`
- **Reco** : Renommer la variable du storage (ex. `uploadRes`) et construire documentData à partir de l'état de formulaire (le vrai `uploadData`).

### [P1] Vitrine : prix de location INVENTÉS affichés comme réels
- **Zone** : #vitrine — src/pages/VitrinePersonnalisee.tsx
- **Nature donnée** : SIMULEE
- **Fait** : Les prix de location affichés (xx€/jour, /semaine) sont calculés à la volée depuis le prix de vente : rental_price_daily = price*0.02, weekly = price*0.12, monthly = price*0.35 (aucune source réelle). Affichés en dur en € sur la fiche machine publique (l.1199-1204).
- **Preuve** : `src/pages/VitrinePersonnalisee.tsx:383-385, 1199-1204`
- **Reco** : Ne pas afficher de prix de location tant qu'ils ne sont pas saisis par le vendeur ; sinon marquer clairement « estimation ».

### [P1] Vitrine : note « 5.0 » et « 247 avis clients » codés en dur
- **Zone** : #vitrine — src/pages/VitrinePersonnalisee.tsx (Évaluations Clients)
- **Nature donnée** : SIMULEE
- **Fait** : Bloc « Évaluations Clients » affiche 5 étoiles pleines, « 5.0 » et « 247 avis clients » en dur pour TOUTE vitrine, sans aucune table d'avis. Fausse preuve sociale identique pour chaque vendeur.
- **Preuve** : `src/pages/VitrinePersonnalisee.tsx:1049-1061`
- **Reco** : Supprimer le bloc ou le brancher sur une vraie table d'avis ; à défaut, masquer tant qu'aucun avis réel.

### [P1] Messages : « Envoyer la réponse » n'atteint jamais le client
- **Zone** : #messages — src/pages/MessagesBoite.tsx (sendReply)
- **Nature donnée** : REELLE (insert) mais action trompeuse
- **Fait** : sendReply insère une ligne messages avec sellerid = celui du vendeur lui-même et sender_name 'Réponse automatique' : la « réponse » retombe dans la boîte du vendeur, aucun email/notification n'est envoyé au client. Le toast « Réponse envoyée avec succès ! » est mensonger.
- **Preuve** : `src/pages/MessagesBoite.tsx:148-187`
- **Reco** : Router la réponse vers l'email du client (Edge Function send-email) ou clarifier que ce n'est qu'une note interne.

### [P2] Publication : machine insérée en seller_id, invisible dans la vitrine (sellerid)
- **Zone** : #publication/#vendre — src/pages/PublicationRapide.tsx (handleManualSubmit)
- **Nature donnée** : REELLE mais incohérence de colonne
- **Fait** : L'insert machine utilise `seller_id: user.id` (l.477), alors que la Vitrine publique lit `.eq('sellerid', ...)` (VitrinePersonnalisee.tsx:333) et les messages/analytics utilisent 'sellerid'. getSellerMachines teste plusieurs colonnes donc « Mes annonces » l'affiche, mais la vitrine publique (sellerid uniquement) ne verra jamais l'annonce.
- **Preuve** : `src/pages/PublicationRapide.tsx:477 ; src/pages/VitrinePersonnalisee.tsx:333 ; src/utils/api/machines.ts:66`
- **Reco** : Uniformiser sur `sellerid` à l'insertion (ou aligner toutes les lectures).

### [P2] Vitrine : disponibilité machine tirée au hasard
- **Zone** : #vitrine — src/pages/VitrinePersonnalisee.tsx
- **Nature donnée** : SIMULEE
- **Fait** : is_available = Math.random() > 0.3 : le badge « ✓ Disponible / ✗ Indisponible » et l'activation du bouton « Réserver » dépendent d'un tirage aléatoire à chaque chargement, pas d'un état réel.
- **Preuve** : `src/pages/VitrinePersonnalisee.tsx:382`
- **Reco** : Utiliser un vrai champ de disponibilité de la machine ; retirer le random.

### [P2] Vitrine : « interactions intelligentes » et réservation = simulacres (setTimeout + toast)
- **Zone** : #vitrine — src/pages/VitrinePersonnalisee.tsx
- **Nature donnée** : SIMULEE
- **Fait** : handleGetRecommendations/CalculateCost/CallbackRequest/ExpertContact/BundleRequest ne font qu'un setTimeout puis un toast à valeurs codées en dur (ex. « Coût total estimé : 7 500€ pour 3 mois »). Le modal de réservation « Réserver » ne fait qu'un toast 'Demande envoyée', sans persistance ni notification.
- **Preuve** : `src/pages/VitrinePersonnalisee.tsx:561-604, 1944-1948`
- **Reco** : Brancher ces formulaires sur submitContactMessage/une vraie table de demandes, ou retirer les boutons.

### [P2] Vitrine : « Projets réalisés à proximité » fictifs
- **Zone** : #vitrine — src/pages/VitrinePersonnalisee.tsx
- **Nature donnée** : SIMULEE
- **Fait** : Trois projets codés en dur (Route A1 Rabat, Mine de Phosphate Khouribga, Port de Casablanca) affichés pour toutes les vitrines, plus badges de confiance statiques (Vendeur Vérifié, Pro Certifié, Garantie 12 mois…) et conditions « 30% à la commande, 70% à la livraison » / « Livraison gratuite 50km » en dur.
- **Preuve** : `src/pages/VitrinePersonnalisee.tsx:1823-1838, 1849-1874, 1620, 1637`
- **Reco** : Supprimer les projets/badges fictifs ou les alimenter depuis des données réelles.

### [P2] Global Monitor : l'onglet Alertes bascule en données de DÉMO en cas d'erreur API
- **Zone** : #global-monitor — src/components/global-monitor/AlertsPanel.tsx
- **Nature donnée** : SIMULEE (fallback)
- **Fait** : Sur échec de fetchAlertRules/Events, le panneau affiche silencieusement DEMO_RULES/DEMO_EVENTS (règles Sénégal/Ghana, events fictifs) présentés comme réels — contredit l'anti-façade appliqué aux projets du même écran (qui, eux, se vident honnêtement).
- **Preuve** : `src/components/global-monitor/AlertsPanel.tsx:28-58, 189-191`
- **Reco** : Remplacer le fallback démo par un état d'erreur/vide explicite.

### [P2] Devis : bouton « Télécharger PDF » non fonctionnel
- **Zone** : #devis — src/pages/DevisGenerator.tsx (generatePDF)
- **Nature donnée** : SANS-OBJET (action factice)
- **Fait** : generatePDF ne fait qu'un toast « Génération du PDF en cours... » avec commentaire « Simulation de génération PDF » / « Ici on pourrait intégrer jsPDF ». Aucun fichier n'est produit. La sauvegarde en base (table devis) est en revanche réelle et fonctionnelle.
- **Preuve** : `src/pages/DevisGenerator.tsx:180-184, 308-314`
- **Reco** : Implémenter un vrai export (jsPDF/impression) ou masquer le bouton.

### [P2] Messages : vocabulaire de statut incohérent (filtre « Non lu » et auto-lecture inopérants)
- **Zone** : #messages — src/pages/MessagesBoite.tsx
- **Nature donnée** : REELLE mais logique cassée
- **Fait** : Le filtre propose 'non_lu' (l.284) et markAsRead ne se déclenche que si status==='non_lu' (l.333), alors que le code écrit/traite 'new' (l.163, getUrgentCount l.225) et markAsRead écrit 'lu'. Les vrais messages n'étant pas 'non_lu', le filtre « Non lu » ne matche rien et le marquage automatique ne se produit jamais.
- **Preuve** : `src/pages/MessagesBoite.tsx:284, 333, 163, 224-225`
- **Reco** : Unifier les statuts (ex. 'new'/'read'/'replied'/…) entre écriture, filtres et comparaisons.

### [P2] Multi-utilisateurs : suppression de membre uniquement en local
- **Zone** : #multi-user-management — src/pages/MultiUserManagement.tsx (handleDeleteMember)
- **Nature donnée** : REELLE (liste) mais action factice
- **Fait** : handleDeleteMember ne fait que setTeamMembers(filter) : aucune suppression côté organization_members. Le membre réapparaît au prochain chargement (getOrgMembers). Action trompeuse.
- **Preuve** : `src/pages/MultiUserManagement.tsx:484-488`
- **Reco** : Appeler une RPC de retrait de membre (RLS admin) ou retirer le bouton.

### [P2] Multi-utilisateurs : changement de rôle/statut société non persisté
- **Zone** : #multi-user-management — src/pages/MultiUserManagement.tsx (handleUpdateMember)
- **Nature donnée** : REELLE partiellement
- **Fait** : Dans le modal d'édition, seuls le rôle AO (upsertTenderRole) et l'affectation (setMemberScope) sont persistés. Le « Rôle » société et le « Statut » ne passent que par handleUpdateMember qui met à jour l'état local — la base organization_members n'est pas modifiée. Le changement de rôle société est illusoire.
- **Preuve** : `src/pages/MultiUserManagement.tsx:476-482, 1113-1116`
- **Reco** : Persister le rôle société via une RPC dédiée, ou retirer ces champs du modal.

### [P2] #demo-entreprise : accès accordé en localStorage, ignoré par le gating serveur
- **Zone** : #demo-entreprise — src/pages/DemoEntrepriseAccess.tsx
- **Nature donnée** : SANS-OBJET (contournement inopérant)
- **Fait** : grantAccess pose userSubscription/enterpriseService… en localStorage puis redirige vers #dashboard-entreprise. Or cette route passe par paidRoute('enterprise') → RequireSubscription qui lit EXCLUSIVEMENT le serveur (pro_clients), jamais localStorage (RequireSubscription.tsx:24-26,45-48). L'utilisateur retombe donc sur « Espace réservé aux abonnés » : la page démo ne débloque plus rien.
- **Preuve** : `src/pages/DemoEntrepriseAccess.tsx:19-39 ; src/components/RequireSubscription.tsx:45-48`
- **Reco** : Retirer/rediriger la page, ou faire pointer la démo vers un vrai octroi serveur temporaire.

### [P2] Publication : onglet « Import Excel/CSV avec OCR » non fonctionnel mais mis en avant
- **Zone** : #publication — src/pages/PublicationRapide.tsx (handleExcelUpload)
- **Nature donnée** : SANS-OBJET (désactivé honnêtement)
- **Fait** : handleExcelUpload ne parse rien : previewData=[] + toast « L'import Excel est en cours d'intégration ». L'ancien simulacre (2 machines fictives insérées) a été retiré — bien — mais l'onglet reste intitulé « avec OCR » et la carte « Fonctionnalités Enterprise › Publication en masse » continue de le vendre.
- **Preuve** : `src/pages/PublicationRapide.tsx:546-558, 973-975, 1123-1126`
- **Reco** : Renommer l'onglet (« bientôt disponible ») et retirer la promesse OCR/masse tant que non implémenté.

### [P2] #appels-offres : par défaut sur localStorage + seed de démo (pas de backend réel)
- **Zone** : #appels-offres — src/tenders/index.tsx
- **Nature donnée** : SIMULEE (par défaut)
- **Fait** : Au premier lancement, seedIfNeeded() injecte des données de démonstration en localStorage sauf si un espace partagé société est configuré (isTendersSharedConfigured). L'IA du module est mockée (VITE_TENDERS_AI_URL). L'expérience par défaut n'est donc pas adossée à Supabase.
- **Preuve** : `src/tenders/index.tsx:48-52`
- **Reco** : Afficher un bandeau « mode démo local » tant que l'espace partagé n'est pas activé.

### [P3] Devis : devise € codée en dur (contexte Maroc/Afrique)
- **Zone** : #devis — src/pages/DevisGenerator.tsx
- **Nature donnée** : STATIQUE
- **Fait** : Tous les montants sont suffixés « € » et la TVA par défaut à 20 %, alors que le marché cible est Maroc/Afrique (MAD, XOF…). Aucune sélection de devise, contrairement au reste du site (currencyStore + composant Price).
- **Preuve** : `src/pages/DevisGenerator.tsx:242-263, 548-556`
- **Reco** : Rendre la devise paramétrable (réutiliser currencyStore/Price).

### [P3] Messages : filtres « type » et « priorité » morts + titre de message vide
- **Zone** : #messages — src/pages/MessagesBoite.tsx
- **Nature donnée** : SANS-OBJET
- **Fait** : Les deux <select> Type et Priorité n'ont qu'une option (le map est commenté, l.273-275 et 297-299) : contrôles inertes. La liste des messages affiche un <h3> vide (subject commenté, l.347).
- **Preuve** : `src/pages/MessagesBoite.tsx:267-300, 343-348`
- **Reco** : Retirer ces filtres/markup inutilisés ou les brancher sur de vraies colonnes.

### [P3] Multi-utilisateurs : 3 boutons « Actions rapides » sans handler
- **Zone** : #multi-user-management — src/pages/MultiUserManagement.tsx
- **Nature donnée** : SANS-OBJET
- **Fait** : « Envoyer un message à l'équipe », « Voir les statistiques d'usage » et « Gérer les clés API » sont des <button> sans onClick (le lien « Rôles Appels d'offres » à côté, lui, fonctionne).
- **Preuve** : `src/pages/MultiUserManagement.tsx:886-897`
- **Reco** : Implémenter ou retirer ces boutons décoratifs.

### [P3] Vitrine : section « Services » dupliquée + texte « données de démonstration » périmé
- **Zone** : #vitrine — src/pages/VitrinePersonnalisee.tsx
- **Nature donnée** : STATIQUE
- **Fait** : La liste des services est affichée/éditée deux fois (bloc « Services » l.751-793 et « Services Professionnels » l.959-1041, même editData.services). Par ailleurs l'encadré d'aide affirme « des exemples sont affichés » si aucune annonce, alors que le code met désormais machines=[] (l.400) : plus aucun exemple → texte trompeur.
- **Preuve** : `src/pages/VitrinePersonnalisee.tsx:751-793, 959-1041, 1378-1380, 400`
- **Reco** : Fusionner les deux sections Services ; corriger le texte d'aide (plus de démo).

### [P3] Redondance : trois boîtes de contact acheteur parallèles (leads / messages / dossiers)
- **Zone** : #leads, #messages, #dossiers
- **Nature donnée** : REELLE (3 tables distinctes)
- **Fait** : Les demandes acheteur sont éclatées sur quote_requests (#leads), messages (#messages) et transaction_cases (#dossiers), sans vue unifiée. L'aide de #leads doit d'ailleurs expliquer longuement que ce sont des flux différents — signe d'un recouvrement déroutant pour l'utilisateur.
- **Preuve** : `src/pages/LeadsInbox.tsx:230-372 ; src/pages/MessagesBoite.tsx:58-81 ; src/pages/MyTransactionCasesPage.tsx:12-25`
- **Reco** : Envisager une inbox commerciale unifiée ou des renvois croisés clairs entre les trois.

**Couverture** : COUVERT (lecture code + vérif tables/migrations) : #leads (REEL quote_requests), #dossiers/#dossier (REEL transaction_cases + séquestre honnêtement désactivé, aucun PSP), #opportunites-vente (REEL monitor+stock, états honnêtes), #global-monitor (projets REELS anti-façade / Alertes fallback démo), #devis (save REEL table devis créée le 2026-07-11 ; PDF factice), #documents (REEL mais bug shadowing), #messages (REEL mais réponse factice + statuts cassés), #planning (REEL planning_events), #vitrine (machines REELLES mais nombreux enrichissements SIMULÉS), #publication/#vendre (liste+analytics REELS ; incohérence seller_id ; OCR désactivé), #financement (REEL email, honnête), #multi-user-management (membres/invits/sessions REELS ; delete/rôle local-only), #assistant-ia (REEL, serveur), #appels


## PHASE 5 — PERFORMANCE (analyse statique, sans test de charge)

_Analyse statique du code React/Vite/TS + SQL Supabase de MineGrid. Le catalogue est correctement paginé (.range) et beaucoup de requêtes sont plafonnées (.limit), mais 10 points concrets pèsent lourd à 300-500 utilisateurs : (1) AUCUN index sur machines(created_at / sellerid / category) dans le chemin de migration actif (supabase/migrations) — les seuls existent dans archive/scripts/sql ou en commentaire ; or la requête la plus chaude de l'app est `machines ORDER BY created_at DESC` (accueil + catalogue). (2) Agrégations lourdes côté navigateur (jusqu'à 5000 lignes machines sur l'accueil, jusq_

### [P1] machines(created_at) NON indexé dans le chemin de migration actif — requête la plus chaude de l'app
- **Zone** : DB / table machines — accueil + catalogue
- **Nature donnée** : REELLE
- **Fait** : La requête la plus fréquente est `machines ORDER BY created_at DESC` (FeaturedMachines LIMIT 80 sur chaque page d'accueil, Machines.tsx catalogue paginé). Or `supabase/migrations/*` ne crée AUCUN index sur machines. Les index (sellerid, status, boosted, city, country) n'existent que dans archive/scripts/sql/ (dossier archivé, application en prod non garantie) et l'index created_at n'est qu'un COMMENTAIRE `à exécuter si pas déjà fait`. Sans index created_at, chaque tri force un scan+tri complet de toute la table machines.
- **Preuve** : `src/components/FeaturedMachines.tsx:67-71 ; src/pages/Machines.tsx:206-210 ; src/constants/machineQueryFields.ts:58-62 (index en commentaire) ; grep `create index` sur supabase/migrations → 0 sur machines ; archive/scripts/sql/create-real-stock-tables.sql:102-104 (index seulement archivés)`
- **Reco** : Créer et versionner dans supabase/migrations : `CREATE INDEX IF NOT EXISTS idx_machines_created_at ON public.machines (created_at DESC);` + `idx_machines_sellerid ON machines (sellerid)` + `idx_machines_seller_id` + `idx_machines_category`. Vérifier en prod via `\d machines` / pg_indexes que ces index existent réellement (ne pas se fier au dossier archive).

### [P1] Accueil : agrégation de jusqu'à 5000 lignes machines (dont JSON specifications) côté navigateur
- **Zone** : src/hooks/queries/useCategoryCounts.ts (page d'accueil, tous visiteurs)
- **Nature donnée** : REELLE
- **Fait** : fetchCategoryCounts fait `.from('machines').select('category, specifications').limit(5000)` puis compte les secteurs en JS. Sur l'accueil (visiteurs anonymes inclus), cela rapatrie jusqu'à 5000 lignes incluant la colonne JSON specifications juste pour produire des compteurs par secteur. Le cache React-Query est par client (5 min) : chaque nouveau visiteur re-télécharge tout le payload.
- **Preuve** : `src/hooks/queries/useCategoryCounts.ts:15-19 (limit 5000 + boucle JS), commentaire l.12-13 reconnaît le problème`
- **Reco** : Remplacer par une vue/RPC SQL `GROUP BY secteur` (retourne ~10 lignes) au lieu de rapatrier 5000 lignes + JSON. Idem pour tout comptage d'accueil.

### [P1] Widget Stock : jusqu'à 3×50 000 lignes rapatriées pour compter vues/offres/messages en JS
- **Zone** : src/components/dashboard/widgets/StockStatusWidget.tsx (loadEngagementByMachine)
- **Nature donnée** : REELLE
- **Fait** : Pour calculer vues et contacts par machine, la fonction fait trois SELECT `.limit(50000)` sur machine_views, offers et messages, puis incrémente des compteurs ligne par ligne en JavaScript. C'est une agrégation qui devrait être un COUNT/GROUP BY serveur : jusqu'à 150 000 lignes transférées au navigateur par chargement de widget.
- **Preuve** : `src/components/dashboard/widgets/StockStatusWidget.tsx:229-233, 245-249, 261-265 (trois `.limit(50000)` + boucles de comptage l.235-238, 250-255, 266-273)`
- **Reco** : Utiliser des agrégats serveur : `select machine_id, count(*) ... group by machine_id` via RPC, ou un COUNT exact par machine, plutôt que de charger les lignes brutes. Réduire drastiquement les limites.

### [P1] Tempête de polling cockpit : rafraîchissements 15-60 s multipliant la charge DB par utilisateur
- **Zone** : Widgets dashboard (SalesPipeline, DailyActions, enterprise SalesPipeline, GlobalMonitor)
- **Nature donnée** : REELLE
- **Fait** : Plusieurs widgets montés simultanément déclenchent des setInterval de rafraîchissement : SalesPipelineWidget ventes toutes les 15 s (+ sur focus fenêtre) et locations toutes les 30 s ; enterprise SalesPipelineWidget toutes les 15 s ; DailyActionsPriorityWidget toutes les 60 s ; GlobalMonitor toutes les 45 s. Chaque rafraîchissement relance des lectures Supabase (dont getLeads non borné). À 300-500 dashboards ouverts, cela produit un plancher de requêtes continu (~des dizaines de req/s) même sans action utilisateur.
- **Preuve** : `src/components/dashboard/widgets/SalesPipelineWidget.tsx:169 (30000) et :187 (15000) ; src/pages/enterprise/widgets/SalesPipelineWidget.tsx:129 (15000) ; src/components/dashboard/widgets/DailyActionsPriorityWidget.tsx:177 (60000) ; src/pages/GlobalMonitor.tsx:125 (45000)`
- **Reco** : Remplacer le polling court par Supabase Realtime ciblé (déjà utilisé pour notifications) ou allonger nettement les intervalles + pause quand l'onglet est caché (document.hidden). Mutualiser un seul rafraîchissement partagé au lieu d'un timer par widget.

### [P1] getLeads() : SELECT NON borné (pas de .limit) sur tout le pipeline société, rejoué à chaque poll
- **Zone** : src/services/realPipelineService.ts (RealPipelineService.getLeads)
- **Nature donnée** : REELLE
- **Fait** : getLeads fait `.from('leads').select(...).order('created_at')` sans `.limit` ni `.range`. Avec le modèle équipe, la RLS scope à toute la société : un membre charge TOUS les leads de l'organisation. Cette lecture non bornée alimente les widgets pipeline (pollés toutes les 15 s), getDashboardStats et getSalesEvolutionSeriesData — donc rechargée en boucle. De plus `ORDER BY created_at` n'est pas indexé sur leads (les index posés sont organization_id et assigned_to_user_id, pas created_at).
- **Preuve** : `src/services/realPipelineService.ts:182-198 (select sans limit, order created_at) ; supabase/migrations/20260708120000_teamA_org_pipeline.sql:81-84 (index org/assigned, aucun sur created_at) ; consommé par src/utils/api/dashboard.ts:259 et SalesPipelineWidget`
- **Reco** : Ajouter `.limit(N)` (ex. 500) + pagination sur getLeads, et créer `CREATE INDEX idx_leads_created_at ON leads (created_at DESC)` (ou composite (organization_id, created_at DESC)).

### [P2] getDashboardStats : 8 requêtes COUNT enchaînées séquentiellement (await l'une après l'autre)
- **Zone** : src/utils/api/dashboard.ts (getDashboardStats)
- **Nature donnée** : REELLE
- **Fait** : getDashboardStats enchaîne 8 lectures indépendantes en await séquentiel : 5 COUNT exact sur machine_views (total/semaine/mois/semaine-1/mois-1 avec `.in('machine_id', machineIds)`), 1 COUNT messages, 1 COUNT offers, précédées de getSellerMachineIds. Étant indépendantes, elles devraient être parallélisées ; en série la latence s'additionne (RTT × 8).
- **Preuve** : `src/utils/api/dashboard.ts:107-152 (six blocs `await supabase...count exact` consécutifs) ; getSellerMachineIds l.63-78`
- **Reco** : Regrouper ces counts en un seul `Promise.all([...])`. Idéalement remplacer les 5 counts machine_views par une seule requête agrégée (une passe avec filtres de dates en SQL) ou une RPC.

### [P2] RLS : fonctions can_access_lead / can_access_transaction_case évaluées par ligne, avec auth.uid() non encapsulé
- **Zone** : SQL RLS — leads, transaction_cases et tables enfants
- **Nature donnée** : REELLE
- **Fait** : Les policies SELECT appellent une fonction SECURITY DEFINER par ligne : `can_access_lead(id, auth.uid())` et `can_access_transaction_case(id, auth.uid())`. Deux surcoûts connus Supabase : (1) `auth.uid()` est appelé en clair (non `(select auth.uid())`) donc réévalué à chaque ligne ; (2) can_access_lead refait un self-join `SELECT 1 FROM leads WHERE l.id = p_lead_id` alors que la policy tient déjà la ligne — redondant. Sur une lecture non bornée de leads (cf. getLeads) ou l'ouverture d'un dossier (transactionPlatform charge ~10 tables enfants filtrées par transaction_case_id, chacune ré-évaluant la fonction par ligne), le coût par ligne se multiplie.
- **Preuve** : `supabase/migrations/20260708120000_teamA_org_pipeline.sql:89-102 (can_access_lead self-join) et 162-167 (policy using can_access_lead(id, auth.uid())) ; sql/transaction_platform_core.sql:77-95 (can_access_transaction_case) et :117-119,145-147,194-196 (policies par ligne)`
- **Reco** : Encapsuler `(select auth.uid())` dans les USING/WITH CHECK (init-plan, évalué 1×). Réécrire les policies pour tester directement les colonnes de la ligne (`seller_id = (select auth.uid()) OR user_in_org(organization_id, (select auth.uid()))`) au lieu de re-SELECTer la table par id.

### [P2] messages : filtre .or(receiver_id, seller_id) non indexé sur seller_id (dont en COUNT exact)
- **Zone** : src/utils/api/dashboard.ts + StockStatusWidget — table messages
- **Nature donnée** : REELLE
- **Fait** : Plusieurs lectures/counts utilisent `.or(receiver_id.eq.<uid>,seller_id.eq.<uid>)`. Un `.or()` sur deux colonnes empêche l'usage efficace d'un index simple, et seul receiver_id/sender_id sont indexés (dans un script archivé) — seller_id n'a d'index nulle part. Le cas le plus coûteux : un COUNT exact messages avec ce `.or` dans getDashboardStats. Sur une grosse table messages c'est un scan.
- **Preuve** : `src/utils/api/dashboard.ts:143-146 (count exact + .or seller_id) et :234-237 ; src/components/dashboard/widgets/StockStatusWidget.tsx:261-264 ; index seulement dans archive/scripts/sql/fix-database-errors-sql.sql:122-125 (receiver/sender, pas seller_id)`
- **Reco** : Ajouter un index sur messages(seller_id) et messages(receiver_id) versionnés ; envisager de scinder le `.or` en deux requêtes indexées fusionnées, ou une colonne/participant normalisée. Éviter COUNT exact sur cette table (cf. point suivant).

### [P2] usePublicMachineCount : COUNT exact sur toute la table machines à chaque nouveau visiteur
- **Zone** : src/hooks/queries/usePublicMachineCount.ts (accueil)
- **Nature donnée** : REELLE
- **Fait** : `select('id', { count: 'exact', head: true })` sans filtre force Postgres à compter toutes les lignes machines (avec prédicat RLS) — coût croissant avec la table. Affiché sur l'accueil ; cache 5 min par client donc rejoué par chaque nouveau visiteur.
- **Preuve** : `src/hooks/queries/usePublicMachineCount.ts:6-8`
- **Reco** : Utiliser `count: 'estimated'` (ou 'planned') pour une stat d'accueil, ou lire un compteur maintenu (reltuples / table de stats). Un count exact n'est pas nécessaire pour un chiffre d'affichage.

### [P2] WidgetRenderer (3547 lignes) sans aucune mémoïsation, instancié par cellule de grille
- **Zone** : src/components/dashboard/WidgetRenderer.tsx + EnterpriseDashboardShell
- **Nature donnée** : SANS-OBJET
- **Fait** : WidgetRenderer est un composant monolithique de 3547 lignes avec 0 occurrence de React.memo / useMemo / useCallback. Il est rendu une fois par widget via `orderedLayouts.map(... <WidgetRenderer/>)` dans la grille. N'étant pas mémoïsé, tout re-render du shell (drag/layout, ou setState d'un widget pollé toutes les 15 s) re-rend l'ensemble des instances. Il importe ~40 fonctions de données ; chaque type de widget déclenche ses propres lectures au montage.
- **Preuve** : `src/components/dashboard/WidgetRenderer.tsx (grep memo/useMemo/useCallback → 0) ; src/pages/enterprise-shell/EnterpriseDashboardShell.tsx:369-472 (map + <WidgetRenderer> par cellule)`
- **Reco** : Envelopper WidgetRenderer dans React.memo (comparaison sur widget.id/type/data), découper le switch géant en composants par type chargés à la demande, et isoler les timers de polling pour éviter de re-rendre tout l'arbre.

### [P3] Résolution des machines vendeur : jusqu'à 6 requêtes séquentielles de repli par chargement
- **Zone** : StockStatusWidget + src/utils/api/machines.ts + dashboard.ts (fallback colonne vendeur)
- **Nature donnée** : REELLE
- **Fait** : Faute de convention stable (sellerid / seller_id / user_id / owner_id / pro_clients.id), le code essaie les colonnes une par une en séquence jusqu'à obtenir des lignes : jusqu'à 6 SELECT enchaînés sur machines à chaque chargement de widget stock (et schéma répété dans machines.ts, dashboard.ts). Ces requêtes visent des colonnes souvent non indexées (seller_id/user_id/owner_id).
- **Preuve** : `src/components/dashboard/widgets/StockStatusWidget.tsx:506-593 (6 essais séquentiels) ; src/utils/api/machines.ts:66-89 ; src/utils/api/dashboard.ts:27-57,63-78`
- **Reco** : Normaliser la colonne propriétaire (une seule FK canonique + backfill) pour supprimer la cascade d'essais, l'indexer, et faire une seule requête. À défaut, mettre en cache la colonne résolue par utilisateur pour éviter de re-sonder à chaque montage.

**Couverture** : COUVERT (lecture statique, fichier:ligne) : requêtes Supabase de listing/dashboard (src/utils/api/*, src/utils/enterpriseApi/*, src/services/*, hooks/queries/*), pagination (.range/.limit), index (croisement colonnes filtrées .eq/.order ↔ CREATE INDEX de sql/, supabase/migrations/, archive/), Realtime (NotificationCenter — correctement scopé par user_email et nettoyé, pas de fuite), polling setInterval, mémoïsation du gros WidgetRenderer, coût RLS (can_access_lead / can_access_transaction_case). NON VÉRIFIABLE ICI (nécessite la prod / EXPLAIN ANALYZE) : présence réelle des index en base (les scripts d'index machines sont dans archive/ ou en commentaire — à confirmer via pg_indexes), volumétrie réelle des tables (machines, machine_views, leads, messages), plans d'exécution et temps réels. A


## Phase 6 — DevOps / Déploiement / Observabilité

_Le socle CI existe et bloque réellement un merge sur tsc/lint/vitest/build (ci.yml), et les migrations correctives sont idempotentes et ordonnées. MAIS le pipeline ne teste NI les migrations, NI la RLS (Docker), NI l'E2E (creds Supabase factices) : aucun échec base/RLS ne peut bloquer une mise en prod, d'autant qu'il n'existe AUCUN job de déploiement (frontend Hostinger + `supabase db push` + `functions deploy` = 100% manuels). Trois angles morts d'exploitation majeurs : (1) pas de baseline versionnée ni de `supabase/config.toml` → une base reconstruite n'a NI schéma NI RLS (risque DR) ; (2) P_

### [P1] CI ne teste NI migrations, NI RLS, NI E2E — aucun échec base ne peut bloquer une release
- **Zone** : CI/CD — .github/workflows/ci.yml
- **Nature donnée** : SANS-OBJET
- **Fait** : Le job `quality` exécute uniquement tsc --noEmit, eslint, vitest et vite build, avec des creds Supabase FACTICES (VITE_SUPABASE_URL=https://example.supabase.co, ANON_KEY=dummy). Aucune étape n'applique les migrations `supabase/migrations/`, ne rejoue les harnais RLS pgTAP (`supabase/tests/*.sql`), ni ne lance d'E2E. Il n'existe AUCUN job de déploiement dans le repo (grep deploy/hostinger/db push/functions deploy = 0 sur .github/). Le durcissement RLS n'est prouvé que localement en Docker (cf .audit), jamais en CI. Confirme PISTE-2 du dossier .audit/FINDINGS.md:151-152.
- **Preuve** : `.github/workflows/ci.yml:32-48 (tsc/lint/test/build) ; creds factices l.41-42 et 47-48 ; aucun step supabase/rls/e2e/deploy sur l'ensemble du fichier`
- **Reco** : Ajouter en CI un job DB : `supabase start` (ou service Postgres) → appliquer TOUTES les migrations → rejouer les harnais `supabase/tests/*.sql` (prereq+countercases) → échec = merge bloqué. À terme, un smoke E2E du parcours devis→dossier. Faire de tsc/lint/test/build+RLS des « required checks » sur main/master.

### [P1] Aucune baseline versionnée ni supabase/config.toml — une base reconstruite n'a ni schéma ni RLS (risque DR)
- **Zone** : Migrations / IaC — supabase/migrations/ vs sql/
- **Nature donnée** : SANS-OBJET
- **Fait** : Le schéma et la RLS de base (~30 tables, ~298 policies) vivent dans ~50 scripts `sql/`+`SQL_A_APPLIQUER/` appliqués À LA MAIN en prod ; seuls les DELTAS correctifs (p2..p13) sont dans `supabase/migrations/`. Un `supabase db push` sur base neuve ne recrée NI tables NI RLS (le README l'admet). De plus il n'y a AUCUN `supabase/config.toml` dans le repo → `supabase link`/`db push` ne sont même pas préconfigurés ; le `db push` documenté exige un `supabase link` manuel préalable. Conséquence : DR / nouvel environnement / CI = tables SANS RLS.
- **Preuve** : `supabase/migrations/README.md:50-53 (dette baseline) ; migrations/README.md:9-13 ; docs/OPERATIONS_SUPABASE.md:68-70 ; absence de supabase/config.toml (vérifié)`
- **Reco** : Exécuter `supabase db dump --schema public` depuis la PROD réelle → committer en `00000000000000_baseline.sql` (cf REMAINING_WORK.md F-002), retirer les GRANT d'écriture résiduels sur tables argent, puis prouver `supabase db reset` reproduit tout le schéma+RLS. Committer un `supabase/config.toml`.

### [P1] Aucune capture d'erreurs distante en production (observabilité aveugle)
- **Zone** : Monitoring/Logs — src/utils/logger.ts, src/components/ErrorBoundary.tsx
- **Nature donnée** : SANS-OBJET
- **Fait** : Le logger centralisé est console-seule : en prod seul `logger.error` émet, vers `console.error` (donc visible UNIQUEMENT dans le navigateur de l'utilisateur final, jamais agrégé). Le commentaire annonce un « branchement futur vers Sentry/LogRocket » qui N'EST PAS implémenté. L'ErrorBoundary ne fait que `logger.error(...)` (console). Aucun Sentry/Datadog/LogRocket/PostHog/window.onerror dans src. 419 appels console.* dans 78 fichiers ne remontent nulle part. Résultat : un crash React ou une erreur Supabase en prod est invisible pour l'équipe, aucune alerte.
- **Preuve** : `src/utils/logger.ts:8-9 (Sentry « préparé »), 31-38 (isProd → seul error émet), 46-53 (émission console pure) ; src/components/ErrorBoundary.tsx:20`
- **Reco** : Brancher un vrai backend de capture (Sentry) dans `logger.error` + ErrorBoundary via un DSN d'env (côté client = DSN public, OK), avec release/sourcemaps. Définir au moins 1 alerte (taux d'erreurs, crash boundary). Pour les Edge Functions, centraliser les logs Supabase et poser une alerte sur les webhooks paiement.

### [P1] PITR/backups seulement documentés comme action manuelle non confirmée ; restauration jamais testée
- **Zone** : Sauvegardes/PITR — docs/OPERATIONS_SUPABASE.md
- **Nature donnée** : SANS-OBJET
- **Fait** : Le PITR et les backups sont décrits mais explicitement marqués « ⚠️ Action manuelle requise (Supabase Dashboard) — non activable depuis le code » ; la case « PITR/backups : activer » du récapitulatif §8 est NON cochée. Le pg_dump hebdomadaire hors-plateforme est « à planifier » (aucun cron/script committé). Aucune preuve qu'une restauration ait jamais été exécutée/validée — la procédure de restore ne cible que « staging » qui n'existe pas encore (§1 : « staging (à créer) »).
- **Preuve** : `docs/OPERATIONS_SUPABASE.md:29-41 (PITR manuel + pg_dump à planifier), 43-47 (restore staging), 120 (case PITR non cochée), 22-25 (staging inexistant)`
- **Reco** : Confirmer/activer le PITR (plan Pro) et l'archiver par capture ; committer un script de pg_dump planifié ; créer le projet staging et EXÉCUTER une restauration réelle (dump prod → staging) documentée avec date — un backup non testé n'est pas un backup.

### [P1] Parité repo↔prod cassée : fonctions serveur non versionnées / non déployées (paiement+séquestre HS en prod)
- **Zone** : Parité Edge Functions — supabase/functions/ vs prod
- **Nature donnée** : SANS-OBJET
- **Fait** : Trois divergences prouvées : (1) `hyper-service` TOURNE en prod mais n'existe PAS dans le repo (code serveur non auditable) — l'utilisateur l'a depuis identifié comme brouillon d'email inoffensif à supprimer ; (2) le front appelle `create-payment` (StripePaymentForm) et `create-escrow` (escrowService) qui NE sont PAS déployées (create-escrow est même absente du repo) → boutons paiement Stripe et « ouvrir séquestre » NON FONCTIONNELS en prod ; (3) `stripe-webhook`/`escrow-webhook` durcis existent au repo mais ne sont pas déployés. Un déploiement « propre » depuis le repo ne reproduit pas la prod, et inversement.
- **Preuve** : `.audit/FINDINGS.md:76-100 (F-015/F-016) ; docs/ETAT_DEPLOIEMENT_REPO_VS_PROD.md:15-27 (couche nextgen escrow/trust/market codée non déployée)`
- **Reco** : Exporter+committer (ou supprimer) `hyper-service` ; documenter la liste des fonctions censées être live ; le jour de l'armement paiement/escrow, déployer les versions durcies du repo et écrire `create-escrow`, avec test staging (idempotence webhook, réconciliation montant).

### [P2] Fichiers .env versionnés et .env dans l'historique git (sensibilité faible mais mauvaise hygiène)
- **Zone** : Secrets — .env.production, .env.test, historique git
- **Nature donnée** : SANS-OBJET
- **Fait** : .env.production et .env.test sont SUIVIS par git (git ls-files). `.env` a été committé dans le commit initial f084f280 puis retiré (ccfcd662) — il ne contenait que VITE_SUPABASE_URL/ANON_KEY/PRODUCTION_URL. L'anon key et l'URL restent donc dans l'historique. NUANCE HONNÊTE : l'anon key Supabase est PUBLIQUE par conception (le bundle dist l'inline légitimement, role:anon vérifié) → pas de fuite critique. Aucun service_role/Stripe secret trouvé dans les fichiers suivis ni l'historique (seulement des références au NOM du rôle). Risque latent : VITE_MONITOR_ADMIN_TOKEN/VITE_MONITOR_TEMP_ACCESS_CODE sont des variables VITE_ (donc inlinées au build) — laissées VIDES aujourd'hui (bien), mais si un jour remplies elles fuiteraient dans le bundle public.
- **Preuve** : `.env.production (tracké) VITE_MONITOR_ADMIN_TOKEN vide + commentaire l.13-14 ; git log f084f280 -- .env ; docs/OPERATIONS_SUPABASE.md:111-116 (rappel « aucun secret en VITE_ »)`
- **Reco** : Retirer .env.production/.env.test du suivi (les passer en .env.production.example) ; ne JAMAIS mettre un token admin dans une var VITE_ (le résoudre côté serveur). L'anon key en historique n'est pas critique mais peut être rotée par précaution. Idéalement, purger .env de l'historique (git filter-repo).

### [P2] Aucun rollback automatisé de migration — stratégie 100% forward-fix + PITR non confirmé
- **Zone** : Migrations — supabase/migrations/ (rollback)
- **Nature donnée** : SANS-OBJET
- **Fait** : Aucun fichier down/rollback/revert dans supabase/migrations/. La stratégie documentée est « forward-fix » (nouvelle migration ..._fix.sql) pour une migration fautive, et PITR pour un incident données — or le PITR n'est pas confirmé actif (cf finding backups). Un incident de migration destructive ne dispose donc d'aucun filet automatisé vérifié.
- **Preuve** : `docs/OPERATIONS_SUPABASE.md:84-90 (rollback = forward-fix + PITR) ; aucun fichier *down*/*rollback* dans supabase/migrations/ (vérifié)`
- **Reco** : Acter le forward-fix comme politique (correct pour l'idempotent), MAIS le rendre viable en confirmant le PITR et en testant une restauration ; conserver le diff pg_policies avant/après chaque migration RLS comme prévu.

### [P3] Workflow agent-quality.yml entièrement non-bloquant et mal ciblé (branche develop inexistante)
- **Zone** : CI — .github/workflows/agent-quality.yml
- **Nature donnée** : SANS-OBJET
- **Fait** : Ce second workflow lance lint/test/build en `--if-present` et pytest/validate en `|| true` → il ne peut JAMAIS faire échouer une PR (purement décoratif). Il se déclenche sur les branches main/develop alors que le repo utilise main/master (develop n'existe pas) : il ne couvre donc pas master et fait doublon partiel avec ci.yml sans rien garantir.
- **Preuve** : `.github/workflows/agent-quality.yml:5-7 (branches main/develop), 32-42 (--if-present), 49 et 53 (|| true)`
- **Reco** : Soit supprimer ce workflow (ci.yml couvre déjà le gating), soit retirer les `|| true`/`--if-present` et aligner les branches sur master pour qu'il bloque réellement.

### [P3] Actions GitHub épinglées sur tag majeur, pas sur SHA (chaîne d'appro)
- **Zone** : CI — .github/workflows/*.yml
- **Nature donnée** : SANS-OBJET
- **Fait** : actions/checkout@v4 et actions/setup-node@v4 sont épinglées sur un tag mobile (v4), pas sur un commit SHA complet : un tag repointé (compromission upstream) exécuterait du code arbitraire dans le pipeline. Déjà noté F-009.
- **Preuve** : `.github/workflows/ci.yml:21 et 24 ; .github/workflows/agent-quality.yml:15 et 25 ; .audit/FINDINGS.md:102-104`
- **Reco** : Épingler chaque action sur le SHA complet du tag v4 (checkout, setup-node) dans les deux workflows.

### [info] Ce qui est solide (à conserver) — gating build + migrations idempotentes/ordonnées
- **Zone** : CI + Migrations
- **Nature donnée** : SANS-OBJET
- **Fait** : Points réellement bons, honnêtement vérifiés : (1) ci.yml FAIT bien échouer sur tsc --noEmit, eslint, vitest (381 tests) et vite build (qui inclut `tsc && vite build`) — un TS cassé bloque le merge ; (2) les migrations delta p2..p13 sont idempotentes (marqueurs IF EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS vérifiés fichier par fichier) et ré-applicables sans risque ; (3) l'ordre d'application est documenté (préfixes horodatés + supabase/migrations/README.md) ; (4) le bundle prod n'expose aucun secret au-delà de l'anon key (publique), le token admin est laissé vide ; (5) vite.config.ts fait déjà du manualChunks (react-vendor/supabase/charts/maps/stripe).
- **Preuve** : `package.json:7 (build=tsc&&vite build) ; .github/workflows/ci.yml:32-45 ; supabase/migrations/README.md:27-29 ; vite.config.ts:42-50`
- **Reco** : Conserver. Prochaine étape pour transformer ce socle en vrai garde-fou de déploiement : y greffer l'application des migrations + les tests RLS (finding P1 #1).

**Couverture** : COUVERT (avec fichier:ligne, faits vérifiés en direct) : (1) contenu et portée du pipeline CI (ci.yml, agent-quality.yml) et absence totale de job de déploiement ; (2) idempotence des migrations (marqueurs vérifiés), ordre documenté, absence de baseline versionnée et de supabase/config.toml, absence de fichiers rollback ; (3) documentation backups/PITR/restore (OPERATIONS_SUPABASE.md) ; (4) secrets : fichiers .env suivis, .env dans l'historique git, scan du bundle dist (anon key uniquement), absence de service_role/Stripe secret dans les fichiers suivis ; (5) observabilité (logger.ts console-seule, ErrorBoundary, absence de Sentry) ; (6) parité Edge Functions repo↔prod via .audit/FINDINGS.md + ETAT_DEPLOIEMENT_REPO_VS_PROD.md. NON VÉRIFIABLE ICI (pas d'accès prod/Dashboard/CI runtime) : ét


## RGPD / cycle de vie des données + Résilience aux pannes externes

_Audit sur code RÉEL (fichier:ligne). Côté RGPD : la suppression de compte, l'export de données et la révocation d'un membre sont soit du code mort, soit non câblés, soit purement locaux (aucun effet serveur) — le droit à l'effacement, à la portabilité et la coupure d'accès d'un salarié qui part ne sont PAS réalisables dans l'app. Des documents potentiellement confidentiels sont stockés derrière des URL publiques. Aucun consentement capturé à l'inscription. Des services de messagerie SIMULÉS loggent des PII (emails/contenu) en clair dans la console. Côté résilience : le socle paiement (Stripe w_

### [P1] Suppression de compte non fonctionnelle : code mort + API admin appelée avec la clé anon
- **Zone** : RGPD - droit à l'effacement (src/utils/api/profile.ts, src/utils/proApi/settings.ts, src/pages/ConfigurationPro.tsx)
- **Nature donnée** : SANS-OBJET
- **Fait** : Deux fonctions deleteUserAccount() existent. Les deux appellent supabase.auth.admin.deleteUser(user.id) (profile.ts:97 ; settings.ts:174) via le client construit UNIQUEMENT avec VITE_SUPABASE_ANON_KEY (supabaseClient.ts:16). L'API admin exige la clé service_role : l'appel échoue en 403 'User not allowed' à l'exécution. De plus AUCUNE des deux fonctions n'est appelée dans l'app (grep : seulement les définitions). Le bouton 'Supprimer le compte' (ConfigurationPro.tsx:523-525) n'a aucun onClick. Il n'existe donc aucun parcours de suppression de compte opérationnel.
- **Preuve** : `src/utils/api/profile.ts:97 ; src/utils/proApi/settings.ts:174 ; src/utils/supabaseClient.ts:16 ; src/pages/ConfigurationPro.tsx:523`
- **Reco** : Créer une Edge Function 'delete-account' (service_role, JWT vérifié) qui supprime auth.user + toutes les données liées, et la câbler au bouton avec confirmation forte. Supprimer les deux deleteUserAccount() client (trompeuses et inopérantes).

### [P1] Suppression : données orphelines garanties (sous-ensemble de tables, pas de transaction, erreurs avalées, storage non purgé)
- **Zone** : RGPD - effacement en cascade (src/utils/api/profile.ts, src/utils/proApi/settings.ts)
- **Nature donnée** : REELLE
- **Fait** : profile.ts:90-94 ne supprime que user_profiles, user_preferences, notifications, premium_services, service_history. settings.ts:151-171 ne couvre que pro_clients, client_equipment, client_orders, maintenance_interventions, technical_documents, client_notifications, client_users, user_settings. Aucune ne touche machines/annonces (sellerid), documents (DocumentsEspace, user_id), transaction_participants/messages, leads/pipeline, organization_members & scopes, ni les objets Storage (profile-pictures, documents, machine-image). Les .delete() ne sont pas transactionnels ; settings.ts:168-169 avale les erreurs (console.error puis continue) → suppression partielle et PII résiduelle.
- **Preuve** : `src/utils/api/profile.ts:90 ; src/utils/proApi/settings.ts:151 ; src/utils/proApi/settings.ts:168`
- **Reco** : Effacement serveur atomique (RPC/Edge en transaction, ou FK ON DELETE CASCADE) couvrant TOUTES les tables liées à l'utilisateur + suppression des objets Storage. Journaliser un reçu de suppression.

### [P1] Révocation d'un membre : purement locale, aucun accès coupé côté serveur
- **Zone** : RGPD - retrait d'un salarié / suspension (src/pages/MultiUserManagement.tsx, src/utils/api/organization.ts)
- **Nature donnée** : SIMULEE
- **Fait** : handleDeleteMember (MultiUserManagement.tsx:484-488) ne fait que setTeamMembers(filter) : l'utilisateur disparaît de l'UI locale mais reste membre en base ; il réapparaît au rechargement (getOrgMembers) et CONSERVE l'accès au pipeline/AO partagé. handleUpdateMember (476-482) ne persiste ni le rôle société ni le statut (seuls le rôle AO via upsertTenderRole et le scope via setMemberScope sont écrits). Aucune fonction serveur de changement de rôle ou de retrait n'existe : organization.ts n'expose que get_org_members (lecture) et set_member_scope. 'Statut : inactif' n'a aucun effet serveur (pas de suspension).
- **Preuve** : `src/pages/MultiUserManagement.tsx:484 ; src/pages/MultiUserManagement.tsx:476 ; src/utils/api/organization.ts:33`
- **Reco** : RPC serveur remove_org_member / set_org_role (contrôle admin via RLS) qui retire réellement la ligne organization_members et révoque les accès ; câbler la corbeille et l'édition de rôle/statut dessus. Sinon retirer ces boutons trompeurs.

### [P2] Export des données utilisateur : fonction morte et bouton non câblé (portabilité RGPD indisponible)
- **Zone** : RGPD - portabilité (src/utils/proApi/settings.ts, src/pages/ConfigurationPro.tsx)
- **Nature donnée** : REELLE
- **Fait** : exportUserData() (settings.ts:89-143) construit un blob JSON téléchargeable mais n'est appelée nulle part (grep). Le bouton 'Exporter toutes les données' (ConfigurationPro.tsx:494) et les 3 exports partiels (496-506) n'ont aucun onClick. En l'état l'export RGPD n'est pas accessible. De plus l'export omet machines, documents, messages, transactions → incomplet même une fois câblé.
- **Preuve** : `src/utils/proApi/settings.ts:89 ; src/pages/ConfigurationPro.tsx:494`
- **Reco** : Câbler l'export au bouton, compléter la liste des tables, et fournir un export complet (profil + toutes entités + documents). Idéalement générer côté serveur pour garantir l'exhaustivité.

### [P2] Documents (potentiellement confidentiels) exposés via URL publique prédictible
- **Zone** : RGPD/Confidentialité - documents via URL publique (src/pages/DocumentsEspace.tsx, src/utils/api/profile.ts)
- **Nature donnée** : REELLE
- **Fait** : DocumentsEspace.tsx:120-141 uploade les documents de l'utilisateur dans le bucket 'documents' puis stocke getPublicUrl comme file_url. Le chemin est prédictible (documents/${user.id}/${Date.now()}_${nom}). Si le bucket est public (getPublicUrl n'a de sens que pour un bucket public), tout porteur de l'URL accède au document sans authentification. Même schéma pour les photos de profil (profile.ts:51-54). À l'inverse, proApi/documents.ts:36-47 stocke un file_path (chemin, pas d'URL publique) → à privilégier.
- **Preuve** : `src/pages/DocumentsEspace.tsx:132 ; src/utils/api/profile.ts:51`
- **Reco** : Passer le bucket 'documents' en privé et servir via createSignedUrl (expiration courte) + RLS Storage par user_id. Vérifier la config réelle du bucket côté Supabase.

### [P2] Aucun consentement CGU/politique de confidentialité capturé à l'inscription
- **Zone** : RGPD - consentement / retrait (src/pages/Register.tsx, src/utils/api/auth.ts)
- **Nature donnée** : SANS-OBJET
- **Fait** : Register.tsx ne contient aucune case à cocher d'acceptation CGU/confidentialité (grep 'consent|CGU|accepte|conditions' → aucun résultat pertinent). registerUser (auth.ts:7-24) transmet les metadata à signUp sans enregistrer de consentement horodaté ni version des CGU. Aucun mécanisme de retrait de consentement.
- **Preuve** : `src/pages/Register.tsx:251 ; src/utils/api/auth.ts:10`
- **Reco** : Ajouter une case de consentement obligatoire (CGU + confidentialité) à l'inscription, stocker consentement + version + horodatage, et prévoir un écran de retrait/gestion du consentement.

### [P2] PII (email destinataire + contenu) loggées en clair dans un service d'emailing SIMULÉ
- **Zone** : RGPD - PII dans les logs (src/services/communicationService.ts)
- **Nature donnée** : SIMULEE
- **Fait** : communicationService.sendEmail (communicationService.ts:29-33) fait console.log('📧 Envoi email', { to: emailData.to, subject, body… }) : email destinataire + sujet + extrait du corps loggés inconditionnellement (pas de garde DEV, pas via logger centralisé). Le service est explicitement une SIMULATION ('à remplacer par une vraie API', ligne 28) : aucun email n'est réellement envoyé mais un succès est renvoyé (faux 'message envoyé').
- **Preuve** : `src/services/communicationService.ts:29 ; src/services/communicationService.ts:28`
- **Reco** : Supprimer les console.log de PII ou passer par logger (silencieux en prod). Ne pas retourner de succès simulé : router l'envoi réel vers une Edge Function (Resend) ou afficher un état 'non disponible' honnête.

### [P2] Second service de messagerie SIMULÉ logguant destinataire + contenu (utilisé en prod)
- **Zone** : RGPD - PII dans les logs (src/utils/communication.ts)
- **Nature donnée** : SIMULEE
- **Fait** : useCommunicationService.sendMessage (communication.ts:8-27) fait console.log(`Sending ${type} to ${recipient}`, content) puis, selon le type, re-logge 'Email/SMS/Team sent to ${recipient}: ${content}' (lignes 16/19/22/25) — destinataire et contenu en clair, inconditionnel. C'est une simulation (setTimeout, aucun envoi réel) et il est réellement importé par ChatWidget.tsx et utils/api/messages.ts.
- **Preuve** : `src/utils/communication.ts:8 ; src/utils/communication.ts:19`
- **Reco** : Retirer le logging de PII ; remplacer la simulation par un vrai canal serveur ou un état explicite 'envoi indisponible'. Éviter d'exposer des faux 'envoyé' à l'UI.

### [P2] Appels IA client→monitor sans timeout (spinner potentiellement infini si le service pend)
- **Zone** : Résilience - dépendance monitor-service/IA (src/services/aiWidgetService.ts)
- **Nature donnée** : SANS-OBJET
- **Fait** : callAiEndpoint (aiWidgetService.ts:95-100) et callAiJsonEndpoint (128-133) font fetch() vers VITE_MONITOR_API_URL SANS AbortController/timeout, contrairement à monitorApi.apiFetch (monitorApi.ts:42-50, timeout 20s). Si le monitor accepte la connexion mais ne répond pas, la promesse reste suspendue. Les erreurs sont bien avalées (return null/[]), donc pas de crash, mais aucun garde-fou de durée.
- **Preuve** : `src/services/aiWidgetService.ts:95 ; src/services/monitorApi.ts:42`
- **Reco** : Ajouter un AbortController avec timeout (ex. 15-20s) à ces fetch, comme dans monitorApi, pour libérer les widgets et afficher l'état vide honnête.

### [P3] Edge ai-proxy : appels LLM externes sans timeout ni retry/backoff
- **Zone** : Résilience - dépendance LLM (supabase/functions/ai-proxy/index.ts)
- **Nature donnée** : SANS-OBJET
- **Fait** : callProvider fait fetch() vers api.anthropic.com (ligne 81) et vers l'endpoint OpenAI-compatible (ligne 98) sans timeout ni tentative de reprise. Si le fournisseur pend, la fonction edge reste bloquée jusqu'à la limite plateforme. Les erreurs HTTP sont converties en throw → 502 côté client (correct), mais pas de backoff sur 429/5xx transitoires.
- **Preuve** : `supabase/functions/ai-proxy/index.ts:81 ; supabase/functions/ai-proxy/index.ts:98`
- **Reco** : Encadrer les fetch LLM d'un AbortSignal.timeout (ex. 30s) et d'un retry léger avec backoff sur 429/5xx ; renvoyer un message utilisateur clair en cas d'échec.

### [P3] Absence générale de retries/backoff sur les écritures et invocations d'Edge Functions
- **Zone** : Résilience - transitoires réseau (monitorApi.ts, StripePaymentForm.tsx, RPC diverses)
- **Nature donnée** : SANS-OBJET
- **Fait** : Les fetch monitor (monitorApi.ts) et l'invocation create-payment (StripePaymentForm.tsx:47-58) sont mono-coup : sur un 5xx/blip réseau transitoire, l'utilisateur voit une erreur générique (createPaymentIntent catch → onError 'Erreur lors de l'initialisation du paiement') sans reprise automatique ni bouton 'réessayer' dédié. React Query peut retenter certaines lectures, mais pas ces écritures/invokes.
- **Preuve** : `src/components/StripePaymentForm.tsx:47 ; src/services/monitorApi.ts:45`
- **Reco** : Ajouter un retry idempotent avec backoff sur les invocations sensibles (création de PaymentIntent déjà idempotente via idempotencyKey) et exposer une action 'réessayer' à l'utilisateur.

### [info] POSITIF - Chaîne de paiement Stripe robuste (idempotence + réconciliation de montant côté serveur)
- **Zone** : Résilience/Sécurité paiement (supabase/functions/stripe-webhook/index.ts, create-payment/index.ts)
- **Nature donnée** : REELLE
- **Fait** : stripe-webhook vérifie la signature (constructEventAsync, ligne 83), garantit l'idempotence via insert claim dans processed_stripe_events avec gestion 23505 (92-103) et release du claim en cas d'échec pour permettre le retry Stripe (137), et réconcilie montant/devise vs plan (amountMatchesPlan, 32-37,113,125). L'activation d'abonnement est exclusivement serveur (service_role), le front ne fait que demander un refresh (StripePaymentForm.tsx:83-89). create-payment applique rate-limit, JWT, grille de prix serveur et idempotencyKey Stripe (create-payment/index.ts:113).
- **Preuve** : `supabase/functions/stripe-webhook/index.ts:92 ; supabase/functions/create-payment/index.ts:113`
- **Reco** : Aucune action requise ; conserver ce patron comme référence pour les autres flux d'écriture sensibles.

### [info] POSITIF - Dégradation propre du monitor-service (timeouts + anti-façade, pas de données inventées)
- **Zone** : Résilience - panne externe visible utilisateur (src/pages/GlobalMonitor.tsx, src/services/monitorApi.ts, src/utils/supabaseCall.ts)
- **Nature donnée** : REELLE
- **Fait** : monitorApi.apiFetch impose des timeouts explicites via AbortController (20s par défaut, overrides par appel jusqu'à 300s pour les imports, monitorApi.ts:42-50). GlobalMonitor gère l'échec (loadProjects catch, GlobalMonitor.tsx:106-114) : conserve les données partielles, expose liveError, n'invente aucun projet, et re-tente via polling 45s. Le wrapper supabaseCall (supabaseCall.ts:52-86) homogénéise erreur + fallback (widget vide plutôt que crash).
- **Preuve** : `src/pages/GlobalMonitor.tsx:106 ; src/services/monitorApi.ts:42 ; src/utils/supabaseCall.ts:52`
- **Reco** : Aucune action requise ; étendre le timeout de monitorApi à aiWidgetService (cf. finding P2 dédié).

**Couverture** : COUVERT (code réel, fichier:ligne) : (1) suppression de compte : 2 fonctions deleteUserAccount analysées, toutes deux mortes + API admin inopérante côté client ; (2) export de données : fonction morte + bouton non câblé ; (3) PII dans les logs : 2 services d'emailing/messagerie simulés loggant emails+contenu, + logs auth ; documents confidentiels via getPublicUrl ; (4) révocation de membre : confirmée purement locale (aucune RPC de retrait/rôle) ; (5) résilience : timeouts/idempotence/retry examinés sur monitorApi, aiWidgetService, ai-proxy, create-payment, stripe-webhook, send-email ; (6) UX de panne : GlobalMonitor + StripePaymentForm.

NON VÉRIFIABLE depuis le code seul (nécessite accès Supabase) : le caractère public/privé RÉEL des buckets Storage ('documents', 'profile-pictures') — le


## Protection contre l'abus + Observabilité des invariants métier (analyse statique, fichier:ligne)

_Le socle serveur est déjà bien durci sur les points transactionnels critiques : stripe-webhook (signature + idempotence processed_stripe_events + réconciliation montant↔plan), escrow-webhook (HMAC + machine d'état + verrou optimiste TOCTOU), recompute-trust-score (ADMIN_TOKEN constant-time), et une longue série de migrations RLS (p2→p13) qui verrouillent inspection_reports, payment_records, transaction_cases, audit_logs. MAIS il subsiste des trous d'ABUS réels : (1) le rate-limiting des edge functions est en mémoire par-instance (contournable), et surtout (2) les tables contact_messages et quo_

### [P1] contact_messages & quote_requests : INSERT anonyme illimité en direct — le rate-limit de l'edge function est contourné
- **Zone** : Abus / spam — RLS PostgREST (contact_messages, quote_requests, leads)
- **Nature donnée** : REELLE
- **Fait** : contact_messages et quote_requests exposent une policy INSERT 'to anon ... with check (true)' avec grant insert to anon, SANS aucune limite de débit côté serveur. Le front insère la ligne DIRECTEMENT via supabase-js (contact.ts:50, quoteRequests.ts:279), pas via l'edge function. La clé anon étant publique (embarquée dans le bundle), n'importe qui peut scripter des milliers d'INSERT/min via /rest/v1/contact_messages et /quote_requests. Le rate-limit de send-contact-email (8/10min) ne protège donc PAS la table : il ne s'applique qu'à l'envoi d'email, pas à l'écriture du message. Seules des contraintes de longueur (CHECK) limitent le payload, jamais le volume. Idem 'leads' (apiService.ts:308).
- **Preuve** : `sql/contact_messages.sql:65-73 (policy anon+grant insert) ; sql/quote_requests.sql:80-84,136 ; src/utils/api/contact.ts:50 ; src/utils/api/quoteRequests.ts:279 ; src/services/apiService.ts:308-309`
- **Reco** : Router ces créations UNIQUEMENT via une edge function (comme create-payment) qui applique un rate-limit persistant, OU ajouter un throttle DB : trigger BEFORE INSERT comptant les lignes récentes par ip_address/email/IP sur une fenêtre glissante (ex. rejet si > N/heure), + un index sur (ip_address, created_at). Envisager un token hCaptcha vérifié côté serveur avant l'INSERT public.

### [P1] ai-proxy : aucun quota — un membre peut brûler la clé LLM (crédits) de sa société
- **Zone** : Endpoint coûteux non protégé — supabase/functions/ai-proxy
- **Nature donnée** : SANS-OBJET
- **Fait** : ai-proxy lit la clé IA de l'organisation (organization_ai_credentials) et appelle OpenAI/Anthropic/xAI en son nom. Le handler exige un JWT valide et une appartenance org, mais n'a AUCUN rate-limit ni compteur d'usage : un membre (ou un JWT volé) peut boucler action:'chat' à volonté et épuiser le budget/crédits de la clé de la société (abus financier + DoS du budget IA). De plus maxTokens est pris tel quel dans le corps client (Number(body.maxTokens) || 1024) → amplification du coût par requête. Aucune borne sur la taille cumulée des messages entrants.
- **Preuve** : `supabase/functions/ai-proxy/index.ts:113-164 (aucun isRateLimited), :159 (maxTokens depuis body), :136-143 (lecture clé org)`
- **Reco** : Ajouter un quota par organisation (compteur persistant en table : requêtes/jour + tokens/jour) vérifié avant l'appel provider, plafonner maxTokens côté serveur (ex. min(body.maxTokens, 2048)), borner la longueur totale des messages, et journaliser l'usage (déjà envisagé ai_predictions) pour facturation/alerte.

### [P1] Contournement d'abonnement : le front écrit subscription_status:'active' côté client (promo-code) ; le verrou pro_clients n'est pas dans les migrations trackées
- **Zone** : Contournement des limites d'abonnement — src/pages (Dashboard.jsx, Register.tsx) + RLS pro_clients
- **Nature donnée** : REELLE
- **Fait** : Dashboard.jsx (chemin promo-code) écrit DIRECTEMENT dans pro_clients {subscription_type, subscription_status:'active', payment_method:'promo_code'} sans paiement. Le code promo est VITE_PROMO_CODE, injecté au build donc lisible dans le bundle JS → découvrable. Register.tsx:263-284 (createSubscription) fait la même chose (actuellement sans call-site = code mort, mais toujours présent). L'activation autoritaire serveur EXISTE (stripe-webhook) et une SQL révoque les écritures clientes de pro_clients — MAIS ce verrou vit uniquement dans sql/2026-06_pro_clients_rls_hardening.sql, ABSENT de supabase/migrations/ (les migrations trackées ne verrouillent jamais l'écriture pro_clients ; teamD_shared_subscription ne fait que LIRE via SECURITY DEFINER). Si ce hardening manuel n'est pas appliqué dans un environnement, ces chemins front accordent un abonnement pro/premium/enterprise gratuit.
- **Preuve** : `src/pages/Dashboard.jsx:18 (PROMO_CODE=VITE_PROMO_CODE),664-707 (write pro_clients actif='active', promo) ; src/pages/Register.tsx:263-284 ; sql/2026-06_pro_clients_rls_hardening.sql:37-38 (REVOKE) ; absence dans supabase/migrations/ (seul 20260708150000_teamD_shared_subscription.sql, lecture seule)`
- **Reco** : 1) Intégrer le REVOKE INSERT/UPDATE/DELETE pro_clients dans une migration trackée (supabase/migrations) pour garantir son application en prod. 2) Supprimer les écritures clientes pro_clients (promo + createSubscription mort). 3) Faire valider les codes promo côté serveur (edge function + table promo_codes à usage limité) qui active via service_role, comme stripe-webhook.

### [P2] Rate-limiting des edge functions : en mémoire par-instance, non partagé, clé IP spoofable
- **Zone** : Abus / brute-force — send-contact-email, create-payment
- **Nature donnée** : SANS-OBJET
- **Fait** : Les seuls rate-limits présents (send-contact-email 8/10min ; create-payment 10/10min) utilisent une Map en mémoire du process. Supabase Edge exécute de nombreuses instances isolées et les recycle (cold start) : le compteur n'est ni partagé ni persistant → un attaquant réparti dans le temps/les instances dépasse largement la limite. La clé est extractClientIp = premier IP de x-forwarded-for (en-tête client, falsifiable) → rotation triviale de la clé de comptage. tenders-ai, ai-proxy et send-email n'ont AUCUN rate-limit.
- **Preuve** : `supabase/functions/send-contact-email/index.ts:5,67-86 ; supabase/functions/create-payment/index.ts:11,46-65 ; supabase/functions/send-email/index.ts (aucun) ; supabase/functions/tenders-ai/index.ts (aucun)`
- **Reco** : Remplacer par un limiteur partagé et persistant (table Postgres avec fenêtre glissante, ou Upstash/Redis), clé = user.id (JWT) plutôt que l'IP quand un JWT est présent ; conserver l'IP comme clé secondaire. Étendre le limiteur à ai-proxy, tenders-ai, send-email.

### [P2] tenders-ai : endpoint Claude Opus coûteux, authentification optionnelle et sans quota
- **Zone** : Endpoint coûteux non protégé — supabase/functions/tenders-ai
- **Nature donnée** : SANS-OBJET
- **Fait** : tenders-ai appelle Claude Opus (défaut claude-opus-4-8) avec max_tokens jusqu'à 16000 et thinking adaptatif (coût élevé/appel). L'authentification n'est exigée QUE si TENDERS_AI_REQUIRE_AUTH='true' (défaut = désactivée). Aucun rate-limit. Le CORS ne protège pas d'un client non-navigateur (curl) : l'en-tête Origin n'est pas une frontière d'authz. Déployé sans REQUIRE_AUTH=true, c'est un générateur IA coûteux ouvert.
- **Preuve** : `supabase/functions/tenders-ai/index.ts:26-27 (MODEL opus, REQUIRE_AUTH défaut off),78-86 (max_tokens 16000, thinking),416-449 (serve, garde auth conditionnelle, pas de quota)`
- **Reco** : Forcer REQUIRE_AUTH=true en prod (ou rendre l'auth non-optionnelle dans le code), ajouter un quota par utilisateur/org, plafonner max_tokens et la taille des PDF envoyés (déjà borné côté UI DceAnalysisTab mais pas côté fonction).

### [P2] Aucun captcha / anti-bot sur inscription, connexion et réinitialisation de mot de passe
- **Zone** : Brute-force login / création massive de comptes / énumération — src/utils/api/auth.ts, ForgotPassword
- **Nature donnée** : SANS-OBJET
- **Fait** : signUp, signInWithPassword et resetPasswordForEmail sont appelés sans jeton captcha (options.captchaToken absent) ni throttle applicatif. La seule protection est le rate-limit par défaut de Supabase Auth (global projet, permissif). Rien n'empêche la création massive de comptes, le bourrage d'identifiants, ni l'énumération d'emails via les messages d'erreur/reset. Aucune intégration hCaptcha/Turnstile trouvée dans le code.
- **Preuve** : `src/utils/api/auth.ts:10-16 (signUp sans captcha),27-30 (signInWithPassword) ; src/pages/ForgotPassword.tsx (resetPasswordForEmail) ; aucun 'captcha' hors ces fichiers`
- **Reco** : Activer la protection captcha de Supabase Auth (hCaptcha/Turnstile) et passer options.captchaToken depuis le front sur register/login/reset ; durcir les limites Auth du projet ; uniformiser les messages d'erreur pour éviter l'énumération d'emails.

### [P2] Uploads sans validation de taille ni de type (Storage)
- **Zone** : Upload Storage non borné — proApi/documents.ts + flux images
- **Nature donnée** : REELLE
- **Fait** : uploadTechnicalDocument envoie n'importe quel File vers le bucket 'technical-documents' sans contrôle de taille ni de MIME (ni client ni serveur ; file.size/file.type sont seulement ENREGISTRÉS, pas validés). Les flux images n'utilisent que l'attribut HTML accept='image/*' (contournable) sans plafond de taille ni de nombre. Aucun file_size_limit / allowed_mime_types de bucket n'apparaît dans le SQL du dépôt (buckets configurés hors-repo → non vérifiable ici). Seul DceAnalysisTab (tenders) impose MAX_PDF_BYTES. Un compte peut donc téléverser des fichiers volumineux/arbitraires en masse (coût stockage/bande passante, stockage de contenu non-image).
- **Preuve** : `src/utils/proApi/documents.ts:34-52 (upload sans garde) ; src/pages/SellEquipment.tsx:334,381,563,635 (accept image/* seul) ; src/pages/PublicationRapide.tsx:1525 ; src/pages/pro/widgets/EquipmentTab.tsx:1416,1734 ; contre-exemple correct src/tenders/pages/tender/DceAnalysisTab.tsx:91-95`
- **Reco** : Définir file_size_limit et allowed_mime_types sur chaque bucket Storage (config à committer/versionner), valider taille+type côté client avant upload, et re-vérifier le MIME réel côté serveur (edge function d'upload signé) pour les documents sensibles.

### [P2] Détection d'anomalies métier : réelle mais CLIENT-SIDE et partielle — pas de moniteur central des invariants
- **Zone** : Observabilité invariants — src/utils/risk/* + FraudWidget
- **Nature donnée** : CALCULEE
- **Fait** : Un vrai Risk Engine explicable existe : computeTransactionRisk détecte, sur données Supabase RÉELLES (transaction_events + payment_records + inspections), 4 signaux : paiement en litige, fonds séquestrés sans inspection validée, montant séquestré non confirmé (0), partenaire désengagé. MAIS loadCaseRisks s'exécute DANS LE NAVIGATEUR de l'utilisateur connecté et seulement sur SES dossiers accessibles (RLS) — aucun scan serveur/cron couvrant TOUTE la plateforme, aucune alerte admin, aucune persistance de l'anomalie. Il ne détecte PAS 'escrow released sans rapport d'inspection', ni 'paiement capturé sans mise à jour du dossier', ni 'abonnement actif sans paiement'. fraudSignals.ts couvre la fraude d'annonce (prix/trust), pas les invariants transactionnels. escrow-webhook empêche les transitions illégales (funded→released direct interdit) mais rien ne vérifie qu'un inspection_report certifié existe réellement avant 'released'.
- **Preuve** : `src/utils/risk/transactionRisk.ts:41-90 ; src/utils/risk/caseRiskService.ts:18-24 (scope = dossiers de l'utilisateur, client-side) ; src/nextgen/widgets/FraudWidget.tsx:16-27 ; src/nextgen/ai/fraudSignals.ts:23-66 ; supabase/functions/escrow-webhook/index.ts:20-31 (transitions)`
- **Reco** : Ajouter un moniteur d'invariants CÔTÉ SERVEUR (cron edge function service_role) qui balaie toutes les tables et journalise/alerte. 8 invariants à surveiller : (1) escrow_transactions.status='released' sans inspection_report certifié (overall_grade != 'F') rattaché au dossier ; (2) 'released'/'refunded' sans chaîne de transitions valide dans escrow_events (released précédé de delivered/disputed) ; (3) payment_records 'held'/'funded' sans inspection 'inspection_passed' (aujourd'hui vu seulement côté client) ; (4) escrow funded/released avec amount NULL ou <= 0 ; (5) pro_clients.subscription_status='active' sans stripe_payment_intent_id ni ligne processed_stripe_events (abonnement hors paiement) ; (6) transaction_case avancé (paid/closed) sans payment_record correspondant, ou 'released' sans mise à jour de statut du dossier ; (7) inspection_reports.certified=true écrit hors inspecteur certifié/service_role ; (8) trust_profiles.trust_score/tier élevé sans vérification 'identity' approuvée ni passage par recompute-trust-score. Ajouter aussi des seuils de vélocité (N devis/contacts/comptes par IP·heure) et un pic du ratio 'disputed'.

**Couverture** : COUVERT (lecture réelle avec fichier:ligne) : les 9 edge functions (ai-proxy, create-payment, escrow-webhook, stripe-webhook, recompute-trust-score, send-email, send-contact-email, tenders-ai, exchange-rates non détaillée) ; les RLS/grants de contact_messages, quote_requests, pro_clients, transaction_cases, inspection_reports, audit_logs (migrations p2→p13 + sql/) ; chemins d'écriture front (contact, quoteRequests, leads, pro_clients promo/register) ; flux d'upload ; le Risk Engine (transactionRisk, caseRiskService, fraudSignals, FraudWidget). POINTS FORTS confirmés : stripe-webhook (signature+idempotence+réconciliation montant/plan), escrow-webhook (HMAC+machine d'état+verrou optimiste anti-TOCTOU), recompute-trust-score (ADMIN_TOKEN constant-time), verrouillages RLS p3/p8-p13. NON VÉRIFI

