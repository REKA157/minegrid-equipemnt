

export const getDailyActionsData = (widgetId: string) => {
  // Générer des actions commerciales prioritaires enrichies et réalistes
  const generatePriorityActions = () => {
    const actions = [
      {
        id: 1,
        title: 'Relancer Ahmed Benali - Prospect chaud',
        description: 'A consulté votre CAT 320D 3 fois cette semaine. Prêt à acheter.',
        priority: 'high',
        category: 'prospection',
        impact: '+85%',
        impactDescription: 'Probabilité de conversion',
        estimatedTime: '15 min',
        status: 'pending',
        contact: {
          name: 'Ahmed Benali',
          phone: '+212 6 12 34 56 78',
          email: 'ahmed.benali@construction.ma',
          company: 'Construction Benali SARL',
          lastContact: '2024-01-20'
        },
        action: 'Appel de suivi + envoi devis personnalisé',
        notes: 'Intéressé par financement leasing. Budget 450k MAD.',
        deadline: '2024-01-25'
      },
      {
        id: 2,
        title: 'Finaliser devis CAT 950GC - Mines du Sud',
        description: 'Devis en cours depuis 5 jours. Client impatient.',
        priority: 'high',
        category: 'devis',
        impact: '+70%',
        impactDescription: 'Chance de vente',
        estimatedTime: '30 min',
        status: 'pending',
        contact: {
          name: 'Fatima Zahra',
          phone: '+212 6 98 76 54 32',
          email: 'f.zahra@minesdusud.ma',
          company: 'Mines du Sud SA',
          lastContact: '2024-01-18'
        },
        action: 'Finaliser devis + appel de présentation',
        notes: 'Demande spécifique: godet de 1.2m³, chenilles larges.',
        deadline: '2024-01-23'
      },
      {
        id: 3,
        title: 'Appel de relance - 12 prospects inactifs',
        description: 'Prospects qui n\'ont pas été contactés depuis 7+ jours.',
        priority: 'medium',
        category: 'relance',
        impact: '+25%',
        impactDescription: 'Taux de réactivation',
        estimatedTime: '45 min',
        status: 'pending',
        contact: {
          name: 'Liste de 12 prospects',
          phone: 'Voir détails',
          email: 'campagne@minegrid.ma',
          company: 'Diverses entreprises',
          lastContact: '2024-01-15'
        },
        action: 'Campagne d\'appels + emails personnalisés',
        notes: 'Focus sur 3 prospects prioritaires restants.',
        deadline: '2024-01-26'
      },
      {
        id: 4,
        title: 'Réduire prix CAT 320D - Stock ancien',
        description: 'Machine en stock depuis 92 jours. Prix à ajuster.',
        priority: 'medium',
        category: 'pricing',
        impact: '+40%',
        impactDescription: 'Augmentation vues',
        estimatedTime: '10 min',
        status: 'pending',
        contact: {
          name: 'Équipe marketing',
          phone: 'N/A',
          email: 'marketing@minegrid.ma',
          company: 'Minegrid Équipement',
          lastContact: '2024-01-22'
        },
        action: 'Réduction de 2.5% + boost visibilité',
        notes: 'Prix actuel: 380k MAD → Nouveau: 370.5k MAD',
        deadline: '2024-01-24'
      },
      {
        id: 5,
        title: 'Publier annonce compacteur - Forte demande',
        description: 'Forte demande détectée à Casablanca cette semaine.',
        priority: 'medium',
        category: 'marketing',
        impact: '+60%',
        impactDescription: 'Prospects qualifiés',
        estimatedTime: '25 min',
        status: 'pending',
        contact: {
          name: 'Équipe technique',
          phone: 'N/A',
          email: 'tech@minegrid.ma',
          company: 'Minegrid Équipement',
          lastContact: '2024-01-22'
        },
        action: 'Créer annonce optimisée SEO + photos',
        notes: 'Mots-clés: compacteur, Casablanca, location, vente.',
        deadline: '2024-01-25'
      },
      {
        id: 6,
        title: 'Suivi paiement - Location CAT 330D',
        description: 'Paiement en retard de 3 jours. Client à contacter.',
        priority: 'high',
        category: 'finance',
        impact: '+95%',
        impactDescription: 'Récupération paiement',
        estimatedTime: '20 min',
        status: 'pending',
        contact: {
          name: 'Mohammed Alami',
          phone: '+212 6 11 22 33 44',
          email: 'm.alami@batiplus.ma',
          company: 'Bati Plus Construction',
          lastContact: '2024-01-19'
        },
        action: 'Appel de relance + envoi rappel',
        notes: 'Montant: 15k MAD. Raison: problème bancaire.',
        deadline: '2024-01-23'
      },
      {
        id: 7,
        title: 'Préparer présentation JCB - Projet autoroute',
        description: 'Appel d\'offres autoroute Tanger-Casablanca. Présentation technique requise.',
        priority: 'high',
        category: 'appel_offres',
        impact: '+90%',
        impactDescription: 'Chance de sélection',
        estimatedTime: '60 min',
        status: 'pending',
        contact: {
          name: 'Karim Mansouri',
          phone: '+212 6 55 66 77 88',
          email: 'k.mansouri@autoroutes.ma',
          company: 'Autoroutes du Maroc',
          lastContact: '2024-01-21'
        },
        action: 'Préparer présentation technique + fiches produits',
        notes: 'Projet de 2.5M MAD. Focus sur JCB 3CX et 4CX.',
        deadline: '2024-01-27'
      },
      {
        id: 8,
        title: 'Relance devis Komatsu - Carrière Agadir',
        description: 'Devis envoyé il y a 4 jours. Aucune réponse du client.',
        priority: 'medium',
        category: 'relance',
        impact: '+35%',
        impactDescription: 'Probabilité de réponse',
        estimatedTime: '20 min',
        status: 'pending',
        contact: {
          name: 'Hassan Tazi',
          phone: '+212 6 44 55 66 77',
          email: 'h.tazi@carriereagadir.ma',
          company: 'Carrière Agadir SA',
          lastContact: '2024-01-17'
        },
        action: 'Appel de relance + envoi rappel par email',
        notes: 'Devis Komatsu PC200-8. Montant: 680k MAD.',
        deadline: '2024-01-24'
      },
      {
        id: 9,
        title: 'Mise à jour catalogue produits',
        description: 'Nouveaux modèles CAT et JCB à ajouter au catalogue.',
        priority: 'low',
        category: 'marketing',
        impact: '+15%',
        impactDescription: 'Amélioration visibilité',
        estimatedTime: '40 min',
        status: 'pending',
        contact: {
          name: 'Équipe marketing',
          phone: 'N/A',
          email: 'marketing@minegrid.ma',
          company: 'Minegrid Équipement',
          lastContact: '2024-01-22'
        },
        action: 'Ajouter 5 nouveaux modèles + photos HD',
        notes: 'CAT 320D2, JCB 3CX, Komatsu PC200-8, etc.',
        deadline: '2024-01-28'
      }
    ];

    console.log('[DEBUG] Actions commerciales générées:', actions);
    return actions;
  };

  return generatePriorityActions();
};
