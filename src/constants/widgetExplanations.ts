import type { WidgetExplanation } from '../components/common/InfoTooltip';

/**
 * Explications DÉTAILLÉES d'un widget, affichées au CLIC sur le « i » (cf.
 * InfoTooltip). Rédigées en langage clair pour l'utilisateur, à partir du vrai
 * code de chaque widget.
 *
 * Clé = `id` du widget (précis) ou, à défaut, son `type`. Un widget sans entrée
 * ici affiche simplement, au clic, sa phrase courte (aucune régression).
 */
export const WIDGET_EXPLANATIONS: Record<string, WidgetExplanation> = {
  'sales-performance-score': {
    summary: "Ce widget vous donne une note globale sur 100 de votre performance commerciale, avec votre classement face aux autres vendeurs et des conseils concrets pour vous améliorer. En un coup d'œil, vous voyez où vous en êtes par rapport à vos objectifs et par quoi commencer.",
    howItWorks: [
      "La grande note au centre (sur 100) est calculée automatiquement à partir de vos vraies données : vos annonces, les vues et messages qu'elles reçoivent, vos offres et vos prospects du Kanban. Ces chiffres viennent du serveur MineGrid, rien n'est inventé.",
      "La couleur indique la santé : vert (80 et plus) c'est bon, orange (60 à 79) c'est moyen, rouge (moins de 60) c'est à améliorer. Les trois cartes du haut suivent la même logique : « Visibilité & contacts » (sur 50), « Pipeline commercial » (sur 30) et « Couverture stock » (sur 20) sont trois sous-notes qui, ensemble, forment la grande note sur 100.",
      "En haut à droite, un badge affiche votre rang face aux autres vendeurs (ou « Votre compte » si vous êtes seul). Juste sous la note, la ligne « Objectif mensuel » vous dit combien de points il vous reste à gagner.",
      "Les quatre encadrés « Ventes », « Croissance », « Pipeline » et « Réactivité » détaillent chaque aspect, avec une petite flèche de tendance : ↗ ça monte, → stable, ↘ ça baisse.",
      "La section « Recommandations — actions pipeline & catalogue » liste des conseils. Un petit badge précise leur origine : « Source : serveur » (analyse à distance) ou « Source : analyse locale » (calculée sur votre appareil).",
    ],
    whatToDo: [
      "Pour voir les conseils, cliquez sur la petite flèche (chevron) à droite du titre « Recommandations — actions pipeline & catalogue » : la liste se déroule. Chaque conseil a une pastille de couleur (rouge = urgent, orange = moyen, bleu = secondaire) — commencez par les rouges, puis appliquez l'action vous-même.",
      "Regardez la grande note et la ligne « Objectif mensuel » juste en dessous : le widget vous indique les points qu'il vous reste. Concentrez ensuite vos efforts sur la carte affichée en rouge ou en orange parmi « Visibilité & contacts », « Pipeline commercial » et « Couverture stock ».",
      "Pour faire monter la note, mettez à jour vos prospects dans le Kanban : le widget se recharge tout seul quand le pipeline change ou quand vous revenez sur l'onglet, et les encadrés « Pipeline » et « Réactivité » suivent.",
      "Si le message « Impossible de charger le score commercial » s'affiche, vérifiez votre connexion puis cliquez sur « Réessayer ».",
    ],
  },

  'sales-evolution': {
    summary: "Ce widget montre l'évolution de vos ventes sur les 6 derniers mois, comparées à vos objectifs et à l'année précédente. Il repère tout seul les points d'alerte et vous donne accès, en un clic, au détail mois par mois, à une prévision, à une comparaison avec le secteur et à un export.",
    howItWorks: [
      "Les chiffres sont vos VRAIES données du site — ventes réellement conclues et offres envoyées — et non des exemples. Les montants s'affichent dans la devise détectée automatiquement, rappelée en haut par « 6 derniers mois · Affichage : … ».",
      "Le graphique superpose trois courbes : vos ventes en orange, votre objectif en gris pointillé et l'année précédente en gris clair. Survolez un point avec la souris pour lire les montants exacts. Si aucune vente n'est conclue, un encadré « Aucune vente conclue sur la période » se pose par-dessus le graphique.",
      "Juste en dessous, trois cartes résument le dernier mois : « Ventes du mois » (le montant conclu), « Objectif atteint » (le pourcentage, écrit en vert quand vous approchez du but, en orange puis rouge quand il reste loin) et « vs année précédente ».",
      "Plus bas, des « Notifications » se créent toutes seules selon vos chiffres (objectif loin d'être atteint, offres envoyées sans vente conclue, forte hausse) et proposent chacune un lien qui renvoie vers vos prospects.",
      "Selon les cas, des « Suggestions IA » et un « Benchmark secteur » peuvent apparaître, avec un petit bandeau orange qui indique d'où vient l'info : « serveur » du site ou « analyse locale » calculée sur vos annonces.",
    ],
    whatToDo: [
      "Cliquez le bouton orange « Analyse complète » (en bas, sous « Raccourcis ») pour ouvrir le détail mois par mois — ventes, objectif, écart, pourcentage atteint — et vos totaux sur 6 mois ; refermez avec la croix « ✕ » en haut de la fenêtre.",
      "Cliquez « Prévision IA » pour obtenir une estimation de vos ventes à venir. Soyez connecté à votre compte, sinon un message vous le rappelle et la fenêtre reste vide ; dans la fenêtre, « Actualiser » relance le calcul et « Fermer » la referme.",
      "Cliquez « Benchmark secteur » pour comparer vos résultats à la moyenne du secteur et au top 25 % (là aussi en étant connecté) ; « Actualiser » recharge les chiffres, « Fermer » referme.",
      "Cliquez « Exporter » pour télécharger un rapport PDF de vos ventes des 6 derniers mois.",
      "Dans les « Notifications », cliquez le lien proposé (par exemple « Relancer mes leads », « Voir le pipeline » ou « Pousser mes opportunités ») pour aller directement à vos prospects et agir.",
    ],
  },

  'stock-status': {
    summary: "Ce widget rassemble toutes vos propres annonces de matériel et met en avant celles qui ont besoin d'attention : celles qui dorment trop longtemps en stock ou qu'on voit peu. Il vous donne aussi des actions concrètes pour les revendre plus vite.",
    howItWorks: [
      "Les machines listées sont VOS annonces publiées sur le site, récupérées automatiquement depuis le serveur : rien n'est inventé. Si vous n'avez encore rien publié, la liste reste simplement vide.",
      "Une annonce passe en « alerte » (carte rouge avec un triangle) quand elle est en stock depuis plus de 60 jours OU quand sa note de visibilité est sous 50/100. Le badge « X alertes » en haut compte ces cas.",
      "Les couleurs guident l'œil : vert = tout va bien, orange = à surveiller, rouge = à traiter. Cela vaut pour les jours en stock et pour le score de visibilité, lui-même calculé sur la qualité de la fiche (photos, description, prix) et l'intérêt réel (vues et contacts).",
      "Le petit conseil « 💡 » sous chaque machine et la ligne « Marché : médiane … € » (qui compare votre prix au prix moyen d'annonces similaires publiées sur le site) reposent aussi sur de vraies données.",
      "La liste affiche d'abord les 6 machines prioritaires (les alertes et les plus anciennes remontent en tête) ; le compteur « X équipements trouvés » indique combien correspondent à vos filtres.",
    ],
    whatToDo: [
      "Sur chaque annonce, le bouton « Ajouter photo » envoie une vraie photo sur votre fiche (ce qui remonte sa visibilité), et « Créer offre flash » lance une remise de -15 % pendant 7 jours, enregistrée aussitôt.",
      "En haut, la puce « ⚡ Raccourcis » déplie trois boutons : « Nouvelle annonce » (pour publier un engin), « Exporter stock » (télécharge un fichier CSV de vos annonces) et « Suggestions prix » (compare vos prix à ceux du site et vous dit lesquels baisser).",
      "La puce « 🔗 Stock × prospects » montre quelles machines de votre stock collent à vos prospects en cours ; le bouton « Copier le texte » copie un e-mail prêt à envoyer, et la petite flèche à droite ouvre la fiche de l'annonce.",
      "La puce « 📊 Marché » affiche les autres annonces du site (hors les vôtres) avec leurs prix, pour situer les vôtres.",
      "Les deux menus déroulants filtrent par catégorie et par ancienneté (0-30j, 30-60j, 60j+, 90j+) ; « Afficher plus » déroule les machines suivantes et « Réduire » revient à l'essentiel.",
    ],
  },

  'transaction-cases': {
    summary: "Ce widget affiche la liste de vos dossiers de transaction : le suivi de chaque affaire entre un acheteur et un vendeur, de la demande de prix jusqu'au paiement et à la livraison. En un coup d'œil, vous voyez combien de dossiers vous concernent et où en est chacun.",
    howItWorks: [
      "La liste vient du serveur : ce sont vos vrais dossiers, pas des exemples. Elle ne montre que ceux qui vous concernent (vous êtes vendeur, acheteur, invité sur le dossier, ou responsable de votre société).",
      "En haut à gauche, un chiffre indique le nombre total de dossiers, et les dossiers les plus récemment mis à jour s'affichent en premier.",
      "Chaque ligne montre le titre du dossier puis, en gris juste en dessous, une ligne de repères : le type (vente, location, financement…), le statut, l'étape en cours (par exemple négociation, contrat, paiement, livraison) et, si elle est renseignée, la priorité.",
      "Selon la taille du widget, seuls les 5, 8 ou 12 premiers dossiers sont montrés ; s'il y en a davantage, un lien « +X autre(s) » apparaît en bas pour voir le reste.",
      "Si rien ne s'affiche, un message explique qu'aucun dossier n'est visible pour votre rôle : un dossier se crée quand un acheteur connecté envoie une demande de prix sur une de vos annonces. La liste se rafraîchit aussi toute seule quand vos données changent ailleurs dans l'outil.",
    ],
    whatToDo: [
      "Pour ouvrir un dossier et voir tout son détail, cliquez simplement sur sa ligne (la flèche orange « → » à droite indique qu'elle est cliquable).",
      "Cliquez le bouton « Actualiser » en haut à droite pour recharger la liste et afficher les tout derniers changements.",
      "Quand il y a plus de dossiers que la place ne le permet, cliquez « +X autre(s) » en bas pour ouvrir la liste complète de vos dossiers.",
      "Si aucun dossier n'apparaît, le lien « Liste complète des dossiers » vous emmène vers la page où tous vos dossiers sont regroupés.",
      "Repérez l'étape indiquée sur chaque ligne (par exemple « paiement » ou « livraison ») pour voir d'un coup d'œil les dossiers qui demandent votre attention en premier.",
    ],
  },

  'sales-pipeline': {
    summary: "Ce widget suit tous vos prospects commerciaux, du premier contact jusqu'à la vente. Il montre, pour chaque affaire, où elle en est, combien elle peut rapporter et la prochaine action à mener pour la conclure.",
    howItWorks: [
      "Les chiffres viennent de vos vrais prospects enregistrés dans l'outil (rien n'est inventé) ; la liste se met à jour toute seule, environ toutes les 15 secondes et quand vous revenez sur la page.",
      "Chaque prospect avance par étapes colorées : Prospection, Devis, Négociation, puis Gagné (vert) ou Non retenu (rouge).",
      "Les 4 cartes du haut résument le pipeline : Total leads, Valeur totale, Valeur pondérée (le montant ajusté selon les chances de réussite) et Taux conversion.",
      "Sur chaque ligne, des pastilles indiquent la priorité (Haute, Moyenne, Basse), le rôle du prospect (Lauréat / Maître d'ouvrage), « À moi » quand l'affaire vous est attribuée, et « ✓ Traité » / « ● En cours » si son action du jour a bougé côté Actions Commerciales. La mention « contacté il y a X j » montre la fraîcheur.",
      "Le bloc « Alertes sur le pipeline » calcule tout seul des points d'attention à partir de vos leads (prospects sans contact depuis plus de 7 jours, devis sans relance, opportunités de plus de 500 000 MAD, étapes à faible conversion) — ce ne sont pas des prédictions d'IA.",
    ],
    whatToDo: [
      "Créer un prospect : en haut à droite, le bouton « Nouveau lead » (icône +) vous demande le nom puis la valeur estimée, et l'ajoute à l'étape Prospection.",
      "Faire avancer une affaire : sur la ligne, cliquez le bouton orange (« Passer en devis », puis « Passer en négociation », puis « Marquer gagné ») pour passer à l'étape suivante. Pour l'abandonner, ouvrez le menu « ⋯ » puis « Marquer non retenu » (et « Réactiver le lead » plus tard).",
      "Voir et modifier une fiche : cliquez « Détails ». Dans la fenêtre, « Modifier » change les infos (nom, étape, valeur, probabilité, prochaine action, assigné à), « Ajouter une note » ajoute un commentaire daté, et « Programmer un appel » demande une date et une heure de rendez-vous.",
      "Choisir l'affichage et filtrer : les boutons « Liste », « Kanban » et « Timeline » changent la vue ; la bascule « Mes leads » / « Équipe » montre vos affaires ou celles de toute la société ; les menus « Toutes les étapes » et « Trier par… » trient la liste ; si vous avez des prospects d'appels d'offres, le filtre « Tous / Lauréats / M. d'ouvrage » apparaît.",
      "Voir les conversions : le bouton bleu « Taux conversion » déplie le pourcentage de passage d'une étape à la suivante.",
      "Raccourcis et export : dépliez « Raccourcis pipeline » pour « Boîte leads » (ouvre la page des leads) et « Exporter (Excel) » ; après avoir ouvert un prospect via « Détails », « Enregistrer relance » met à jour son dernier contact et « Planifier RDV » note un rendez-vous à programmer. Le bouton « Exporter » en haut télécharge la liste affichée dans un fichier tableur.",
    ],
  },

  'daily-actions': {
    summary: "Ce widget rassemble au même endroit toutes les actions commerciales à faire aujourd'hui (rappeler un client, relancer une opportunité, envoyer un devis...), classées de la plus urgente à la moins urgente. C'est votre liste de tâches du jour, pour ne rien laisser passer.",
    howItWorks: [
      "Les actions ne sont pas inventées : elles sont créées automatiquement à partir de votre activité réelle (vos opportunités du pipeline/Kanban, vos messages reçus et vos devis/offres). La liste se rafraîchit toute seule environ chaque minute et quand vous revenez sur la page.",
      "Chaque ligne porte une pastille de priorité : Haute en rouge, Moyenne en orange, Basse en vert. Une petite étiquette « Kanban » signale les actions qui viennent d'une opportunité de votre pipeline.",
      "L'heure prévue, à droite, change de couleur selon l'urgence : rouge = en retard, orange = à faire maintenant, jaune = à faire dans l'heure, vert = à venir. Si un montant est connu, la valeur estimée en dirhams s'affiche juste à côté.",
      "Une petite icône devant chaque ligne indique l'état : à faire, en cours, ou terminée. En haut, le compteur « X en attente » vous dit combien il reste à traiter.",
      "Les actions que vous démarrez, terminez ou reprogrammez restent mémorisées : elles ne disparaissent pas et ne réapparaissent pas au rafraîchissement.",
    ],
    whatToDo: [
      "Faites avancer une action : cliquez « Démarrer » pour la passer en cours, puis « Terminer » quand c'est fait (le bouton « Terminer » n'apparaît qu'une fois l'action démarrée).",
      "Pour écrire au client, cliquez « WhatsApp » sur sa ligne : la conversation s'ouvre avec un message de suivi déjà prêt.",
      "Pour l'appeler ou la reporter, cliquez « ⋯ » sur la ligne : « Appeler (téléphone) » lance l'appel, « Reprogrammer à demain » repousse l'action au lendemain.",
      "Le bouton « Appels » en haut à droite sert seulement à régler la téléphonie (mode, opérateur, indicatif, URL) : à ouvrir une fois si vos appels ne partent pas.",
      "Concentrez-vous grâce aux menus du haut : filtrez par priorité ou par type (appels, emails, rendez-vous, suivi, devis, propositions), changez le tri (par priorité, par heure ou par valeur), et cochez « Afficher terminées » pour revoir ce qui est fait.",
      "Cliquez « Exporter les actions (CSV) » tout en bas pour télécharger un vrai fichier tableur des actions affichées.",
    ],
  },

  'ai-insights': {
    summary: "Ce widget « Recommandations — actions prioritaires » vous donne la liste des choses les plus utiles à faire maintenant : relancer un acheteur, répondre à un devis en attente, ouvrir un dossier, surveiller un dossier à risque ou assigner un partenaire. Chaque suggestion vient de vos vraies données (annonces, devis, leads, dossiers, partenaires), jamais d'un exemple inventé.",
    howItWorks: [
      "Chaque carte est bâtie à partir de votre activité réelle : une annonce très vue mais sans devis, un devis reçu sans dossier ouvert, un lead ou un devis sans réponse depuis plus de 7 jours, un partenaire à assigner ou surchargé, ou un dossier jugé à risque. Rien n'est inventé.",
      "Sur chaque carte vous lisez le titre, la raison en clair, puis une petite ligne « Source : … » qui indique d'où vient l'info (par exemple vos devis, vos leads ou vos dossiers) : c'est la preuve derrière la suggestion.",
      "La pastille de couleur en haut à droite dit l'urgence : « Urgent » (rouge) = à faire tout de suite, « Prioritaire » (orange) = important, « À noter » (gris) = peut attendre. Les plus urgentes sont automatiquement remontées en haut de la liste.",
      "Si le serveur d'analyse est joignable, une section « Insights du serveur IA » peut s'ajouter en haut, reconnaissable à son badge « IA » ; s'il n'est pas disponible, elle n'apparaît tout simplement pas (aucune case vide).",
      "Pendant le calcul, le widget affiche « Analyse… » ; s'il n'y a vraiment rien d'important, il affiche un court message « Aucune recommandation pour le moment » plutôt que de remplir l'écran.",
    ],
    whatToDo: [
      "Pour traiter une suggestion, cliquez le lien orange en bas de la carte : son texte change selon le cas (« Relancer », « Répondre / relancer », « Créer le dossier transaction », « Améliorer l'annonce (prix, photos, inspection) », « Assigner le meilleur partenaire » ou « Vérifier avant escrow »). Il vous emmène directement sur le bon écran (vos leads, l'annonce ou le dossier concerné).",
      "Occupez-vous d'abord des cartes rouges « Urgent », puis des oranges « Prioritaire », et enfin des grises « À noter » : c'est déjà l'ordre dans lequel elles sont rangées.",
      "Quand une carte signale un dossier à risque, cliquez « Vérifier avant escrow » pour contrôler le dossier avant de sécuriser le paiement ; quand elle signale une annonce très vue sans devis, cliquez « Améliorer l'annonce (prix, photos, inspection) » pour aller la retravailler.",
      "Bon à savoir : ce widget n'a ni filtre, ni tri, ni bouton d'export ou d'actualisation. La seule action est ce lien orange en bas de chaque carte ; les pastilles « Urgent / Prioritaire / À noter » et le badge « IA » sont juste des repères de lecture, pas des boutons.",
      "La liste se reconstruit toute seule à l'ouverture de votre tableau de bord : traitez une suggestion via son lien, puis revenez, elle se met à jour d'elle-même.",
    ],
  },

  'ai-optimization': {
    summary: "Ce widget vous propose des conseils tout prêts pour améliorer vos annonces — leur prix, leur visibilité dans les recherches, leur texte et leurs photos, leur promotion — afin d'attirer plus d'acheteurs. Il n'affiche un conseil que lorsqu'une vraie amélioration est repérée sur vos propres annonces.",
    howItWorks: [
      "Les conseils sont calculés à partir de vos vraies annonces (ils peuvent aussi venir d'un service d'analyse en ligne). S'il n'y a rien à améliorer, le widget reste vide avec le message « Aucune optimisation suggérée » — c'est normal, aucun conseil n'est inventé.",
      "Chaque conseil est rangé dans une catégorie reconnaissable à sa couleur : visibilité dans les recherches (« SEO ») en bleu, Prix en vert, Contenu (texte et photos) en violet, Marketing en orange.",
      "En haut à droite de chaque carte, une petite pastille indique l'urgence : rouge = priorité haute, orange = moyenne, vert = basse.",
      "Sur chaque carte, vous trouvez la liste « Actions recommandées » (les petites coches vertes) et, en bas, « Impact attendu » : le gain que vous pouvez espérer si vous appliquez le conseil.",
      "Tout en bas, un récapitulatif compte le nombre de suggestions affichées et rappelle combien sont en priorité haute ou moyenne.",
    ],
    whatToDo: [
      "Servez-vous des onglets du haut — « Toutes », « SEO », « Prix », « Contenu », « Marketing » — pour n'afficher qu'un type de conseil à la fois ; le chiffre entre parenthèses (par exemple « Prix (2) ») indique combien de conseils il y a dans chaque catégorie.",
      "Les « Actions recommandées » d'une carte ne sont pas des boutons : c'est une petite liste à faire vous-même sur l'annonce concernée (changer le prix, ajouter une photo, compléter la description…). Commencez par les cartes à pastille rouge « Priorité haute », ce sont les plus rentables.",
      "Aidez-vous de la ligne « Impact attendu » pour choisir les conseils qui rapportent le plus avant de vous lancer.",
      "Une fois vos annonces modifiées, cliquez sur la flèche ronde en haut à droite (bulle « Actualiser les suggestions ») pour relancer l'analyse : les conseils se mettent à jour et ceux que vous avez traités disparaissent.",
    ],
  },

  "rental-revenue": {
    summary: "Ce widget affiche l'argent gagné avec vos locations depuis le début du mois, et vous dit si vous faites mieux ou moins bien que le mois dernier.",
    howItWorks: ["Le grand chiffre, c'est le total encaissé (en MAD) sur toutes vos locations du mois en cours.","Un petit pourcentage montre l'évolution par rapport au mois dernier : en vert si vous progressez, en rouge si vous baissez.","Il indique aussi le nombre de locations comptées dans le mois.","Ce sont vos VRAIS chiffres : ils viennent des locations que vous avez enregistrées. Tant que rien n'est saisi, il affiche 0."],
    whatToDo: ["Vous pouvez changer la période affichée pour comparer un autre mois.","Vous pouvez exporter le chiffre pour le garder ou le transmettre.","Pour que le total soit juste, enregistrez bien chaque location avec son montant."],
  },

  "equipment-availability": {
    summary: "Ce widget montre l'état de votre parc : quelles machines sont libres, lesquelles sont louées, et lesquelles sont en réparation.",
    howItWorks: ["Chaque machine apparaît avec une couleur qui indique son état.","Vert = disponible (prête à louer), orange = en location, rouge = en maintenance ou réparation.","Pour une machine louée, il peut afficher la date de retour prévue ; pour une machine à l'atelier, la prochaine date d'entretien.","Ce sont vos vraies machines et vraies locations : l'état se calcule tout seul à partir de ce que vous avez enregistré. Sans machine enregistrée, la liste reste vide."],
    whatToDo: ["Repérez les machines en vert : ce sont celles que vous pouvez proposer tout de suite à un client.","Surveillez les machines en rouge pour relancer les réparations et les remettre en service.","Vous pouvez exporter la liste de votre parc."],
  },

  "upcoming-rentals": {
    summary: "C'est votre planning de locations : il liste les réservations à venir et les locations en cours, avec les dates et le client.",
    howItWorks: ["Chaque ligne correspond à une location : la machine, le client, la date de début, la date de fin et le prix par jour.","Une couleur indique où en est la location : confirmée, en attente, ou en cours.","Ce sont vos vraies réservations : la liste vient des locations enregistrées dont la date de fin n'est pas encore passée. Elle est vide si aucune location n'est prévue."],
    whatToDo: ["Préparez à l'avance les machines dont la location approche.","Relancez les clients dont la location est encore 'en attente' pour la confirmer."],
  },

  "rental-pipeline": {
    summary: "Ce widget suit vos demandes de location comme un tableau d'avancement, du premier contact jusqu'au contrat signé.",
    howItWorks: ["Les locations sont rangées par étape : Prospection, Devis, Négociation, Conclu (gagné) et Perdu.","Chaque carte montre le client, le montant de la location et la période concernée.","L'étape est devinée automatiquement à partir du statut de chaque location.","Ce sont vos vraies locations en cours (ni terminées ni annulées). Le tableau reste vide tant que vous n'avez rien enregistré."],
    whatToDo: ["Concentrez-vous sur les cartes en 'Négociation' : ce sont les plus proches d'être signées.","Faites avancer les demandes qui restent bloquées trop longtemps sur la même étape."],
  },

  "rental-overdue": {
    summary: "Ce widget rassemble les loyers que des clients vous doivent encore et qui sont en retard de paiement.",
    howItWorks: ["En haut : le total impayé (en MAD), le nombre de factures en retard et le pire retard en jours.","Une ligne répartit les sommes selon l'ancienneté du retard : 0-30 jours (jaune), 31-60 jours (orange), plus de 60 jours (rouge). Plus c'est rouge, plus c'est urgent.","En dessous, la liste des clients qui doivent le plus, avec le montant dû et le nombre de jours de retard.","Ce sont vos vraies factures de location : il ne garde que celles dépassées et non payées. Il affiche 'Aucun loyer impayé' si tout est à jour, ou si vous n'avez pas encore saisi de factures."],
    whatToDo: ["Relancez en priorité les clients de la colonne rouge (plus de 60 jours).","Commencez par les plus gros montants, affichés en haut de la liste.","Vous pouvez exporter la liste pour votre suivi de trésorerie."],
  },

  "tx-assigned-inspections": {
    summary: "Ce widget est prévu pour lister les contrôles d'engins qui vous seraient confiés sur les dossiers de vente. Pour l'instant il n'est pas encore actif et n'apparaît pas sur votre tableau de bord.",
    howItWorks: ["Une fois prêt, il afficherait la liste des inspections d'engins qu'on vous a assignées, dossier de vente par dossier de vente.","Chaque ligne indiquerait l'engin à contrôler et le dossier concerné.","Aujourd'hui il est volontairement mis de côté : la partie qui va chercher les informations n'est pas encore branchée, donc le widget reste masqué.","Rien n'est inventé : tant qu'il n'est pas prêt, aucun faux chiffre n'est montré, il ne s'affiche tout simplement pas."],
    whatToDo: ["Rien à faire pour l'instant : ce widget n'est pas encore disponible, vous ne le verrez pas à l'écran.","Il est gardé de côté pour être ajouté plus tard, quand la fonction sera terminée."],
  },

  "interventions-today": {
    summary: "Ce widget montre, sous forme de petit graphique, combien d'interventions (ordres de travail) sont prévues aujourd'hui et où elles en sont. Il affiche vos vraies données, pas un exemple.",
    howItWorks: ["En haut, un compteur indique le nombre d'ordres de travail planifiés pour aujourd'hui ; si certains sont prioritaires, une pastille rouge « urgent » apparaît.","Le graphique en barres oranges compare deux groupes : les interventions « Terminé » et celles « En attente ».","Les chiffres viennent de vos vraies interventions du jour enregistrées dans l'outil.","S'il n'y a rien de prévu, un message « Aucune intervention prévue aujourd'hui » s'affiche avec un bouton pour en créer une : c'est normal tant que vous n'avez rien saisi."],
    whatToDo: ["Cliquez sur « Nouvel OT » pour créer une nouvelle intervention du jour.","Surveillez la pastille rouge « urgent » pour traiter en priorité.","Utilisez « Voir détails » pour ouvrir le tableau complet des chiffres."],
  },

  "repair-status": {
    summary: "Ce widget liste les équipements actuellement en réparation à l'atelier, avec le technicien, la durée estimée et le coût. Il affiche vos vraies données.",
    howItWorks: ["Chaque ligne montre l'engin et le problème, puis, en dessous, le technicien assigné, la durée estimée (en heures) et le coût estimé en MAD (dirhams).","Une couleur de priorité met en avant les cas chauds : « urgent » ou « en cours » passent en priorité haute, « en attente » en priorité moyenne.","Seules les réparations non terminées apparaissent ; dès qu'une réparation est marquée terminée, elle disparaît de la liste.","Les données viennent de vos vraies fiches de réparation. Si l'atelier est vide, le message « Aucune réparation en cours — Atelier au calme » s'affiche."],
    whatToDo: ["Repérez les réparations en priorité haute pour les traiter en premier.","Vérifiez qu'un technicien est bien assigné à chaque réparation.","Marquez une réparation comme terminée pour qu'elle sorte de la liste."],
  },

  "parts-inventory": {
    summary: "Ce widget montre le niveau de stock de vos pièces détachées, par catégorie, et vous alerte quand une pièce passe sous le seuil minimum. Il affiche vos vraies données.",
    howItWorks: ["Le graphique en barres oranges montre la quantité en stock pour chaque catégorie de pièces (c'est un nombre de pièces, pas un montant en argent).","Si des pièces passent sous leur seuil minimum, un encadré rouge « X références sous seuil » apparaît en haut, avec le détail (stock actuel / seuil).","À côté de chaque pièce en alerte, un bouton « Commander » permet de lancer une commande de réapprovisionnement en un clic.","Les chiffres viennent de votre vrai inventaire. Sans pièce enregistrée, le message « Aucune pièce en stock » s'affiche."],
    whatToDo: ["Regardez l'encadré rouge pour voir les pièces qui manquent.","Cliquez sur « Commander » pour commander automatiquement de quoi repasser au-dessus du seuil.","Ajoutez vos références dans le module Inventaire si la liste est vide."],
  },

  "technician-workload": {
    summary: "Ce widget montre, sous forme de graphique, à quel point chaque technicien est chargé de travail. Il affiche vos vraies données.",
    howItWorks: ["Chaque barre orange représente un technicien ; sa hauteur indique son taux d'occupation en pourcentage (jusqu'à 100 % au maximum).","Le pourcentage est calculé à partir des heures de ses tâches en cours, comparées à sa capacité maximale d'heures.","Seules les tâches non terminées comptent dans le calcul.","Les données viennent de votre vraie équipe et de vos vraies tâches. Sans technicien enregistré, le message « Aucun technicien enregistré » s'affiche."],
    whatToDo: ["Repérez les techniciens proches de 100 % pour rééquilibrer les tâches.","Confiez plutôt les nouvelles tâches aux techniciens les moins chargés.","Ajoutez vos techniciens dans Paramètres > Équipe si la liste est vide."],
  },

  "tx-assigned-transports": {
    summary: "Ce widget « Transports dossiers (assignés) » est prévu pour plus tard : il n'est pas encore actif et n'apparaît pas dans votre tableau de bord aujourd'hui. Il servira un jour à lister les enlèvements et livraisons rattachés à vos dossiers de vente.",
    howItWorks: ["C'est un widget « à venir » : il a été volontairement masqué tant qu'il n'est pas relié à vos données. Vous ne le voyez donc pas sur l'écran.","Une fois activé, il montrera la liste des transports liés à une transaction (par exemple un engin vendu qu'il faut aller livrer au client).","Pour l'instant il n'affiche aucun chiffre, car la fonction n'est pas encore branchée."],
    whatToDo: ["Rien à faire pour le moment : c'est une fonctionnalité prévue pour plus tard.","En attendant, suivez vos transports du jour avec le widget « Livraisons en cours »."],
  },

  "active-deliveries": {
    summary: "Un grand compteur qui montre combien de livraisons sont actuellement actives (en route ou planifiées), avec le détail par statut. Les chiffres viennent de vos vraies livraisons enregistrées.",
    howItWorks: ["Le grand chiffre au centre = le nombre total de livraisons en cours ou planifiées.","Juste en dessous, trois petites cases colorées : « En route » (orange), « Planifiées » (bleu) et « Retardées » (rouge).","Si des livraisons sont marquées urgentes ou prioritaires, un bandeau rouge « X missions prioritaires » s'affiche pour attirer l'œil.","Ce ne sont pas des données d'exemple : ce sont vos propres livraisons. Tant que vous n'en avez saisi aucune, tout reste à 0."],
    whatToDo: ["Cliquez sur le bouton orange « Nouvelle livraison » pour en planifier une : elle viendra remplir le compteur.","Surveillez la case rouge « Retardées » et le bandeau des missions prioritaires pour savoir où agir en premier."],
  },

  "delivery-map": {
    summary: "Une carte qui situe vos véhicules et vos destinations de livraison, avec un rappel du statut. Attention : ce n'est pas un suivi GPS en temps réel.",
    howItWorks: ["En haut, trois pastilles comptent les véhicules « en mission » (point orange), « disponibles » (point vert) et le nombre de « destinations » (point bleu).","Un point n'apparaît sur la carte que si une position a été renseignée à la main : il n'y a pas de traceur automatique qui suit les camions en direct.","Les informations viennent de vos vraies livraisons et de vos véhicules, pas de données d'exemple.","Si aucune position n'a été saisie, le message « Aucune position renseignée » s'affiche à la place de la carte."],
    whatToDo: ["Renseignez l'adresse ou la position de destination sur vos livraisons pour les voir apparaître sur la carte.","À part cela, c'est un widget de consultation : rien d'autre à faire, il sert juste à visualiser."],
  },

  "transport-costs": {
    summary: "Un graphique qui montre vos coûts de transport mois par mois sur les 6 derniers mois, avec quelques totaux utiles. Calculé à partir de vos vraies livraisons.",
    howItWorks: ["Trois cases en haut résument : le total dépensé sur 6 mois, le nombre de livraisons, et le coût moyen par livraison.","Le graphique affiche une valeur par mois (jan, fév, mars…) pour visualiser l'évolution de vos dépenses.","En bas à droite : la distance totale parcourue et le coût moyen au kilomètre (en MAD/km), un bon repère de rentabilité.","Ce sont vos chiffres réels. Sans aucune livraison sur les 6 derniers mois, le message « Aucune livraison sur les 6 derniers mois » apparaît."],
    whatToDo: ["Pensez à renseigner le coût et la distance sur chaque livraison, sinon le graphique sera incomplet.","Utilisez le coût moyen au kilomètre comme repère pour fixer vos prix. Sinon, rien à faire : c'est un widget d'information."],
  },

  "driver-schedule": {
    summary: "La liste de vos chauffeurs avec leurs missions prévues sur les 7 prochains jours. Alimenté par vos vrais chauffeurs et livraisons enregistrés.",
    howItWorks: ["En haut, un résumé : le nombre de chauffeurs et le nombre total de missions prévues sur 7 jours.","Chaque chauffeur porte une étiquette de statut en couleur : vert « Disponible », orange « En mission », gris pour les autres cas.","Sous chaque chauffeur, ses missions (engin, destination indiquée par une flèche →, date et heure) ; une mission urgente ou à haute priorité s'affiche en rouge.","Un petit ⚠ apparaît si le permis d'un chauffeur expire bientôt (dans moins de 60 jours).","Ce ne sont pas des données d'exemple. Sans chauffeur enregistré, le message « Aucun chauffeur enregistré » s'affiche."],
    whatToDo: ["Ajoutez vos chauffeurs (dans Paramètres > Équipe) pour qu'ils apparaissent dans le planning.","Regardez le ⚠ des permis à renouveler et répartissez les missions selon qui est disponible."],
  },

  "deadhead-cost": {
    summary: "Le coût des kilomètres roulés « à vide » (le camion qui revient sans chargement), trajet par trajet. C'est souvent une grosse perte de marge cachée. Calculé sur vos vraies livraisons.",
    howItWorks: ["Trois cases en haut : le « Coût du vide » en MAD (en rouge s'il y en a), le « Taux de vide global » en % (rouge s'il est trop élevé) et le total des « Km à vide cumulés ».","Un trajet dont le retour à vide dépasse 40 % est signalé en rouge, et un avertissement indique combien de trajets sont concernés.","Chaque ligne montre le trajet et le client, les km en charge / km à vide, puis à droite le pourcentage de vide et l'argent gaspillé en MAD.","Ce sont vos données réelles. Il faut avoir renseigné les km en charge, les km à vide et le coût au km ; sinon le message « Aucun trajet chiffré » s'affiche."],
    whatToDo: ["Renseignez sur chaque livraison les km en charge, les km à vide et le coût au kilomètre pour que le calcul fonctionne.","Concentrez-vous sur les trajets en rouge (plus de 40 % de vide) : cherchez un chargement pour le retour afin de réduire ces pertes."],
  },

  "customs-clearance": {
    summary: "Ce cadran compte vos déclarations douanières encore en cours. Le grand chiffre au centre, c'est le nombre de dossiers ouverts (ni liquidés, ni annulés).",
    howItWorks: ["Le grand nombre au centre = vos déclarations encore ouvertes ; la ligne juste en dessous rappelle le total de tous vos dossiers.","Trois petites cases : « En cours » (bleu, dossier en préparation, soumis ou en contrôle), « Bloqués » (orange), « En retard » (rouge = la date de dédouanement prévue est dépassée).","Si un montant est renseigné, une ligne affiche la « Valeur déclarée » des dossiers ouverts, en dirhams (MAD) ; tout en bas figure le nombre de dossiers déjà liquidés.","Les chiffres viennent de vos vraies déclarations enregistrées dans MineGrid — ce n'est pas un exemple figé. Mais tant qu'aucune déclaration n'est saisie, tout reste à 0."],
    whatToDo: ["Surveillez surtout la case rouge « En retard » et la case orange « Bloqués » : ce sont vos dossiers à débloquer en priorité.","Pour faire bouger ces chiffres, créez ou mettez à jour vos déclarations dans MineGrid — ce cadran n'est qu'un résumé.","À part cette veille, rien à faire : c'est un affichage."],
  },

  "container-tracking": {
    summary: "Une vraie carte qui montre où en sont vos conteneurs : navire, port, statut et heure d'arrivée prévue. Attention : les positions sont celles que vous saisissez, ce n'est pas un suivi GPS en direct.",
    howItWorks: ["Chaque conteneur ayant une position apparaît sous forme de pastille 📦 sur une carte centrée sur le Maroc.","La couleur indique le statut : bleu « En mer », violet « Transbordement », vert « À quai », orange « Douane », gris « Livré », rouge « Retard ».","Cliquez une pastille pour voir le détail : numéro du conteneur, navire, statut, port de départ → port d'arrivée, et heure d'arrivée prévue (ETA).","En haut, le nombre total de conteneurs suivis et la répartition par statut. Seuls ceux qui ont une position s'affichent ; sans position renseignée, la carte reste vide.","Les données viennent de vos vrais conteneurs dans MineGrid ; ce n'est pas du suivi temps réel, il faut entrer la position à la main."],
    whatToDo: ["Tenez à jour le statut, l'heure d'arrivée et la position de chaque conteneur pour que la carte reste utile.","Repérez d'un coup d'œil les pastilles rouges (« Retard ») ou orange (« Douane ») à traiter.","Sinon, rien à faire : la carte est là pour vous informer."],
  },

  "demurrage-tracking": {
    summary: "La liste de vos conteneurs qui dépassent la période gratuite au port, avec les jours de retard et le coût qui s'accumule. C'est souvent le poste de dépense numéro 1 d'un transitaire.",
    howItWorks: ["Trois cases en haut : « Exposition surestaries » (coût total, rouge si vous payez, vert si c'est zéro), « En dépassement » (nombre de conteneurs concernés), « Pire dépassement » (le plus grand nombre de jours).","En dessous, chaque conteneur : numéro, statut, port, date de fin de franchise, puis à droite « +X j » et le coût en MAD (rouge), ou « Dans la franchise » (vert) s'il est encore à temps.","Le calcul : fin de franchise = date d'arrivée + jours gratuits ; jours de dépassement × tarif par jour = coût. La liste est triée du plus coûteux au moins coûteux.","Données issues de vos vrais conteneurs : il faut y avoir renseigné la date d'arrivée, les jours de franchise et le tarif/jour, sinon la liste reste vide."],
    whatToDo: ["Traitez en priorité les conteneurs tout en haut de la liste (les plus coûteux) pour stopper la facture qui monte.","Surveillez la ligne « X conteneur(s) dans la franchise à surveiller » : encore gratuits, mais bientôt facturés.","Renseignez bien date d'arrivée, franchise et tarif/jour sur chaque conteneur pour que le coût affiché soit juste."],
  },

  "import-export-stats": {
    summary: "Un graphique de vos volumes d'import et d'export sur les 6 derniers mois, comptés en conteneurs (TEU).",
    howItWorks: ["En haut, le total de conteneurs (import + export) et l'évolution par rapport au mois précédent : vert si en hausse, rouge si en baisse.","Deux cases : « TEU import » (bleu) et « TEU export » (violet) du dernier mois. TEU est simplement l'unité standard qui sert à compter les conteneurs.","Le graphique montre le total mensuel des conteneurs sur les 6 derniers mois.","Les chiffres viennent des volumes mensuels que vous saisissez dans MineGrid — ce ne sont pas des données d'exemple. Tant que rien n'est saisi, le widget affiche « Aucune donnée import/export »."],
    whatToDo: ["Saisissez chaque mois vos volumes d'import et d'export pour alimenter le graphique.","Servez-vous de la tendance (hausse ou baisse) pour suivre votre activité ; à part ça, c'est purement informatif."],
  },

  "document-status": {
    summary: "La liste de vos documents de fret (connaissements, factures, certificats…) avec leur statut et leur priorité, pour ne rien laisser passer.",
    howItWorks: ["En haut : le nombre de documents et, s'il y en a, un badge rouge « X urgents ».","Chaque ligne : le titre du document, son type et la référence liée (conteneur ou déclaration), son statut et sa priorité (urgent, normal…). La liste est triée par date d'échéance.","En bas, une note orange indique combien de documents sont « en attente » ou en « brouillon ».","Les documents viennent de vos vraies données MineGrid ; s'il n'y en a aucun, le widget affiche « Aucun document fret »."],
    whatToDo: ["Traitez d'abord les documents marqués urgents (badge rouge) et ceux « en attente / brouillon ».","Ajoutez ou mettez à jour vos documents de fret dans MineGrid pour qu'ils remontent ici.","Sinon, rien à faire : cette liste sert surtout à vous alerter."],
  },

  "warehouse-occupancy": {
    summary: "Ce widget montre en un seul chiffre à quel point vos entrepôts sont remplis. Pour l'instant, il affiche des données d'exemple (3 entrepôts fictifs : Casablanca, Tanger, Fès), pas encore vos vrais entrepôts.",
    howItWorks: ["Le grand pourcentage au centre, c'est le taux de remplissage moyen de tous vos entrepôts réunis (nombre de palettes utilisées comparé au nombre de places disponibles).","La couleur du chiffre vous alerte d'un coup d'œil : vert = encore de la place, orange = ça se remplit (à partir de 78%), rouge = saturé (à partir de 92%).","Juste en dessous s'affichent le nombre de sites et le total de palettes (utilisées sur capacité totale).","Deux petites cases en bas : « Critique / saturé » compte les entrepôts presque pleins, et « Hors prod. » compte ceux en maintenance ou fermés.","Les chiffres viennent d'une base de données : aujourd'hui ce sont des exemples de démonstration ; ils deviendront vos vrais chiffres une fois vos entrepôts enregistrés."],
    whatToDo: ["Surveillez la couleur : si le pourcentage passe en rouge, c'est le signal qu'un entrepôt manque de place et qu'il faut peut-être répartir la marchandise ailleurs.","Regardez la case « Critique / saturé » pour repérer combien de sites approchent de la saturation.","C'est surtout un widget d'information : il vous donne une vue d'ensemble, il n'y a pas d'action à cliquer dedans."],
  },

  "route-optimization": {
    summary: "Ce widget affiche sur une carte vos livraisons en cours, du point de départ jusqu'à la destination, avec la position des camions. Attention : malgré son nom, il ne calcule pas d'itinéraire optimisé, il sert à SUIVRE les trajets. Il montre pour l'instant des trajets d'exemple.",
    howItWorks: ["Une carte affiche chaque route avec son point de départ et son point d'arrivée, plus la position actuelle du véhicule.","En haut, un compteur indique le nombre de routes, et une pastille orange signale combien sont « actives » ou « en retard ».","Seules les routes qui ont des coordonnées GPS s'affichent sur la carte ; s'il en manque, le widget affiche « Aucune route géolocalisée ».","Les trajets affichés aujourd'hui sont des exemples de démonstration (par ex. Tanger Med → Fès, Marrakech → Casablanca) ; ils seront remplacés par vos vraies livraisons une fois celles-ci enregistrées."],
    whatToDo: ["Repérez sur la carte les camions marqués en retard pour prévenir le client ou réorganiser la journée.","Servez-vous-en comme d'un tableau de suivi en temps réel : où sont mes livraisons en ce moment.","C'est un widget d'affichage : vous le consultez, il n'y a pas de bouton d'action à l'intérieur."],
  },

  "supply-chain-kpis": {
    summary: "Ce widget résume la performance de votre chaîne logistique mois par mois (ponctualité des livraisons, taux de remplissage, délais). Les chiffres affichés sont pour l'instant des données d'exemple sur 6 mois.",
    howItWorks: ["En haut à droite, une valeur en vert ou rouge indique si votre ponctualité s'améliore ou se dégrade par rapport au mois précédent (« +/- X pts vs m-1 »).","Trois cases donnent les derniers chiffres clés : « À temps » (part des livraisons arrivées à l'heure), « Remplissage » (à quel point vos camions/entrepôts sont bien remplis), et « Délai moy. » (nombre de jours moyen).","Si des incidents ont été signalés dans le mois, un bandeau rouge s'affiche pour vous prévenir.","Un graphique en bas montre l'évolution de la ponctualité sur les 6 derniers mois.","Les données viennent de la base : ce sont aujourd'hui des exemples de démonstration, pas encore vos vrais résultats."],
    whatToDo: ["Regardez la tendance du graphique : est-ce que vos livraisons à l'heure progressent ou reculent au fil des mois ?","Réagissez au bandeau rouge des incidents pour comprendre ce qui s'est mal passé dans le mois.","C'est un widget de suivi : il sert à mesurer, il n'y a rien à cliquer dedans."],
  },

  "inventory-alerts": {
    summary: "Ce widget liste les problèmes de stock qui demandent votre attention : ruptures, niveaux trop bas ou excédents. Les alertes affichées sont pour l'instant des exemples de démonstration.",
    howItWorks: ["En haut, un compteur indique le nombre d'alertes ouvertes, et une pastille rouge « X urgents » ressort quand certaines sont prioritaires.","Chaque ligne montre le produit concerné et l'entrepôt, le type de problème (Rupture, Seuil bas, Excédent) et compare le stock actuel à la quantité cible.","Les alertes sont classées par priorité (urgent en rouge, puis normal) et seules celles encore « Ouvertes » ou « En traitement » apparaissent.","Les 3 alertes visibles aujourd'hui (un filtre en rupture, une chenille en seuil bas, des palettes en excédent) sont des données d'exemple ; elles seront remplacées par vos vraies alertes une fois vos stocks suivis dans l'outil."],
    whatToDo: ["Traitez en priorité les lignes marquées « Urgent » ou « Rupture » : ce sont les produits manquants à recommander vite.","Pour un « Excédent », pensez à écouler ou redistribuer le surplus vers un autre site.","Vous pouvez exporter la liste des alertes pour la transmettre à votre équipe achats."],
  },

  "logistics-profitability": {
    summary: "Ce widget compare, pour chaque livraison, ce qu'elle vous coûte (transport + entreposage) à ce que vous avez facturé, et met en évidence celles qui vous font perdre de l'argent. Les livraisons affichées sont pour l'instant des exemples de démonstration.",
    howItWorks: ["Trois cases en haut résument tout : la « Marge globale » (bénéfice total en dirhams et en %, verte si positive, rouge si négative), le « Coût total », et le nombre de « Livraisons à perte ».","En dessous, chaque ligne est une livraison : à gauche sa référence et son trajet avec le coût et le montant facturé, à droite sa marge en dirhams (verte si vous gagnez, rouge si vous perdez) et le pourcentage.","Les livraisons sont triées en mettant les pires marges en haut, pour que les pertes vous sautent aux yeux.","Un message rouge en bas récapitule combien de livraisons sont à perte et le montant total perdu.","Les chiffres viennent de la base de données : aujourd'hui ce sont des exemples ; ils deviendront vos vrais montants une fois vos coûts et vos factures renseignés sur chaque route."],
    whatToDo: ["Ouvrez les lignes rouges (marge négative) : ce sont les livraisons à perte à corriger en priorité, en renégociant le prix ou en réduisant le coût.","Servez-vous de la « Marge globale » pour savoir si votre activité de livraison est rentable dans l'ensemble.","Vous pouvez exporter le détail pour en discuter avec votre commercial ou votre comptable."],
  },

  "portfolio-value": {
    summary: "Ce cadre affiche la valeur totale de vos investissements (les engins que vous possédez), exprimée en millions de dirhams, avec le gain réalisé et l'argent qui rentre chaque mois.",
    howItWorks: ["Le grand chiffre au centre est la valeur actuelle de tous vos engins, en millions de MAD (par exemple 3,50 M MAD).","Juste en dessous : le nombre d'engins que vous possédez et l'argent net qui rentre chaque mois (les loyers encaissés moins les mensualités de crédit).","Deux petites cases : « PV latente » (plus-value = ce que ça vaut aujourd'hui moins ce que vous avez payé ; verte si vous gagnez, rouge si vous perdez) et « Revenus cumulés » (tout ce que vos engins vous ont rapporté depuis le début).","Les chiffres viennent de VOS propres investissements que vous saisissez dans l'appli, pas de données d'exemple. Tant que vous n'avez rien enregistré, le cadre affiche « Portefeuille vide »."],
    whatToDo: ["Cliquez sur « Nouvel actif » (ou « Premier investissement ») pour ajouter un engin que vous possédez : prix d'achat, valeur actuelle, loyer mensuel, etc.","Surveillez la case « PV latente » : si elle est rouge, vos engins valent aujourd'hui moins que ce que vous les avez payés.","Rien d'autre à faire : une fois vos actifs saisis, le total et les gains se calculent tout seuls."],
  },

  "investment-opportunities": {
    summary: "Ce cadre liste les projets d'achat d'engins que vous étudiez, avec le prix demandé, le rendement espéré et le niveau de risque, pour vous aider à décider quoi acheter.",
    howItWorks: ["Chaque ligne est une opportunité : le nom de l'engin, d'où elle vient (source), et le prix demandé en MAD.","L'étiquette de couleur à droite est la recommandation : vert « Acheter », orange « Étudier », rouge « Passer », bleu « Suivre ».","Sur chaque ligne : « ROI X% » = le rendement espéré (vert si élevé), « PB Xm » = le nombre de mois pour récupérer votre mise, et « RX/10 » = le niveau de risque (vert = faible, rouge = élevé).","Une opportunité proche de sa date limite affiche les jours restants en orange, ou « Expirée » en rouge.","Ce sont VOS opportunités, saisies par vous, pas des exemples. Au départ le cadre est vide avec le message « Aucune opportunité active »."],
    whatToDo: ["Cliquez sur « Nouvelle opportunité » pour enregistrer un engin que vous envisagez d'acheter.","Sur une opportunité recommandée, le bouton « Acheter » la transforme en investissement réel dans votre portefeuille.","Traitez en priorité les opportunités qui expirent dans quelques jours."],
  },

  "roi-analysis": {
    summary: "Ce cadre montre la rentabilité de vos investissements : combien vos engins rapportent par rapport à ce qu'ils vous ont coûté.",
    howItWorks: ["Trois cases en haut : le rendement moyen par an (vert si bon, orange si moyen, rouge si faible), le nombre d'engins analysés, et le nombre d'engins qui vous font perdre de l'argent (rendement négatif).","Le graphique regroupe le gain par famille d'engins pour voir lesquelles rapportent le plus.","La liste « Top 3 performances » montre vos trois meilleurs engins avec leur rendement par an.","Tout est calculé à partir de vos investissements enregistrés (loyers encaissés plus valeur actuelle, moins le prix d'achat et l'entretien). Pas de données d'exemple : tant que rien n'est saisi, il affiche « Pas encore d'analyse ROI disponible »."],
    whatToDo: ["Rien à saisir ici, c'est un tableau de lecture. Pour le remplir, ajoutez d'abord vos engins via le cadre « Valeur portefeuille ».","Repérez les engins à rendement négatif (case rouge) : ce sont ceux à surveiller ou à envisager de revendre."],
  },

  "risk-assessment": {
    summary: "Ce cadre donne une note de risque globale à votre portefeuille et détaille les points faibles, pour repérer où vous êtes trop exposé.",
    howItWorks: ["En haut à droite : la note de risque globale sur 10, avec un mot-clé et une couleur : vert « Faible », orange « Modéré », rouge « Élevé » ou « Critique ».","Le graphique note sur 10 cinq types de risque : trop d'engins dans une même famille (concentration), parc trop vieux, trop de crédits à rembourser, entretien trop coûteux, et engins qui dorment sans rapporter.","En dessous, des alertes en orange (⚠) apparaissent seulement si un seuil est dépassé, par exemple une famille d'engins qui pèse plus de 40 % du parc.","Tout est calculé à partir de vos vrais investissements enregistrés, pas de données d'exemple. Tant que rien n'est saisi, il affiche « Pas d'évaluation de risque disponible »."],
    whatToDo: ["Rien à saisir, c'est informatif : le cadre se remplit tout seul à partir de vos engins.","Si un risque ressort en rouge, agissez : variez les familles d'engins, remplacez les plus vieux, ou remettez en location les engins qui ne rapportent rien."],
  },

  "yield-realized-vs-expected": {
    summary: "Ce cadre compare, pour chaque engin, l'argent que vous espériez encaisser à ce que vous avez vraiment gagné, et pointe les engins qui rapportent moins que prévu.",
    howItWorks: ["Trois cases en haut : le revenu total attendu, le revenu total réellement encaissé, et l'écart entre les deux en MAD (vert si vous êtes au-dessus de l'objectif, rouge si en dessous) avec le pourcentage.","Chaque ligne est un engin : ce qui était attendu, ce qui a été réalisé, depuis combien de mois vous le détenez, et à droite l'écart en dirhams et en pourcentage.","Une ligne surlignée en rouge signale un engin « sous-performant » qui gagne moins que prévu.","Tout en bas : le nombre d'engins sous-performants et le total du « manque à gagner » en MAD.","Basé sur vos vraies données : il faut avoir renseigné le loyer visé (ou le rendement en %) et le revenu réellement encaissé de chaque engin, sinon le cadre reste vide."],
    whatToDo: ["Pour l'utiliser, renseignez pour vos engins le revenu attendu et le revenu réellement encaissé.","Concentrez-vous sur les lignes rouges : renégociez le loyer, remettez l'engin en location, ou envisagez de le revendre."],
  },

  "transaction-broker-financing": {
    summary: "Ce widget est prévu pour suivre les demandes de financement des dossiers où vous êtes courtier, mais il n'est pas encore activé. Pour l'instant il n'apparaît même pas dans votre tableau de bord.",
    howItWorks: ["Il est encore au stade de projet : le lien avec vos vraies données n'a pas encore été fait.","Il a été volontairement retiré de votre écran tant qu'il n'est pas prêt, pour ne pas afficher une case vide ou trompeuse.","Une fois en service, il listera les demandes de financement rattachées à vos dossiers (montant, état d'avancement).","Il ne montre donc rien aujourd'hui : ni vos vraies données, ni des données d'exemple."],
    whatToDo: ["Rien à faire pour le moment : attendez sa mise en service dans une prochaine version.","En attendant, servez-vous du widget « Demandes de crédit » qui couvre déjà le suivi des financements."],
  },

  "credit-applications": {
    summary: "Ce widget liste toutes les demandes de crédit que vous montez pour vos clients, avec leur état d'avancement. Ce sont VOS vraies données : la liste reste vide tant que vous n'avez rien enregistré.",
    howItWorks: ["En haut, un compteur indique le nombre de demandes et rappelle celles « en cours ».","Quatre petits blocs colorés résument les états : bleu = en cours, vert = approuvés, violet = décaissés, rouge = refusés.","Chaque ligne montre l'engin financé, le client, la banque, le montant, la durée, le taux, et votre commission affichée en orange.","Une pastille de couleur sur chaque ligne indique le statut de la demande.","Tout vient de ce que vous saisissez vous-même : il n'y a aucune donnée d'exemple ici."],
    whatToDo: ["Cliquez sur « Nouvelle demande » pour enregistrer une demande de crédit.","Suivez l'avancement de chaque dossier (en cours, approuvé, décaissé) au fil du temps.","Vous pouvez filtrer par période et exporter la liste."],
  },

  "insurance-policies": {
    summary: "Ce widget regroupe les contrats d'assurance de vos clients et vous alerte sur ceux qui arrivent à échéance. Ce sont vos vraies données, vides au départ.",
    howItWorks: ["En haut : le nombre de polices, une alerte orange « échéance < 30j » et une alerte rouge « expirées ».","Chaque ligne affiche le type d'assurance, l'assureur, le client, l'engin, la prime annuelle et votre commission en orange.","La pastille passe au vert (active), à l'orange (bientôt échue, avec le nombre de jours restants) ou au rouge (expirée).","Un bouton « Renouveler » apparaît sur les polices qui expirent, pour les prolonger d'un an en un clic.","Tout provient de ce que vous enregistrez : aucune donnée d'exemple."],
    whatToDo: ["Cliquez sur « Nouvelle police » pour ajouter un contrat.","Renouvelez d'un clic les polices signalées comme bientôt expirées.","Surveillez les alertes de couleur pour relancer vos clients à temps."],
  },

  "commission-tracking": {
    summary: "Ce widget affiche le total de vos commissions (crédit + assurance) et comment elles se répartissent. Le calcul se base sur vos propres demandes et polices ; il reste à zéro tant que rien n'est saisi.",
    howItWorks: ["Un grand chiffre au centre = le total de vos commissions cumulées, avec le montant du mois en cours juste en dessous.","Deux blocs séparent la part « Crédit » (violet) et « Assurance » (bleu), chacun avec son pourcentage ; une petite barre montre la proportion.","En bas : « Encaissées » en vert (crédits déjà décaissés + polices actives) et « Dues — à recouvrer » en orange (approuvées mais pas encore versées).","Ces montants sont additionnés automatiquement à partir de vos demandes de crédit et de vos polices : rien à saisir directement ici."],
    whatToDo: ["Rien à remplir ici : c'est un résumé calculé tout seul.","Pour le faire grimper, ajoutez des demandes de crédit et des polices dans les autres widgets.","Surveillez la case orange « Dues » pour savoir ce qu'il vous reste à encaisser."],
  },

  "client-portfolio": {
    summary: "Ce widget affiche la liste de vos clients et prospects, classés du plus rentable au moins rentable. Ce sont vos vraies données, vides tant que vous n'avez pas créé de clients.",
    howItWorks: ["En haut : le nombre total de clients, combien sont « actifs » et combien sont « prospects ».","Les clients sont triés selon la commission qu'ils vous ont rapportée, les plus rentables en premier.","Chaque ligne montre le nom ou la société, le type, le secteur, la ville, et une pastille de statut (vert = actif, bleu = prospect).","De petites icônes indiquent le nombre de crédits et de polices en cours ; la commission totale du client s'affiche en orange.","Rien n'est inventé : tout vient des clients et contrats que vous enregistrez."],
    whatToDo: ["Créez vos clients depuis l'onglet Clients pour les voir apparaître ici.","Repérez vos meilleurs clients en haut de liste pour les fidéliser.","Repérez les clients marqués « aucun produit » pour leur proposer un crédit ou une assurance."],
  },

  "performance-analytics": {
    summary: "Ce widget montre un graphique de l'évolution de vos commissions sur les 6 derniers mois, crédit contre assurance. Il est calculé sur vos vraies données et reste vide tant qu'aucune commission n'existe.",
    howItWorks: ["Trois blocs en haut : commissions crédit sur 6 mois (violet), commissions assurance sur 6 mois (bleu), et l'évolution en % par rapport au mois précédent (vert si en hausse, rouge si en baisse).","Le graphique affiche, mois par mois, le total de vos commissions.","Le total des 6 mois est rappelé en bas à droite.","Ces chiffres se construisent automatiquement à partir de vos crédits approuvés/décaissés et de vos polices actives."],
    whatToDo: ["Rien à saisir : c'est un tableau de suivi.","Regardez la flèche verte ou rouge pour voir si votre activité progresse d'un mois à l'autre.","Vous pouvez choisir la période affichée et exporter le graphique."],
  },

  "bank-comparator": {
    summary: "Ce widget compare, pour une demande de crédit, les offres de vos banques partenaires (taux, mensualité, coût total) et met en avant la moins chère. Il a besoin que la liste des banques partenaires soit renseignée pour fonctionner.",
    howItWorks: ["Il part de votre dernière demande de crédit (montant + durée) ; s'il n'y en a aucune, il utilise un exemple par défaut de 1 000 000 MAD sur 60 mois, ce qui est clairement indiqué à l'écran.","Trois blocs en haut : la meilleure banque, la mensualité la plus basse, et l'économie réalisée par rapport à l'offre la plus chère.","Chaque ligne correspond à une banque, avec son taux, la durée, les frais, la mensualité et le coût total du crédit.","La meilleure offre est encadrée en vert et marquée « Recommandée » ; les banques qui ne collent pas au montant ou à la durée apparaissent en orange « hors critères ».","Les banques et leurs barèmes doivent être renseignés au préalable ; sinon le widget affiche « Aucune banque partenaire configurée »."],
    whatToDo: ["Faites renseigner les barèmes de vos banques partenaires (taux, durée max, frais) pour activer la comparaison.","Enregistrez une demande de crédit pour comparer sur le vrai montant de votre client.","Présentez à votre client la banque « Recommandée » et le montant d'économie affiché."],
  },
};
