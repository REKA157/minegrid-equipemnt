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
    summary:
      "Ce widget vous donne une note globale sur 100 de votre performance commerciale, avec un classement et des conseils concrets pour vous améliorer. C'est un tableau de bord qui résume, en un coup d'œil, où vous en êtes par rapport à vos objectifs.",
    howItWorks: [
      "La grande note au centre (sur 100) est calculée automatiquement à partir de vos vraies données : vos annonces, les vues et messages qu'elles reçoivent, vos offres, et vos prospects du Kanban. Ces informations viennent du serveur MineGrid, pas d'un chiffre inventé.",
      "La couleur indique la santé : vert (80 et plus) c'est bon, orange (60 à 79) c'est moyen, rouge (moins de 60) c'est à améliorer. La même logique colore aussi les trois cartes du haut (Visibilité, Pipeline, Couverture stock).",
      "En haut à droite, un badge affiche votre rang face aux autres vendeurs (ou « Votre compte » si vous êtes seul). Juste sous la note, vous voyez votre objectif mensuel et combien de points il vous reste à gagner.",
      "Les quatre encadrés (Ventes, Croissance, Pipeline, Réactivité) détaillent chaque aspect, avec une petite flèche de tendance : ↗ ça monte, → stable, ↘ ça baisse.",
      "La section « Recommandations » liste des actions suggérées. Un badge précise l'origine : « Source : serveur » (analyse à distance) ou « analyse locale » (calculée sur votre appareil).",
    ],
    whatToDo: [
      "Cliquez sur la petite flèche à côté de « Recommandations » pour dérouler la liste des conseils et voir quelles actions sont prioritaires (pastille rouge = urgent, orange = moyen, bleu = secondaire).",
      "Utilisez le bouton « Agir » à côté d'une recommandation pour lancer l'action associée. Note : cette exécution est encore en cours d'intégration, un message honnête vous le dira si ce n'est pas encore disponible.",
      "Comparez votre note à votre objectif mensuel pour savoir combien de points il vous reste, puis concentrez vos efforts sur l'encadré le plus faible (celui affiché en rouge ou en orange).",
      "Si le message « Impossible de charger le score » apparaît, vérifiez votre connexion et cliquez sur « Réessayer ».",
    ],
  },

  'sales-evolution': {
    summary:
      "Ce widget montre l'évolution de vos ventes sur les 6 derniers mois, comparées à vos objectifs et à l'année précédente. Il repère tout seul les points d'alerte et propose des actions, des prévisions et un export.",
    howItWorks: [
      "Les chiffres viennent de votre activité réelle sur le site (ventes conclues et offres envoyées), pas d'exemples inventés ; les montants s'affichent dans la devise détectée automatiquement.",
      "Le graphique superpose trois lignes : vos ventes réelles (en orange), votre objectif (ligne grise en pointillés) et l'année précédente (ligne gris clair).",
      "Trois cartes résument le mois en cours : les ventes du mois, le pourcentage d'objectif atteint (vert quand vous êtes proche du but, orange puis rouge s'il reste loin) et l'évolution par rapport à l'an dernier.",
      "Des notifications apparaissent toutes seules selon vos chiffres (objectif loin d'être atteint, offres envoyées sans vente conclue, forte hausse) et proposent à chaque fois une action utile qui renvoie vers vos leads.",
      "Un menu déroulant permet de choisir ce que vous regardez (Ventes, Objectif ou Année précédente) ; un petit bandeau indique d'où viennent les suggestions (serveur du site ou calcul local).",
    ],
    whatToDo: [
      "Cliquez sur « Analyse complète » pour voir le détail mois par mois : ventes, objectif, écart et pourcentage atteint.",
      "Cliquez sur « Prévision IA » pour obtenir une estimation de vos ventes à venir.",
      "Cliquez sur « Benchmark secteur » pour comparer vos résultats à la moyenne du secteur et au top 25 %.",
      "Cliquez sur « Exporter » pour télécharger un rapport de vos ventes.",
    ],
  },

  'stock-status': {
    summary:
      "Ce widget rassemble vos propres annonces de matériel et vous montre lesquelles ont besoin d'attention : celles qui restent trop longtemps en stock ou qui sont peu vues, avec des pistes concrètes pour les revendre plus vite.",
    howItWorks: [
      "Les machines affichées sont vos annonces publiées sur le site, récupérées automatiquement depuis le serveur (rien n'est inventé ; si vous n'avez aucune annonce, la liste reste vide).",
      "Une annonce passe en « alerte » (carte rouge + triangle) quand elle est en stock depuis plus de 60 jours OU quand sa note de visibilité est inférieure à 50 sur 100. Le compteur « X alertes » en haut totalise ces cas.",
      "Les couleurs guident la lecture : vert = tout va bien, orange = à surveiller, rouge = problème. Cela vaut pour les jours en stock et pour le score de visibilité (calculé à partir de la qualité de la fiche : photos, description, prix, vues et contacts réels).",
      "Les deux menus déroulants filtrent la liste par catégorie de matériel et par ancienneté (0-30j, 30-60j, 60j+, 90j+) ; le petit compteur indique combien d'annonces correspondent.",
      "La ligne « Marché : médiane » compare votre prix au prix moyen d'annonces similaires publiées sur le site, et indique de combien de pourcent vous êtes au-dessus ou en dessous.",
    ],
    whatToDo: [
      "Sur chaque annonce, cliquez « Ajouter photo » pour améliorer sa visibilité, ou « Créer offre flash » pour lancer une remise (-15 % pendant 7 jours) enregistrée aussitôt.",
      "Ouvrez le panneau « Stock × prospects » pour voir quelles machines de votre stock correspondent à vos prospects en cours, et copier un texte d'e-mail prêt à envoyer.",
      "Utilisez les filtres catégorie/ancienneté pour repérer d'un coup d'œil les machines prioritaires (les alertes et les plus anciennes remontent en tête).",
      "Depuis le panneau « Raccourcis », exportez votre stock en fichier, ou ouvrez « Marché » pour comparer vos prix aux autres annonces du site.",
    ],
  },

  'transaction-cases': {
    summary:
      "Ce widget affiche la liste de vos dossiers de transaction, c'est-à-dire le suivi de chaque affaire entre un acheteur et un vendeur, depuis la demande de prix jusqu'au paiement et à la livraison. En un coup d'œil, vous voyez combien de dossiers vous concernent et où chacun en est.",
    howItWorks: [
      "La liste vient du serveur : elle regroupe uniquement les dossiers qui vous concernent (vous êtes vendeur, acheteur, participant invité, ou responsable de l'organisation).",
      "Les dossiers les plus récemment mis à jour apparaissent en haut. Le petit chiffre en haut à gauche indique le nombre total de dossiers.",
      "Chaque ligne montre le titre du dossier, puis une ligne de détails : le type (vente, location, financement...), l'étape en cours (par exemple négociation, contrat, paiement, livraison) et, si renseignée, la priorité.",
      "Selon la taille du widget, seuls les 5, 8 ou 12 premiers dossiers sont affichés ; s'il y en a plus, un lien « +X autre(s) » vous permet de voir le reste.",
      "Si rien ne s'affiche, un message explique qu'aucun dossier n'est visible pour vous : un dossier se crée quand un acheteur connecté envoie une demande de prix sur une annonce.",
    ],
    whatToDo: [
      "Cliquez sur un dossier pour l'ouvrir et voir son détail complet.",
      "Cliquez sur « Actualiser » pour recharger la liste et afficher les tout derniers changements.",
      "Utilisez le lien « Liste complète des dossiers » (ou « +X autre(s) ») pour accéder à la vue de tous vos dossiers.",
      "Repérez rapidement l'étape de chaque dossier (par exemple paiement ou livraison) pour savoir lesquels demandent votre attention.",
    ],
  },

  'sales-pipeline': {
    summary:
      "Ce widget suit tous vos prospects commerciaux, du premier contact jusqu'à la vente. Il montre où en est chaque affaire, combien elle peut rapporter, et ce qu'il reste à faire pour la conclure.",
    howItWorks: [
      "Les chiffres viennent de vos vrais prospects enregistrés dans l'outil ; la liste se met à jour toute seule (toutes les 15 secondes et quand vous revenez sur la page).",
      "Chaque prospect avance par étapes colorées : Prospection, Devis, Négociation, Gagné, Non retenu (rouge = perdu, vert = gagné).",
      "Les 4 cases du haut résument le pipeline : nombre de prospects, valeur totale, « valeur pondérée » (le montant ajusté selon les chances de réussite) et taux de conversion.",
      "Les pastilles de couleur indiquent la priorité (Haute, Moyenne, Basse), le rôle du prospect et « À moi » quand l'affaire vous est attribuée.",
      "Les filtres en haut permettent de voir « Mes leads » ou toute l'« Équipe », de choisir une étape, de trier, et de basculer entre les vues Liste, Kanban et Timeline.",
    ],
    whatToDo: [
      "Ajouter un nouveau prospect avec le bouton « Nouveau lead » (nom, valeur estimée, responsable).",
      "Faire avancer une affaire à l'étape suivante avec le bouton orange, ou la marquer « Non retenu » (et la réactiver plus tard).",
      "Ouvrir « Détails » d'un prospect pour voir ses infos, ajouter une note, programmer un appel ou enregistrer une relance.",
      "Filtrer, trier, changer de vue, et télécharger la liste en fichier tableur avec « Exporter ».",
    ],
  },

  'daily-actions': {
    summary:
      "Ce widget rassemble au même endroit les actions commerciales à mener maintenant (rappeler un client, envoyer un devis, relancer, etc.), classées de la plus urgente à la moins urgente. Il vous sert de liste de tâches du jour pour ne rien laisser passer.",
    howItWorks: [
      "Les actions ne sont pas inventées : elles sont construites automatiquement à partir de votre activité réelle (vos opportunités du pipeline/Kanban, vos messages reçus et vos devis/offres). La liste se met à jour toute seule environ chaque minute et quand vous revenez sur la page.",
      "Chaque ligne affiche une pastille de priorité : Haute (rouge), Moyenne (orange) ou Basse (verte). Une étiquette « Kanban » signale les actions qui viennent d'une opportunité de votre pipeline.",
      "L'heure prévue change de couleur selon l'urgence : rouge = en retard, orange = à faire là, jaune = à faire dans l'heure, vert = à venir. À droite s'affiche aussi la valeur estimée en dirhams.",
      "Une petite icône indique l'état de chaque action : à faire, en cours, ou terminée. Le compteur « en attente » en haut vous dit combien il reste à traiter.",
      "En haut, vous filtrez par priorité et par type (appels, emails, rendez-vous, suivi, devis, propositions), vous choisissez le tri (priorité, heure ou valeur) et vous pouvez cocher « Afficher terminées ». Les actions que vous démarrez ou terminez restent mémorisées, elles ne disparaissent pas au rafraîchissement.",
    ],
    whatToDo: [
      "Faites avancer une action : « Démarrer » pour la passer en cours, puis « Terminer » une fois faite. Le menu « ⋯ » permet aussi de « Reprogrammer à demain ».",
      "Contactez directement le client depuis la ligne : bouton « WhatsApp » pour ouvrir la conversation, ou « ⋯ » puis « Appeler » pour lancer un appel (le bouton « Appels » en haut sert à régler la téléphonie).",
      "Utilisez les filtres et le tri pour vous concentrer, par exemple n'afficher que la priorité Haute ou trier par valeur pour viser les plus gros montants d'abord.",
      "Le bouton « Exporter » télécharge un vrai fichier (CSV) des actions affichées. Attention : les autres boutons d'automatisation (relance auto, planifier, rapport IA…) sont pour l'instant en démonstration et ne font encore rien de réel.",
    ],
  },

  'ai-insights': {
    summary:
      "Ce widget vous dresse la liste des actions les plus utiles à faire maintenant sur votre activité : relancer un acheteur, traiter un devis en attente, surveiller un dossier à risque ou saisir une opportunité. Chaque suggestion vient de vos vraies données (annonces, devis, leads, dossiers, partenaires), jamais d'un exemple inventé.",
    howItWorks: [
      "Les suggestions sont calculées à partir de vos propres données : une annonce très vue mais sans devis, un devis reçu mais sans dossier ouvert, un lead ou un devis sans réponse depuis plus de 7 jours, un partenaire à assigner ou surchargé, ou un dossier jugé à risque.",
      "Chaque carte porte une pastille de priorité : « Urgent » (rouge) demande d'agir tout de suite, « Prioritaire » (orange) est important, « À noter » (gris) peut attendre. Les plus urgentes sont affichées en haut.",
      "Sur chaque carte vous voyez le titre, la raison en clair, et une petite mention « Source » qui indique d'où vient l'info (par exemple vos devis, vos leads ou vos dossiers) — c'est la preuve, pas une invention.",
      "Si le serveur d'analyse est disponible, une section « Insights du serveur IA » peut s'ajouter en haut, marquée d'un badge « IA » ; sinon elle n'apparaît tout simplement pas.",
      "S'il n'y a rien d'important à signaler, le widget affiche un court message vide plutôt que de remplir l'écran ; pendant le calcul, il affiche « Analyse… ».",
    ],
    whatToDo: [
      "Cliquez sur le lien d'action en bas de chaque carte (par exemple « Relancer », « Répondre / relancer » ou « Créer le dossier ») pour aller directement à l'écran concerné et traiter le point.",
      "Commencez par les cartes rouges « Urgent », puis les oranges « Prioritaire », pour vous occuper d'abord de ce qui compte le plus.",
      "Améliorez une annonce très vue mais sans devis (prix, photos, inspection) quand la suggestion vous le propose.",
      "Assignez ou remplacez un partenaire, ou vérifiez un dossier à risque avant de sécuriser le paiement, en suivant l'action indiquée sur la carte.",
    ],
  },

  'ai-optimization': {
    summary:
      "Ce widget vous propose des conseils générés automatiquement pour améliorer vos annonces (prix, visibilité dans les recherches, contenu, marketing) et attirer plus d'acheteurs. Il n'affiche des suggestions que lorsqu'une vraie amélioration possible est repérée sur vos propres annonces.",
    howItWorks: [
      "Les suggestions sont calculées à partir de vos propres annonces (elles peuvent aussi venir d'un service d'analyse en ligne) ; s'il n'y a rien à améliorer, le widget reste vide avec le message « Aucune optimisation suggérée ».",
      "Chaque conseil est rangé dans une catégorie reconnaissable à sa couleur : visibilité/SEO en bleu, Prix en vert, Contenu en violet, Marketing en orange.",
      "Une pastille de priorité montre l'urgence du conseil : rouge = priorité haute, orange = moyenne, vert = basse.",
      "Chaque carte affiche une liste d'« Actions recommandées » (cochées en vert) et un « Impact attendu », c'est-à-dire le gain espéré.",
      "Tout en bas, un récapitulatif compte le nombre de suggestions et indique combien sont en priorité haute ou moyenne.",
    ],
    whatToDo: [
      "Utilisez les onglets du haut (Toutes, SEO, Prix, Contenu, Marketing) pour n'afficher qu'un type de conseil ; le chiffre entre parenthèses indique combien il y en a.",
      "Lisez chaque carte et appliquez les actions proposées sur vos annonces, en commençant par les pastilles rouges (priorité haute).",
      "Cliquez sur le bouton d'actualisation (la flèche ronde en haut à droite) pour relancer l'analyse après avoir modifié vos annonces.",
    ],
  },
};
