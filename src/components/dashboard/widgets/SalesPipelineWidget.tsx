import React, { useState, useEffect } from 'react';
import {
  Plus, ChevronUp, ChevronDown, AlertTriangle, FileText, Star, TrendingUp, Info, X,
  Calendar, Download, Send, Target, Users, TrendingDown, ChevronRight, ListFilter,
} from 'lucide-react';
import { apiCall, showNotification, sendMessage, exportData } from '../../../services/apiService';
import { getDashboardStats } from '../../../utils/api';
import { RealPipelineService } from '../../../services/realPipelineService';
import { prospectKindOfLead, prospectKindLabel } from '../../../utils/monitorProspectMatch';
import { toast } from '../../../utils/toast';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';
import { getRentalPipelineLeads } from '../../../utils/enterpriseApi/rentals';
import { leadTitleWithoutAoPrefix } from '../../../utils/stockLeadSuggestions';

/** Titre fiche : texte complet pour `title` / modale ; version courte pour cartes étroites (Kanban). */
function leadTitleForCard(title: unknown): { full: string; compact: string } {
  const full = String(title ?? 'Sans titre').trim() || 'Sans titre';
  const compact = (leadTitleWithoutAoPrefix(full).trim() || full).trim();
  return { full, compact };
}

function TransactionDossierLink({
  caseId,
  className = '',
  stopClickBubble = false,
}: {
  caseId?: string | null;
  className?: string;
  stopClickBubble?: boolean;
}) {
  if (!caseId) return null;
  return (
    <a
      href={`#dossier/${caseId}`}
      className={className}
      onClick={stopClickBubble ? (e) => e.stopPropagation() : undefined}
    >
      Dossier
    </a>
  );
}
// Correction : data doit être de type { leads: any[] }
const SalesPipelineWidget = ({
  data,
  variant = 'sales',
}: {
  data?: { leads: any[] };
  variant?: 'sales' | 'rental';
}) => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'value' | 'probability' | 'lastContact'>('value');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showLeadDetails, setShowLeadDetails] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  // Correction : initialiser leadsData une seule fois
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'timeline'>('list');
  const [prospectFilter, setProspectFilter] = useState<'all' | 'winner' | 'buyer'>('all');
  const [showPipelineAlertsOpen, setShowPipelineAlertsOpen] = useState(false);
  const [showConversionRates, setShowConversionRates] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [realData, setRealData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrency } = useWidgetMadCurrency();

  const loadRentalPipelineData = async () => {
    try {
      setLoading(true);
      setError(null);
      const leads = await getRentalPipelineLeads();
      setLeadsData(
        leads.map((l) => ({
          ...l,
          contact: l.contact || {
            name: l.company,
            company: l.company,
            phone: l.phone,
            email: l.email,
          },
        })),
      );
    } catch (e) {
      console.error(e);
      setError('Impossible de charger le pipeline location');
      setLeadsData([]);
    } finally {
      setLoading(false);
    }
  };

    // Fonction pour charger les vraies données depuis Supabase
  const loadRealData = async () => {
    try {
      setLoading(true);
      setError(null);
      const realLeads = await RealPipelineService.getLeads();

      // Éviter le polling des tables optionnelles (pipeline_actions/pipeline_insights)
      // qui peuvent ne pas exister en prod initiale.
      const statsRes = await Promise.allSettled([getDashboardStats()]);
      const dashboardStats = statsRes[0].status === 'fulfilled' ? statsRes[0].value : {};
      
      // Convertir les leads réels au format attendu par le widget
      const formattedLeads = realLeads.map(lead => ({
        id: lead.id,
        title: lead.title,
        stage: lead.stage,
        priority: lead.priority,
        value: lead.value,
        probability: lead.probability,
        nextAction: lead.next_action || 'Action à définir',
        assignedTo: lead.assigned_to,
        lastContact: lead.last_contact,
        notes: lead.notes || '',
        source: lead.source || 'manual',
        prospectKind: prospectKindOfLead(lead), // lauréat / maître d'ouvrage (AO) — badge + filtre
        transaction_case_id: lead.transaction_case_id ?? null,
        contact: {
          name: lead.contact_name || 'Non spécifié',
          company: lead.contact_company || 'Non spécifié',
          phone: lead.contact_phone || '',
          email: lead.contact_email || ''
        }
      }));
      
      setLeadsData(formattedLeads);
      setRealData({
        ...dashboardStats,
        pipelineStats: {
          totalLeads: realLeads.length,
          totalActions: 0,
          totalInsights: 0,
          syncResult: {
            leadsFromMessages: 0,
            leadsFromOffers: 0,
            actionsCreated: 0,
            insightsGenerated: 0,
          }
        }
      });
      
    } catch (error) {
      console.error("❌ Erreur lors du chargement des données réelles du pipeline:", error);
      setError("Impossible de charger les données réelles. Vérifiez votre connexion.");
      // En cas d'erreur, on garde un tableau vide
      setLeadsData([]);
    } finally {
      setLoading(false);
    }
  };

  // Charger les données au montage : ventes OU locations selon le contexte dashboard
  useEffect(() => {
    if (variant === 'rental') {
      void loadRentalPipelineData();
      const onRefresh = () => void loadRentalPipelineData();
      window.addEventListener('pipeline:refresh', onRefresh as EventListener);
      const intervalId = window.setInterval(onRefresh, 30000);
      return () => {
        window.removeEventListener('pipeline:refresh', onRefresh as EventListener);
        window.clearInterval(intervalId);
      };
    }

    void loadRealData();

    const onRefreshSales = () => {
      void loadRealData();
    };
    const onFocus = () => {
      void loadRealData();
    };

    window.addEventListener('pipeline:refresh', onRefreshSales as EventListener);
    window.addEventListener('focus', onFocus);
    const intervalIdSales = window.setInterval(onRefreshSales, 15000);

    return () => {
      window.removeEventListener('pipeline:refresh', onRefreshSales as EventListener);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalIdSales);
    };
  }, [variant]);

  function getDaysSinceLastContact(dateString: string) {
    const lastContact = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - lastContact.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  const pipelineStats = React.useMemo(() => {
    const stages = ['Prospection', 'Devis', 'Négociation', 'Conclu', 'Perdu'];
    const stats = {
      total: leadsData.length,
      totalValue: leadsData.reduce((sum, lead) => sum + (lead.value || 0), 0),
      weightedValue: leadsData.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0),
      byStage: {} as Record<string, { count: number; value: number; weightedValue: number }>
    };
    stages.forEach(stage => {
      const stageLeads = leadsData.filter(lead => lead.stage === stage);
      stats.byStage[stage] = {
        count: stageLeads.length,
        value: stageLeads.reduce((sum, lead) => sum + (lead.value || 0), 0),
        weightedValue: stageLeads.reduce((sum, lead) => sum + ((lead.value || 0) * (lead.probability || 0) / 100), 0)
      };
    });
    return stats;
  }, [leadsData]);

  const calculateConversionRates = React.useMemo(() => {
    const stages = ['Prospection', 'Devis', 'Négociation', 'Conclu', 'Perdu'];
    const rates: Record<string, number> = {};
    const totalLeads = leadsData.length;
    const wonLeads = leadsData.filter(lead => lead.stage === 'Conclu').length;
    rates.global = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    stages.forEach((stage, index) => {
      if (index < stages.length - 1) {
        const currentStageLeads = leadsData.filter(lead => lead.stage === stage).length;
        const nextStageLeads = leadsData.filter(lead => lead.stage === stages[index + 1]).length;
        rates[stage] = currentStageLeads > 0 ? (nextStageLeads / currentStageLeads) * 100 : 0;
      }
    });
    return rates;
  }, [leadsData]);

  /** Alertes = heuristiques sur les leads chargés (pas de modèle IA — voir widget « Insights IA »). */
  const pipelineHeuristicAlerts = React.useMemo(() => {
    const insights = [];
    const stuckLeads = leadsData.filter(lead => {
      const daysSinceContact = getDaysSinceLastContact(lead.lastContact);
      return daysSinceContact > 7 && lead.stage !== 'Conclu' && lead.stage !== 'Perdu';
    });
    if (stuckLeads.length > 0) {
      insights.push({
        type: 'blockage',
        title: 'Leads bloqués détectés',
        description: `${stuckLeads.length} leads sans contact depuis plus de 7 jours`,
        priority: 'high',
        action: 'Relancer les prospects bloqués',
        leads: stuckLeads
      });
    }
    const quotesWithoutFollowUp = leadsData.filter(lead => 
      lead.stage === 'Devis' && getDaysSinceLastContact(lead.lastContact) > 3
    );
    if (quotesWithoutFollowUp.length > 0) {
      insights.push({
        type: 'quote',
        title: 'Devis sans relance',
        description: `${quotesWithoutFollowUp.length} devis envoyés sans suivi`,
        priority: 'medium',
        action: 'Programmer des relances automatiques',
        leads: quotesWithoutFollowUp
      });
    }
    const highValueLeads = leadsData.filter(lead => 
      lead.value > 500000 && lead.stage !== 'Conclu' && lead.stage !== 'Perdu'
    );
    if (highValueLeads.length > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Opportunités à forte valeur',
        description: `${highValueLeads.length} leads de plus de 500k MAD`,
        priority: 'high',
        action: 'Prioriser le suivi de ces prospects',
        leads: highValueLeads
      });
    }
    const lowConversionStages = Object.entries(calculateConversionRates).filter(([stage, rate]) => 
      stage !== 'global' && (rate as number) < 20
    );
    if (lowConversionStages.length > 0) {
      insights.push({
        type: 'conversion',
        title: 'Taux de conversion faibles',
        description: `Étapes avec conversion < 20%: ${lowConversionStages.map(([stage]) => stage).join(', ')}`,
        priority: 'medium',
        action: 'Analyser et optimiser le processus de vente',
        stages: lowConversionStages
      });
    }
    return insights;
  }, [leadsData, calculateConversionRates]);

  const sortedLeads = React.useMemo(() => {
    let sorted = [...leadsData];
    if (selectedStage) {
      sorted = sorted.filter(lead => lead.stage === selectedStage);
    }
    if (prospectFilter !== 'all') {
      sorted = sorted.filter((lead) => lead.prospectKind === prospectFilter);
    }
    switch (sortBy) {
      case 'value':
        return sorted.sort((a, b) => (b.value || 0) - (a.value || 0));
      case 'probability':
        return sorted.sort((a, b) => (b.probability || 0) - (a.probability || 0));
      case 'lastContact':
        return sorted.sort((a, b) => new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime());
      default:
        return sorted;
    }
  }, [leadsData, selectedStage, sortBy, prospectFilter]);

  const getStageColor = (stage: string) => {
    const colors = {
      'Prospection': 'bg-orange-100 text-orange-800',
      'Devis': 'bg-orange-200 text-orange-900',
      'Négociation': 'bg-orange-400 text-white',
      'Conclu': 'bg-green-500 text-white',
      'Perdu': 'bg-red-500 text-white'
    };
    return colors[stage as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatStageLabel = (stage: string) => {
    if (stage === 'Conclu') return 'Gagné';
    if (stage === 'Perdu') return 'Non retenu';
    return stage;
  };
  
  const getPriorityColor = (priority: string) => {
    const colors = {
      'high': 'bg-red-100 text-red-800',
      'medium': 'bg-orange-100 text-orange-800',
      'low': 'bg-green-100 text-green-800'
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Fonctions de gestion des événements
  const handleViewDetails = (lead: any) => {
    setSelectedLead(lead);
    setShowLeadDetails(true);
  };

  const applyLeadLocalUpdate = (leadId: string, updates: Record<string, unknown>) => {
    setLeadsData((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...updates } : l)));
    setSelectedLead((prev: any) => (prev && prev.id === leadId ? { ...prev, ...updates } : prev));
  };

  const persistLeadUpdate = async (
    leadId: string,
    updates: Partial<{
      stage: string;
      probability: number;
      nextAction: string;
      lastContact: string;
    }>,
  ) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.stage != null) dbUpdates.stage = updates.stage;
    if (updates.probability != null) dbUpdates.probability = updates.probability;
    if (updates.nextAction != null) dbUpdates.next_action = updates.nextAction;
    if (updates.lastContact != null) dbUpdates.last_contact = updates.lastContact;

    const saved = await RealPipelineService.updateLead(leadId, dbUpdates);
    if (!saved) {
      toast.error("Échec de sauvegarde du lead dans la base.");
      return;
    }
    window.dispatchEvent(new Event('pipeline:refresh'));
  };

  const getNextActionForStage = (stage: string) => {
    const actions = {
      'Prospection': 'Qualifier le besoin et identifier les décideurs',
      'Devis': 'Préparer et envoyer le devis',
      'Négociation': 'Programmer une réunion de négociation',
      'Conclu': 'Déclencher la commande et préparer la livraison',
      'Perdu': 'Analyser les motifs de non-retention et préparer la relance'
    };
    return actions[stage as keyof typeof actions] || 'Action à définir';
  };

  const getPrimaryActionLabel = (stage: string) => {
    if (stage === 'Prospection') return 'Passer en devis';
    if (stage === 'Devis') return 'Passer en négociation';
    if (stage === 'Négociation') return 'Marquer gagné';
    if (stage === 'Perdu') return 'Réactiver';
    return 'Finalisé';
  };

  const handleSetStage = (
    lead: any,
    targetStage: 'Prospection' | 'Devis' | 'Négociation' | 'Conclu' | 'Perdu',
    customAction?: string,
  ) => {
    const nextProbability = targetStage === 'Perdu'
      ? Math.min(lead.probability || 0, 30)
      : targetStage === 'Conclu'
        ? 100
        : Math.min((lead.probability || 0) + 20, 100);
    const nextAction = customAction || getNextActionForStage(targetStage);
    const lastContact = new Date().toISOString();

    applyLeadLocalUpdate(lead.id, {
      stage: targetStage,
      probability: nextProbability,
      nextAction,
      lastContact,
    });
    void persistLeadUpdate(lead.id, {
      stage: targetStage,
      probability: nextProbability,
      nextAction,
      lastContact,
    });
  };

  const handleNextStage = (lead: any) => {
    const stages = ['Prospection', 'Devis', 'Négociation', 'Conclu'];
    const currentIndex = stages.indexOf(lead.stage);

    if (currentIndex < stages.length - 1) {
      const nextStage = stages[currentIndex + 1];
      handleSetStage(lead, nextStage as 'Prospection' | 'Devis' | 'Négociation' | 'Conclu');

      // Notification de succès
      const stageNames = {
        'Devis': 'Devis',
        'Négociation': 'Négociation',
        'Conclu': 'Vente conclue',
        'Perdu': 'Non retenu'
      };
      toast(`✅ Lead passé à l'étape: ${stageNames[nextStage as keyof typeof stageNames] || nextStage}`);
    } else {
      toast('🎉 Ce lead est déjà à la dernière étape commerciale !');
    }
  };

  const handleEditLead = (lead: any) => {
    setEditForm({
      id: lead.id,
      title: lead.title,
      stage: lead.stage,
      value: lead.value,
      probability: lead.probability,
      nextAction: lead.nextAction,
      assignedTo: lead.assignedTo,
      notes: lead.notes || ''
    });
    setShowEditForm(true);
  };

  const handleSaveEdit = () => {
    const updatedLeads = leadsData.map(l => {
      if (l.id === editForm.id) {
        return { ...l, ...editForm };
      }
      return l;
    });
    setLeadsData(updatedLeads);
    setShowEditForm(false);
    setEditForm({});
    toast('✅ Lead modifié avec succès');
  };

  const handleAddNote = () => {
    const note = prompt('Ajouter une note:');
    if (note && selectedLead) {
      const updatedLeads = leadsData.map(l => {
        if (l.id === selectedLead.id) {
          return {
            ...l,
            notes: l.notes ? `${l.notes}\n${new Date().toLocaleDateString()}: ${note}` : `${new Date().toLocaleDateString()}: ${note}`
          };
        }
        return l;
      });
      setLeadsData(updatedLeads);
      setSelectedLead({
        ...selectedLead,
        notes: selectedLead.notes ? `${selectedLead.notes}\n${new Date().toLocaleDateString()}: ${note}` : `${new Date().toLocaleDateString()}: ${note}`
      });
      toast('✅ Note ajoutée avec succès');
    }
  };

  const handleScheduleCall = () => {
    const date = prompt('Date du rendez-vous (YYYY-MM-DD):');
    const time = prompt('Heure du rendez-vous (HH:MM):');
    if (date && time && selectedLead) {
      const appointment = `Rendez-vous programmé: ${date} à ${time}`;
      const updatedLeads = leadsData.map(l => {
        if (l.id === selectedLead.id) {
          return {
            ...l,
            nextAction: appointment,
            lastContact: date
          };
        }
        return l;
      });

      setLeadsData(updatedLeads);

      // Mettre à jour le lead sélectionné
      setSelectedLead({
        ...selectedLead,
        nextAction: appointment,
        lastContact: date
      });

      toast('✅ Rendez-vous programmé avec succès');
    }
  };

  const handleAddNewLead = () => {
    const newLead = {
      id: `lead-${Date.now()}`,
      title: prompt('Nom du prospect:') || 'Nouveau prospect',
      stage: 'Prospection',
      priority: 'medium',
      value: parseInt(prompt('Valeur estimée (MAD):') || '0'),
      probability: 10,
      nextAction: 'Premier contact',
      assignedTo: prompt('Assigné à:') || 'Commercial',
      lastContact: new Date().toISOString().split('T')[0],
      notes: ''
    };

    if (newLead.title !== 'Nouveau prospect') {
      setLeadsData([...leadsData, newLead]);
      toast('✅ Nouveau lead ajouté avec succès');
    }
  };

  const handleAIInsightAction = (insight: any) => {
    switch (insight.type) {
      case 'blockage':
        handleRelanceAutomatique();
        break;
      case 'quote': {
        const lead = insight.leads?.[0];
        if (lead) handleSendFollowup(lead);
        else showNotification('warning', 'Aucun lead cible pour cette alerte');
        break;
      }
      case 'opportunity': {
        const lead = insight.leads?.[0];
        if (lead) handleScheduleMeeting(lead);
        else showNotification('warning', 'Aucun lead cible pour cette alerte');
        break;
      }
      case 'conversion':
        handleAnalysePerformance();
        break;
    }
  };

  // Actions rapides avec réactivité maximale
  const handleQuickAction = (action: string, lead?: any, e?: React.MouseEvent) => {
    const button = e?.currentTarget as HTMLButtonElement | undefined;
    if (button) {
      button.disabled = true;
      button.style.opacity = '0.6';
      button.style.cursor = 'not-allowed';
    }

    // Notification immédiate
    showNotification('info', `Exécution de ${action}...`);
    
    // Actions synchrones immédiates
    switch (action) {
      case 'add-lead':
        handleAddLead();
        break;
      case 'export-pipeline':
        handleExportPipeline();
        break;
      case 'send-followup':
        handleSendFollowup(lead);
        break;
      case 'schedule-meeting':
        handleScheduleMeeting(lead);
        break;
      case 'generate-report':
        handleGenerateReport();
        break;
      case 'relance-automatique':
        handleRelanceAutomatique();
        break;
      case 'analyse-performance':
        handleAnalysePerformance();
        break;
      case 'optimisation-ia':
        handleOptimisationIA();
        break;
      default:
        showNotification('warning', `L'action "${action}" n'est pas encore implémentée`);
    }

    // Restaurer le bouton immédiatement après l'action
    setTimeout(() => {
      if (button) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
      }
    }, 100);
  };

  const handleAddLead = () => {
    try {
      window.location.href = '/#leads';
    } catch (error) {
      console.error('Erreur lors de l\'ajout du lead:', error);
      showNotification('error', 'Impossible d\'ajouter le lead');
    }
  };

  const handleExportPipeline = () => {
    try {
      // Préparer les données immédiatement
      const pipelineData = leadsData.map(lead => ({
        'Titre': lead.title,
        'Étape': lead.stage,
        'Priorité': lead.priority,
        'Valeur': lead.value,
        'Probabilité': lead.probability,
        'Prochaine action': lead.nextAction,
        'Assigné à': lead.assignedTo,
        'Dernier contact': lead.lastContact,
        'Notes': lead.notes
      }));
      
      // Export immédiat (sans await)
      exportData(pipelineData, `pipeline-commercial-${new Date().toISOString().split('T')[0]}`, 'excel');
      showNotification('success', 'Export du pipeline réussi');
      
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      showNotification('error', 'Impossible d\'exporter le pipeline');
    }
  };

  const handleSendFollowup = (lead?: any) => {
    try {
      if (!lead) {
        showNotification('warning', 'Sélectionnez un lead pour envoyer un suivi');
        return;
      }

      // Mise à jour immédiate de l'interface
      setLeadsData(prev => prev.map(l => 
        l.id === lead.id 
          ? { ...l, lastContact: new Date().toISOString() }
          : l
      ));
      
      showNotification('success', `Suivi envoyé pour ${lead.title}`);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pipeline/followup', { leadId: lead.id }).catch(error => {
          console.error('Erreur API suivi:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de l\'envoi du suivi:', error);
      showNotification('error', 'Impossible d\'envoyer le suivi');
    }
  };

  const handleScheduleMeeting = (lead?: any) => {
    try {
      if (!lead) {
        showNotification('warning', 'Sélectionnez un lead pour programmer un rendez-vous');
        return;
      }

      // Mise à jour immédiate de l'interface
      setLeadsData(prev => prev.map(l => 
        l.id === lead.id 
          ? { ...l, nextAction: 'Rendez-vous programmé' }
          : l
      ));
      
      showNotification('success', `Rendez-vous programmé pour ${lead.title}`);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pipeline/meeting', { leadId: lead.id }).catch(error => {
          console.error('Erreur API rendez-vous:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la programmation du rendez-vous:', error);
      showNotification('error', 'Impossible de programmer le rendez-vous');
    }
  };

  const handleGenerateReport = () => {
    try {
      // Calcul immédiat
      const report = {
        totalLeads: leadsData.length,
        leadsByStage: leadsData.reduce((acc, lead) => {
          acc[lead.stage] = (acc[lead.stage] || 0) + 1;
          return acc;
        }, {}),
        totalValue: leadsData.reduce((sum, lead) => sum + lead.value, 0),
        averageProbability: Math.round(leadsData.reduce((sum, lead) => sum + lead.probability, 0) / Math.max(leadsData.length, 1))
      };

      showNotification('success', 'Rapport généré avec succès');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pipeline/report', report).catch(error => {
          console.error('Erreur API rapport:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la génération du rapport:', error);
      showNotification('error', 'Impossible de générer le rapport');
    }
  };

  const handleRelanceAutomatique = () => {
    try {
      // Mise à jour immédiate de l'interface
      const leadsToRelance = leadsData.filter(lead => lead.probability < 50);
      setLeadsData(prev => prev.map(lead => 
        lead.probability < 50 
          ? { ...lead, nextAction: 'Relance automatique programmée' }
          : lead
      ));
      
      showNotification('success', `Relance automatique activée pour ${leadsToRelance.length} leads`);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pipeline/relance', { leadIds: leadsToRelance.map(l => l.id) }).catch(error => {
          console.error('Erreur API relance:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de l\'activation de la relance:', error);
      showNotification('error', 'Impossible d\'activer la relance automatique');
    }
  };

  const handleAnalysePerformance = () => {
    try {
      // Calcul immédiat
      const analysis = {
        totalLeads: leadsData.length,
        conversionRate: leadsData.filter(l => l.stage === 'Négociation').length / Math.max(leadsData.length, 1) * 100,
        averageValue: Math.round(leadsData.reduce((sum, l) => sum + l.value, 0) / Math.max(leadsData.length, 1)),
        stageDistribution: leadsData.reduce((acc, lead) => {
          acc[lead.stage] = (acc[lead.stage] || 0) + 1;
          return acc;
        }, {})
      };

      showNotification('success', 'Analyse de performance terminée');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pipeline/analyse', analysis).catch(error => {
          console.error('Erreur API analyse:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error);
      showNotification('error', 'Impossible d\'analyser la performance');
    }
  };

  const handleOptimisationIA = () => {
    try {
      // Calcul immédiat
      const optimizations = leadsData.map(lead => ({
        id: lead.id,
        title: lead.title,
        currentStage: lead.stage,
        suggestedAction: lead.probability < 30 ? 'Relancer' : lead.probability > 70 ? 'Finaliser' : 'Négocier',
        priority: lead.value > 200000 ? 'high' : lead.value > 100000 ? 'medium' : 'low'
      }));

      showNotification('success', 'Optimisation IA terminée');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/pipeline/optimisation', { optimizations }).catch(error => {
          console.error('Erreur API optimisation:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de l\'optimisation:', error);
      showNotification('error', 'Impossible d\'optimiser le pipeline');
    }
  };

  const handleViewKanban = () => {
    setViewMode('kanban');
  };

  const handleViewTimeline = () => {
    setViewMode('timeline');
  };

  const handleViewList = () => {
    setViewMode('list');
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'blockage': return <AlertTriangle className="w-4 h-4" />;
      case 'quote': return <FileText className="w-4 h-4" />;
      case 'opportunity': return <Star className="w-4 h-4" />;
      case 'conversion': return <TrendingUp className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'blockage': return 'text-red-600 bg-red-50 border-red-200';
      case 'quote': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'opportunity': return 'text-green-600 bg-green-50 border-green-200';
      case 'conversion': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-4 bg-orange-50 p-4 rounded-lg border border-orange-200">
      {/* En-tête avec bouton d'ajout */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-orange-900">{variant === 'rental' ? 'Pipeline de location' : 'Pipeline Commercial'}</h3>
          <p className="text-sm text-orange-600">
            {loading ? 'Chargement des données réelles...' : error ? 'Erreur de connexion' : realData ? 'Données en temps réel' : 'Aucune donnée'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
          )}
          {error && (
            <div className="text-red-600 text-xs bg-red-100 px-2 py-1 rounded">
              ⚠️ Erreur
            </div>
          )}
          {/* Boutons de vue — taille compacte (alignée widget stock) */}
          <div className="flex bg-orange-100 rounded-md p-0.5 gap-0.5 flex-wrap">
            <button
              onClick={handleViewList}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 border border-orange-300 hover:bg-orange-200'
              }`}
            >
              Liste
            </button>
            <button
              onClick={handleViewKanban}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 border border-orange-300 hover:bg-orange-200'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={handleViewTimeline}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 border border-orange-300 hover:bg-orange-200'
              }`}
            >
              Timeline
            </button>
          </div>

          {/* Filtre par rôle AO (lauréat / maître d'ouvrage) — visible s'il y a des prospects AO. */}
          {leadsData.some((l) => l.prospectKind && l.prospectKind !== 'unknown') && (
            <div className="flex bg-gray-100 rounded-md p-0.5 gap-0.5 flex-wrap" title="Filtrer les prospects d'appels d'offres par rôle">
              {([
                ['all', 'Tous'],
                ['winner', 'Lauréats'],
                ['buyer', "M. d'ouvrage"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setProspectFilter(key)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    prospectFilter === key ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleAddNewLead}
            className="px-2 py-1.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-[11px] leading-tight font-medium flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Nouveau lead
          </button>
          <button
            onClick={handleExportPipeline}
            className="px-2 py-1.5 bg-white text-orange-700 border border-orange-300 rounded-md hover:bg-orange-50 text-[11px] leading-tight font-medium flex items-center gap-1"
            title="Télécharger les données visibles"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            Exporter
          </button>
        </div>
      </div>

      {/* Statistiques globales */}
      {error ? (
        <div className="text-center p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 font-medium mb-2">Erreur de connexion</div>
          <div className="text-sm text-red-500 mb-3">{error}</div>
          <button 
            onClick={loadRealData}
            className="text-xs bg-red-100 text-red-800 border border-red-300 px-3 py-1 rounded hover:bg-red-200 transition-colors"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
            <div className="text-base font-medium text-orange-700">{pipelineStats.total}</div>
            <div className="text-xs text-orange-600">Total Leads</div>
          </div>
          <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
            <div className="text-base font-medium text-orange-700">{formatCurrency(pipelineStats.totalValue)}</div>
            <div className="text-xs text-orange-600">Valeur Totale</div>
          </div>
          <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
            <div className="text-base font-medium text-orange-700">{formatCurrency(pipelineStats.weightedValue)}</div>
            <div className="text-xs text-orange-600">Valeur Pondérée</div>
          </div>
          <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
            <div className="text-base font-medium text-orange-700">{Math.round(calculateConversionRates.global)}%</div>
            <div className="text-xs text-orange-600">Taux Conversion</div>
          </div>
        </div>
      )}

      {/* Raccourcis : même densité que le widget stock (lignes, icônes, mentions démo). */}
      <div className="bg-white rounded-lg border border-orange-200 p-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-orange-900 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 shrink-0" />
              Raccourcis pipeline
            </h4>
            <p className="text-[10px] text-orange-800/80 mt-0.5 leading-snug">
              <strong>Boîte leads</strong> ouvre l’inbox (<span className="font-mono text-[9px]">/#leads</span>).{' '}
              <strong>Exporter</strong> télécharge le pipeline affiché (Excel).{' '}
              <strong>Relance</strong> et <strong>réunion</strong> s’appliquent au lead ouvert dans la fiche détail (cliquer une ligne puis l’aperçu).
            </p>
          </div>
          <button
            className="p-0.5 text-orange-500 hover:text-orange-700 transition-colors shrink-0"
            onClick={() => setShowQuickActions((v) => !v)}
            title={showQuickActions ? 'Fermer' : 'Ouvrir'}
          >
            {showQuickActions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
        {showQuickActions && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              onClick={(e) => handleQuickAction('add-lead', undefined, e)}
              className="inline-flex items-center gap-1 justify-center sm:justify-start px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors text-[11px] leading-tight font-medium text-orange-900"
              title="Ouvre la page inbox leads"
            >
              <Plus className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="text-left">
                Boîte leads
                <span className="block text-[9px] font-normal text-orange-700/85">Page inbox</span>
              </span>
            </button>

            <button
              onClick={(e) => handleQuickAction('export-pipeline', undefined, e)}
              className="inline-flex items-center gap-1 justify-center sm:justify-start px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors text-[11px] leading-tight font-medium text-orange-900"
              title="Export Excel des leads affichés"
            >
              <Download className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              Exporter (Excel)
            </button>

            <button
              onClick={(e) => handleQuickAction('send-followup', selectedLead ?? undefined, e)}
              className="inline-flex items-center gap-1 justify-center sm:justify-start px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors text-[11px] leading-tight font-medium text-orange-900"
              title="Nécessite un lead ouvert dans la fiche détail"
            >
              <Send className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="text-left">
                Enregistrer relance
                <span className="block text-[9px] font-normal text-orange-700/85">Fiche lead ouverte</span>
              </span>
            </button>

            <button
              onClick={(e) => handleQuickAction('schedule-meeting', selectedLead ?? undefined, e)}
              className="inline-flex items-center gap-1 justify-center sm:justify-start px-2 py-1.5 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors text-[11px] leading-tight font-medium text-orange-900"
              title="Nécessite un lead ouvert dans la fiche détail"
            >
              <Calendar className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="text-left">
                Planifier RDV
                <span className="block text-[9px] font-normal text-orange-700/85">Fiche lead ouverte</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Alertes pipeline : règles sur les données affichées (distinct du widget « Insights IA »). */}
      {pipelineHeuristicAlerts.length > 0 && (
        <div className="bg-white rounded-lg border border-orange-200 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-orange-900 flex items-center gap-2">
                <ListFilter className="w-4 h-4 shrink-0" />
                Alertes sur le pipeline
              </h4>
              <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                Indicateurs calculés sur vos leads (pas de modèle génératif). Pour prédictions et recommandations IA, ajoutez le widget{' '}
                <span className="font-medium text-gray-800">Insights IA</span> au tableau de bord.
              </p>
            </div>
            <button
              onClick={() => setShowPipelineAlertsOpen(!showPipelineAlertsOpen)}
              className="text-orange-600 hover:text-orange-700 shrink-0 p-0.5"
              title={showPipelineAlertsOpen ? 'Masquer le détail' : 'Afficher le détail'}
            >
              {showPipelineAlertsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {showPipelineAlertsOpen && (
            <div className="space-y-2">
              {pipelineHeuristicAlerts.map((insight, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getInsightColor(insight.type)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      {getInsightIcon(insight.type)}
                      <div>
                        <h5 className="font-medium text-sm">{insight.title}</h5>
                        <p className="text-xs opacity-80">{insight.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAIInsightAction(insight)}
                      className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-2 py-1 rounded hover:bg-orange-200 transition-colors"
                    >
                      {insight.action}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtres et tri — compacts */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-md border border-orange-200 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={selectedStage || ''}
            onChange={(e) => setSelectedStage(e.target.value || null)}
            className="text-[11px] leading-tight border border-orange-200 rounded px-1.5 py-0.5 bg-white text-orange-900 max-w-[148px] focus:outline-none focus:ring-1 focus:ring-orange-300"
          >
            <option value="">Toutes les étapes</option>
            <option value="Prospection">Prospection</option>
            <option value="Devis">Devis</option>
            <option value="Négociation">Négociation</option>
            <option value="Conclu">Gagné</option>
            <option value="Perdu">Non retenu</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-[11px] leading-tight border border-orange-200 rounded px-1.5 py-0.5 bg-white text-orange-900 max-w-[168px] focus:outline-none focus:ring-1 focus:ring-orange-300"
          >
            <option value="value">Trier par valeur</option>
            <option value="probability">Trier par probabilité</option>
            <option value="lastContact">Trier par dernier contact</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowConversionRates(!showConversionRates)}
          className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 shrink-0"
        >
          Taux conversion
        </button>
      </div>

      {/* Taux de conversion par étape */}
      {showConversionRates && (
        <div className="bg-white rounded-lg border border-orange-200 p-4">
          <h4 className="text-sm font-semibold text-orange-900 mb-3">Taux de conversion par étape</h4>
          <div className="grid grid-cols-5 gap-3">
            {['Prospection', 'Devis', 'Négociation', 'Conclu', 'Perdu'].map((stage) => (
              <div key={stage} className="text-center">
                <div className="text-lg font-bold text-orange-700">
                  {Math.round(calculateConversionRates[stage] || 0)}%
                </div>
                <div className="text-xs text-orange-600">{formatStageLabel(stage)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contenu selon le mode de vue */}
      {viewMode === 'list' && (
        <>
          {/* Liste des leads */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sortedLeads.map((lead) => {
              const { full: titleFull, compact: titleCompact } = leadTitleForCard(lead.title);
              return (
              <div key={lead.id} className="bg-white border border-orange-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 pr-2">
                    <h5
                      className="font-semibold text-gray-900 line-clamp-2 break-words leading-snug"
                      title={titleFull}
                    >
                      {titleCompact}
                    </h5>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${getStageColor(lead.stage)}`}>
                        {formatStageLabel(lead.stage)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(lead.priority)}`}>
                        {lead.priority === 'high' ? 'Haute' : lead.priority === 'medium' ? 'Moyenne' : 'Basse'}
                      </span>
                      {prospectKindLabel(lead.prospectKind) && (
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            lead.prospectKind === 'winner'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                          title={
                            lead.prospectKind === 'winner'
                              ? 'Lauréat du marché — angle négociation'
                              : "Maître d'ouvrage — angle soumission"
                          }
                        >
                          {prospectKindLabel(lead.prospectKind)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-700">{formatCurrency(lead.value)}</div>
                    <div className="text-sm text-orange-600">{lead.probability}% de probabilité</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-orange-700">Prochaine action:</span>
                    <div className="font-medium text-gray-900">{lead.nextAction}</div>
                  </div>
                  <div>
                    <span className="text-orange-700">Assigné à:</span>
                    <div className="font-medium text-gray-900">{lead.assignedTo}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-medium">{lead.contact?.name || 'Prospect'}</span>
                  {lead.contact?.company ? ` · ${lead.contact.company}` : ''}
                  {lead.contact?.email ? ` · ${lead.contact.email}` : ''}
                  {lead.contact?.phone ? ` · ${lead.contact.phone}` : ''}
                  {lead.source ? ` · source: ${lead.source}` : ''}
                </div>
                {lead.notes && (
                  <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                    {lead.notes}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-orange-100">
                  <div className="text-xs text-orange-600">
                    Dernier contact: {formatDate(lead.lastContact)}
                    <span className="ml-2 text-orange-600">
                      ({getDaysSinceLastContact(lead.lastContact)} jours)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleViewDetails(lead)}
                      className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-2 py-1 rounded hover:bg-orange-200 transition-colors"
                    >
                      Voir détails
                    </button>
                    <TransactionDossierLink
                      caseId={lead.transaction_case_id}
                      className="text-xs bg-white text-orange-800 border border-orange-300 px-2 py-1 rounded hover:bg-orange-50"
                    />
                    <button
                      onClick={() => handleNextStage(lead)}
                      disabled={lead.stage === 'Conclu' || lead.stage === 'Perdu'}
                      className={`text-xs px-2 py-1 rounded ${lead.stage === 'Conclu' || lead.stage === 'Perdu' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-100 text-orange-800 border border-orange-300 hover:bg-orange-200'}`}
                      title={lead.stage === 'Conclu' ? 'Lead gagné' : lead.stage === 'Perdu' ? 'Lead non retenu' : 'Passer à l\'étape suivante'}
                    >
                      {lead.stage === 'Conclu' || lead.stage === 'Perdu' ? 'Finalisé' : getPrimaryActionLabel(lead.stage)}
                    </button>
                    <button
                      onClick={() => handleSetStage(lead, lead.stage === 'Perdu' ? 'Prospection' : 'Perdu', lead.stage === 'Perdu' ? 'Relance commerciale planifiée' : 'Lead classé non retenu - analyse en cours')}
                      className={`text-xs px-2 py-1 rounded ${lead.stage === 'Perdu' ? 'bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200' : 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'}`}
                      title={lead.stage === 'Perdu' ? 'Réactiver ce lead' : 'Marquer ce lead non retenu'}
                    >
                      {lead.stage === 'Perdu' ? 'Réactiver' : 'Non retenu'}
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {sortedLeads.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              Aucun lead trouvé pour cette étape
            </div>
          )}
        </>
      )}

      {/* Vue Kanban */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-5 gap-4 max-h-96 overflow-y-auto">
          {['Prospection', 'Devis', 'Négociation', 'Conclu', 'Perdu'].map((stage) => {
            const stageLeads = leadsData.filter(lead => lead.stage === stage);
            return (
              <div key={stage} className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-sm font-semibold px-2 py-1 rounded-full ${getStageColor(stage)}`}>
                    {formatStageLabel(stage)}
                  </h4>
                  <span className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded-full">
                    {stageLeads.length}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {stageLeads.map((lead) => {
                    const { full: titleFull, compact: titleCompact } = leadTitleForCard(lead.title);
                    return (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      className="bg-white rounded-lg p-3 border border-orange-200 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleViewDetails(lead)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleViewDetails(lead);
                        }
                      }}
                    >
                      <h5
                        className="font-semibold text-sm text-gray-900 mb-0.5 line-clamp-2 break-words leading-snug"
                        title={titleFull}
                      >
                        {titleCompact}
                      </h5>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-orange-600 hover:text-orange-800 hover:underline text-left w-full mb-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(lead);
                        }}
                      >
                        Fiche complète →
                      </button>
                      <TransactionDossierLink
                        caseId={lead.transaction_case_id}
                        stopClickBubble
                        className="text-[10px] font-medium text-orange-700 hover:underline block mb-1"
                      />
                      <div className="text-[10px] font-normal text-orange-700 mb-1">{formatCurrency(lead.value)}</div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-1 rounded-full ${getPriorityColor(lead.priority)}`}>
                          {lead.priority === 'high' ? 'Haute' : lead.priority === 'medium' ? 'Moyenne' : 'Basse'}
                        </span>
                        <span className="text-orange-600">{lead.probability}%</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {getDaysSinceLastContact(lead.lastContact)} jours
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vue Timeline */}
      {viewMode === 'timeline' && (
        <div className="relative max-h-96 overflow-y-auto">
          {/* Ligne verticale de la timeline */}
          <div className="absolute left-6 top-0 bottom-0 w-1 bg-orange-200 rounded-full" style={{ zIndex: 0 }}></div>
          <div className="space-y-8 pl-16 pr-2">
            {sortedLeads.map((lead, index) => {
              const { full: titleFull, compact: titleCompact } = leadTitleForCard(lead.title);
              return (
              <div key={lead.id} className="relative flex items-start group">
                {/* Dot sur la timeline */}
                <div className="absolute -left-8 top-2 w-5 h-5 flex items-center justify-center z-10">
                  <div className={`w-4 h-4 rounded-full border-2 ${getStageColor(lead.stage)} border-white shadow`}></div>
                </div>
                {/* Contenu du lead */}
                <div className="flex-1 bg-white border border-orange-200 rounded-lg p-4 shadow-sm min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <h5
                      className="font-semibold text-gray-900 text-base line-clamp-2 break-words leading-snug min-w-0"
                      title={titleFull}
                    >
                      {titleCompact}
                    </h5>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStageColor(lead.stage)}`}>{formatStageLabel(lead.stage)}</span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-bold text-orange-700">{formatCurrency(lead.value)}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(lead.priority)}`}>{lead.priority === 'high' ? 'Haute' : lead.priority === 'medium' ? 'Moyenne' : 'Basse'}</span>
                    <span className="text-xs text-orange-600">{lead.probability}%</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    <span className="font-medium text-orange-700">Prochaine action :</span> {lead.nextAction}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    <span className="font-medium text-orange-700">Assigné à :</span> {lead.assignedTo}
                  </div>
                  <div className="text-xs text-orange-600 mb-2">
                    Dernier contact : {formatDate(lead.lastContact)} ({getDaysSinceLastContact(lead.lastContact)} jours)
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => handleViewDetails(lead)}
                      className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-2 py-1 rounded hover:bg-orange-200 transition-colors"
                    >
                      Détails
                    </button>
                    <TransactionDossierLink
                      caseId={lead.transaction_case_id}
                      className="text-xs bg-white text-orange-800 border border-orange-300 px-2 py-1 rounded hover:bg-orange-50"
                    />
                    <button
                      onClick={() => handleNextStage(lead)}
                      disabled={lead.stage === 'Conclu' || lead.stage === 'Perdu'}
                      className={`text-xs px-2 py-1 rounded ${lead.stage === 'Conclu' || lead.stage === 'Perdu' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-100 text-orange-800 border border-orange-300 hover:bg-orange-200'}`}
                      title={lead.stage === 'Conclu' ? 'Lead gagné' : lead.stage === 'Perdu' ? 'Lead non retenu' : 'Passer à l\'étape suivante'}
                    >
                      {lead.stage === 'Conclu' || lead.stage === 'Perdu' ? 'Finalisé' : getPrimaryActionLabel(lead.stage)}
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
            {sortedLeads.length === 0 && (
              <div className="text-center text-gray-500 py-8">Aucun lead trouvé pour cette étape</div>
            )}
          </div>
        </div>
      )}

      {/* Modal de détails du lead */}
      {showLeadDetails && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-gray-900">{selectedLead.title}</h3>
              <button
                onClick={() => setShowLeadDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-2">Informations générales</h5>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-orange-700">Étape:</span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getStageColor(selectedLead.stage)}`}>
                      {formatStageLabel(selectedLead.stage)}
                    </span>
                  </div>
                  <div>
                    <span className="text-orange-700">Valeur:</span>
                    <span className="ml-2 font-semibold">{formatCurrency(selectedLead.value)}</span>
                  </div>
                  <div>
                    <span className="text-orange-700">Probabilité:</span>
                    <span className="ml-2">{selectedLead.probability}%</span>
                  </div>
                  <div>
                    <span className="text-orange-700">Priorité:</span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getPriorityColor(selectedLead.priority)}`}>
                      {selectedLead.priority === 'high' ? 'Haute' : selectedLead.priority === 'medium' ? 'Moyenne' : 'Basse'}
                    </span>
                  </div>
                  {selectedLead.transaction_case_id ? (
                    <div>
                      <span className="text-orange-700">Dossier:</span>
                      <a
                        href={`#dossier/${selectedLead.transaction_case_id}`}
                        className="ml-2 font-medium text-orange-600 hover:underline"
                      >
                        Ouvrir
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-2">Suivi</h5>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-orange-700">Prochaine action:</span>
                    <div className="font-medium">{selectedLead.nextAction}</div>
                  </div>
                  <div>
                    <span className="text-orange-700">Assigné à:</span>
                    <div className="font-medium">{selectedLead.assignedTo}</div>
                  </div>
                  <div>
                    <span className="text-orange-700">Dernier contact:</span>
                    <div className="font-medium">{formatDate(selectedLead.lastContact)} ({getDaysSinceLastContact(selectedLead.lastContact)} jours)</div>
                  </div>
                </div>
              </div>
            </div>

            {selectedLead.notes && (
              <div className="mb-6">
                <h5 className="text-sm font-semibold text-gray-700 mb-2">Notes</h5>
                <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">
                  {selectedLead.notes}
                </div>
              </div>
            )}

            <div className="border-t pt-6">
              <h5 className="text-lg font-semibold text-gray-900 mb-4">Actions</h5>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleEditLead(selectedLead)}
                  className="px-4 py-2 bg-orange-100 text-orange-800 border border-orange-300 rounded-lg hover:bg-orange-200 text-sm"
                >
                  Modifier
                </button>
                <button
                  onClick={handleAddNote}
                  className="px-4 py-2 bg-orange-100 text-orange-800 border border-orange-300 rounded-lg hover:bg-orange-200 text-sm"
                >
                  Ajouter une note
                </button>
                <button
                  onClick={handleScheduleCall}
                  className="px-4 py-2 bg-orange-100 text-orange-800 border border-orange-300 rounded-lg hover:bg-orange-200 text-sm"
                >
                  Programmer un appel
                </button>
                <button
                  onClick={() => handleNextStage(selectedLead)}
                  disabled={selectedLead.stage === 'Conclu' || selectedLead.stage === 'Perdu'}
                  className={`px-4 py-2 rounded-lg text-sm ${selectedLead.stage === 'Conclu' || selectedLead.stage === 'Perdu' ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-orange-100 text-orange-800 border border-orange-300 hover:bg-orange-200'}`}
                >
                  {selectedLead.stage === 'Conclu' || selectedLead.stage === 'Perdu' ? 'Finalisé' : getPrimaryActionLabel(selectedLead.stage)}
                </button>
                <button
                  onClick={() => handleSetStage(
                    selectedLead,
                    selectedLead.stage === 'Perdu' ? 'Prospection' : 'Perdu',
                    selectedLead.stage === 'Perdu' ? 'Relance commerciale planifiée' : 'Lead classé non retenu - analyse en cours',
                  )}
                  className={`px-4 py-2 rounded-lg text-sm ${selectedLead.stage === 'Perdu' ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200' : 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'}`}
                >
                  {selectedLead.stage === 'Perdu' ? 'Réactiver ce lead' : 'Marquer non retenu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Modifier le lead</h3>
              <button
                onClick={() => setShowEditForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du prospect</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Étape</label>
                <select
                  value={editForm.stage}
                  onChange={(e) => setEditForm({...editForm, stage: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="Prospection">Prospection</option>
                  <option value="Devis">Devis</option>
                  <option value="Négociation">Négociation</option>
                  <option value="Conclu">Gagné</option>
                  <option value="Perdu">Non retenu</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valeur (MAD)</label>
                <input
                  type="number"
                  value={editForm.value}
                  onChange={(e) => setEditForm({...editForm, value: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Probabilité (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editForm.probability}
                  onChange={(e) => setEditForm({...editForm, probability: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prochaine action</label>
                <input
                  type="text"
                  value={editForm.nextAction}
                  onChange={(e) => setEditForm({...editForm, nextAction: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigné à</label>
                <input
                  type="text"
                  value={editForm.assignedTo}
                  onChange={(e) => setEditForm({...editForm, assignedTo: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEditForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesPipelineWidget; 