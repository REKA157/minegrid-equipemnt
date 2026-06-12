import React, { useState } from 'react';
import {
  AlertTriangle,
  ListFilter,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Info,
  Plus,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import { toast } from '../../../utils/toast';
import { RealPipelineService } from '../../../services/realPipelineService';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';
import { leadTitleWithoutAoPrefix } from '../../../utils/stockLeadSuggestions';

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

export const SalesPipelineWidget = ({ data }: { data: any[] }) => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'value' | 'probability' | 'lastContact'>('value');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showLeadDetails, setShowLeadDetails] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [leadsData, setLeadsData] = useState<any[]>(data);
  
  // Nouvelles états pour les fonctionnalités enrichies
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'timeline'>('list');
  const [showPipelineAlertsOpen, setShowPipelineAlertsOpen] = useState(false);
  const [showConversionRates, setShowConversionRates] = useState(false);
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [conversionRates, setConversionRates] = useState<any>({});
  const { formatCurrency } = useWidgetMadCurrency();

  // Mettre à jour les données quand les props changent
  React.useEffect(() => {
    setLeadsData(data);
  }, [data]);

  const normalizeStage = (stage?: string) => {
    switch ((stage || '').toLowerCase()) {
      case 'prospection':
        return 'Prospection';
      case 'qualification':
      case 'devis':
        return 'Devis';
      case 'proposition':
      case 'négociation':
      case 'negociation':
        return 'Négociation';
      case 'conclu':
        return 'Conclu';
      case 'perdu':
        return 'Perdu';
      default:
        return 'Prospection';
    }
  };

  const loadRealLeads = React.useCallback(async () => {
    const rows = await RealPipelineService.getLeads();
    if (!rows) return;

    const mapped = rows.map((r: any) => ({
      id: r.id,
      title: r.title || r.contact_company || r.contact_name || 'Prospect',
      name: r.contact_name || r.contact_company || r.title || 'Prospect',
      company: r.contact_company || r.contact_name || 'Organisation',
      stage: normalizeStage(r.stage),
      probability: Number(r.probability || 0),
      value: Number(r.value || 0),
      lastContact: r.last_contact || r.updated_at || r.created_at || new Date().toISOString(),
      nextAction: r.next_action || 'Prendre contact',
      assignedTo: r.assigned_to || 'Vendeur',
      equipment: r.title || 'AO',
      visits: 0,
      priority: (r.priority || 'medium').toLowerCase(),
      notes: r.notes || '',
      source: r.source || 'manual',
      email: r.contact_email || undefined,
      phone: r.contact_phone || undefined,
      transaction_case_id: r.transaction_case_id ?? null,
    }));
    setLeadsData(mapped);
  }, []);

  // Priorité aux leads réels (DB), avec refresh automatique après transfert.
  React.useEffect(() => {
    void loadRealLeads();

    const onRefresh = () => {
      void loadRealLeads();
    };
    const onFocus = () => {
      void loadRealLeads();
    };

    window.addEventListener('pipeline:refresh', onRefresh as EventListener);
    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(onRefresh, 15000);

    return () => {
      window.removeEventListener('pipeline:refresh', onRefresh as EventListener);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [loadRealLeads]);

  // Fonction utilitaire pour calculer les jours depuis le dernier contact
  function getDaysSinceLastContact(dateString: string) {
    const lastContact = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - lastContact.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // Calculer les statistiques du pipeline
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

  // Calculer les taux de conversion
  const calculateConversionRates = React.useMemo(() => {
    const stages = ['Prospection', 'Devis', 'Négociation', 'Conclu', 'Perdu'];
    const rates: Record<string, number> = {};
    
    // Taux de conversion global
    const totalLeads = leadsData.length;
    const wonLeads = leadsData.filter(lead => lead.stage === 'Conclu').length;
    rates.global = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    
    // Taux par étape
    stages.forEach((stage, index) => {
      if (index < stages.length - 1) {
        const currentStageLeads = leadsData.filter(lead => lead.stage === stage).length;
        const nextStageLeads = leadsData.filter(lead => lead.stage === stages[index + 1]).length;
        rates[stage] = currentStageLeads > 0 ? (nextStageLeads / currentStageLeads) * 100 : 0;
      }
    });
    
    return rates;
  }, [leadsData]);

  /** Heuristiques sur les leads affichés — distinct du widget « Insights IA » (aiWidgetService). */
  const pipelineHeuristicAlerts = React.useMemo(() => {
    const insights = [];
    
    // Analyser les blocages
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
    
    // Analyser les devis sans relance
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
    
    // Analyser les opportunités à forte valeur
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
    
    // Analyser les taux de conversion faibles
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

  // Trier les leads
  const sortedLeads = React.useMemo(() => {
    let sorted = [...leadsData];
    if (selectedStage) {
      sorted = sorted.filter(lead => lead.stage === selectedStage);
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
  }, [leadsData, selectedStage, sortBy]);

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
      priority: string;
      value: number;
      probability: number;
      nextAction: string;
      assignedTo: string;
      notes: string;
      title: string;
      lastContact: string;
    }>,
  ) => {
    const dbUpdates: Partial<any> = {};
    if (updates.stage != null) dbUpdates.stage = updates.stage;
    if (updates.priority != null) dbUpdates.priority = updates.priority;
    if (updates.value != null) dbUpdates.value = updates.value;
    if (updates.probability != null) dbUpdates.probability = updates.probability;
    if (updates.nextAction != null) dbUpdates.next_action = updates.nextAction;
    if (updates.assignedTo != null) dbUpdates.assigned_to = updates.assignedTo;
    if (updates.notes != null) dbUpdates.notes = updates.notes;
    if (updates.title != null) dbUpdates.title = updates.title;
    if (updates.lastContact != null) dbUpdates.last_contact = updates.lastContact;
    const saved = await RealPipelineService.updateLead(leadId, dbUpdates);
    if (!saved) {
      toast.error("Échec de sauvegarde du lead dans la base.");
      return;
    }
    window.dispatchEvent(new Event('pipeline:refresh'));
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
      lastContact,
      probability: nextProbability,
      nextAction,
    });
    void persistLeadUpdate(lead.id, {
      stage: targetStage,
      lastContact,
      probability: nextProbability,
      nextAction,
    });
  };

  const getPrimaryActionLabel = (stage: string) => {
    if (stage === 'Prospection') return 'Passer en devis';
    if (stage === 'Devis') return 'Passer en négociation';
    if (stage === 'Négociation') return 'Marquer gagné';
    if (stage === 'Perdu') return 'Réactiver';
    return 'Finalisé';
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

      toast(`✅ Lead "${lead.title}" passé avec succès à l'étape: ${stageNames[nextStage as keyof typeof stageNames]}`);

    } else {
      toast('🎉 Ce lead est déjà à la dernière étape commerciale !');
    }
  };

  const getNextActionForStage = (stage: string) => {
    const actions = {
      'Prospection': 'Qualifier le besoin et identifier les décideurs',
      'Devis': 'Préparer et envoyer le devis',
      'Négociation': 'Programmer une réunion de négociation',
      'Conclu': 'Déclencher la commande et préparer la livraison',
      'Perdu': 'Analyser les motifs de non-retention et relancer au bon moment'
    };
    return actions[stage as keyof typeof actions] || 'Définir la prochaine action';
  };

  const handleEditLead = (lead: any) => {
    setEditForm({
      id: lead.id,
      title: lead.title,
      stage: lead.stage,
      priority: lead.priority,
      value: lead.value,
      probability: lead.probability,
      nextAction: lead.nextAction,
      assignedTo: lead.assignedTo,
      notes: lead.notes || ''
    });
    setShowEditForm(true);
  };

  const handleSaveEdit = () => {
    const lastContact = new Date().toISOString();
    applyLeadLocalUpdate(editForm.id, { ...editForm, lastContact });

    toast('✅ Modifications sauvegardées avec succès');
    void persistLeadUpdate(editForm.id, { ...editForm, lastContact });
    setShowEditForm(false);
    setEditForm({});
  };

  const handleAddNote = () => {
    const note = prompt('Ajouter une note:');
    if (note && selectedLead) {
      const nextNotes = selectedLead.notes
        ? `${selectedLead.notes}\n${new Date().toLocaleString('fr-FR')}: ${note}`
        : `${new Date().toLocaleString('fr-FR')}: ${note}`;
      applyLeadLocalUpdate(selectedLead.id, { notes: nextNotes });
      void persistLeadUpdate(selectedLead.id, { notes: nextNotes, lastContact: new Date().toISOString() });

      toast('✅ Note ajoutée avec succès');
    }
  };

  const handleScheduleCall = () => {
    const date = prompt('Date du rendez-vous (YYYY-MM-DD):');
    const time = prompt('Heure du rendez-vous (HH:MM):');
    if (date && time && selectedLead) {
      const appointment = `Rendez-vous programmé: ${date} à ${time}`;
      const scheduledIso = new Date(`${date}T${time}:00`).toISOString();
      applyLeadLocalUpdate(selectedLead.id, { nextAction: appointment, lastContact: scheduledIso });
      void persistLeadUpdate(selectedLead.id, { nextAction: appointment, lastContact: scheduledIso });

      toast('✅ Rendez-vous programmé avec succès');
    }
  };

  const handleAddNewLead = () => {
    const title = prompt('Nom du prospect:') || 'Nouveau prospect';
    const value = parseInt(prompt('Valeur estimée (MAD):') || '0');
    const assignedTo = prompt('Assigné à:') || 'Commercial';

    if (title !== 'Nouveau prospect') {
      const newLead = {
        id: `lead-${Date.now()}`,
        title,
        stage: 'Prospection',
        priority: 'medium',
        value,
        probability: 10,
        nextAction: 'Premier contact',
        assignedTo,
        lastContact: new Date().toISOString(),
        notes: ''
      };
      setLeadsData((prev) => [newLead, ...prev]);
      toast('✅ Nouveau lead ajouté avec succès');
      void RealPipelineService.createLead({
        title,
        stage: 'Prospection',
        priority: 'medium',
        value,
        probability: 10,
        next_action: 'Premier contact',
        assigned_to: assignedTo,
        last_contact: new Date().toISOString(),
        notes: '',
        source: 'manual',
      }).then((created) => {
        if (!created) {
          toast.error("Le lead local a été ajouté, mais l'enregistrement en base a échoué.");
          return;
        }
        window.dispatchEvent(new Event('pipeline:refresh'));
      });
    }
  };

  // Nouvelles fonctions pour les fonctionnalités enrichies
  const handleAIInsightAction = (insight: any) => {
    switch (insight.type) {
      case 'blockage':
        toast(`🔄 Relance automatique programmée pour ${insight.leads.length} leads bloqués`);
        break;
      case 'quote':
        toast(`📧 Relances automatiques programmées pour ${insight.leads.length} devis`);
        break;
      case 'opportunity':
        toast(`⭐ Priorité élevée accordée à ${insight.leads.length} opportunités à forte valeur`);
        break;
      case 'conversion':
        toast(`📊 Analyse des taux de conversion lancée pour optimiser le processus`);
        break;
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

  const handleDownloadKanban = () => {
    try {
      const rows = leadsData.map((lead) => ({
        id: lead.id ?? '',
        prospect: lead.name || lead.contact?.name || lead.title || '',
        entreprise: lead.company || lead.contact?.company || '',
        stage: lead.stage || '',
        valeur_mad: lead.value || 0,
        probabilite_pct: lead.probability || 0,
        derniere_interaction: lead.lastContact || '',
        prochaine_action: lead.nextAction || '',
        email: lead.email || lead.contact?.email || '',
        telephone: lead.phone || lead.contact?.phone || '',
        source: lead.source || '',
      }));

      const headers = Object.keys(rows[0] || {});
      if (headers.length === 0) {
        toast.warning('Aucune donnée à exporter dans le Kanban.');
        return;
      }
      const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export Kanban téléchargé.');
    } catch {
      toast.error("Impossible d'exporter le Kanban.");
    }
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
        <h3 className="text-lg font-semibold text-orange-900">Pipeline Commercial</h3>
        <div className="flex items-center gap-2">
          {/* Boutons de vue — compacts (aligné dashboard vendeur) */}
          <div className="flex bg-orange-100 rounded-md p-0.5 gap-0.5 flex-wrap">
            <button
              onClick={handleViewList}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-orange-600 text-white'
                  : 'text-orange-700 hover:bg-orange-200'
              }`}
            >
              Liste
            </button>
            <button
              onClick={handleViewKanban}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-orange-600 text-white'
                  : 'text-orange-700 hover:bg-orange-200'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={handleViewTimeline}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-orange-600 text-white'
                  : 'text-orange-700 hover:bg-orange-200'
              }`}
            >
              Timeline
            </button>
          </div>

          <button
            onClick={handleAddNewLead}
            className="px-2 py-1.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-[11px] leading-tight font-medium flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Nouveau lead
          </button>
          <button
            onClick={handleDownloadKanban}
            className="px-2 py-1.5 bg-white text-orange-700 border border-orange-300 rounded-md hover:bg-orange-50 text-[11px] leading-tight font-medium flex items-center gap-1"
            title="Télécharger le Kanban en CSV"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            Exporter
          </button>
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
          <div className="text-2xl font-bold text-orange-700">{pipelineStats.total}</div>
          <div className="text-xs text-orange-600">Total Leads</div>
        </div>
        <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
          <div className="text-2xl font-bold text-orange-700">{formatCurrency(pipelineStats.totalValue)}</div>
          <div className="text-xs text-orange-600">Valeur Totale</div>
        </div>
        <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
          <div className="text-2xl font-bold text-orange-700">{formatCurrency(pipelineStats.weightedValue)}</div>
          <div className="text-xs text-orange-600">Valeur Pondérée</div>
        </div>
        <div className="text-center p-3 bg-orange-100 rounded-lg border border-orange-200">
          <div className="text-2xl font-bold text-orange-700">
            {Math.round(calculateConversionRates.global)}%
          </div>
          <div className="text-xs text-orange-600">Taux Conversion</div>
        </div>
      </div>

      {/* Taux de conversion par étape */}
      <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-orange-900">Taux de Conversion par Étape</h4>
          <button
            onClick={() => setShowConversionRates(!showConversionRates)}
            className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
          >
            {showConversionRates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showConversionRates ? 'Masquer' : 'Voir détails'}
          </button>
        </div>
        
        {showConversionRates && (
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(calculateConversionRates).filter(([stage]) => stage !== 'global').map(([stage, rate]) => (
              <div key={stage} className="text-center">
                <div className={`text-xs px-2 py-1 rounded-full ${getStageColor(stage)} mb-2`}>
                  {stage}
                </div>
                <div className="text-lg font-bold text-orange-900">{Math.round(rate)}%</div>
                <div className="text-xs text-orange-600">
                  {pipelineStats.byStage[stage]?.count || 0} leads
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alertes pipeline (règles locales, pas le widget IA) */}
      {pipelineHeuristicAlerts.length > 0 && (
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="flex justify-between items-start gap-2 mb-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-orange-900 flex items-center gap-2">
                <ListFilter className="w-4 h-4 shrink-0" />
                Alertes sur le pipeline
              </h4>
              <p className="text-[10px] text-gray-600 mt-1 leading-snug">
                Calculées sur vos leads dans ce widget. Pour analyses IA (prédictions, onglets dédiés), utilisez le widget{' '}
                <span className="font-medium text-gray-800">Insights IA</span>.
              </p>
            </div>
            <button
              onClick={() => setShowPipelineAlertsOpen(!showPipelineAlertsOpen)}
              className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 shrink-0"
            >
              {showPipelineAlertsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showPipelineAlertsOpen ? 'Masquer' : 'Voir détail'}
            </button>
          </div>

          {showPipelineAlertsOpen && (
            <div className="space-y-3">
              {pipelineHeuristicAlerts.map((insight, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getInsightColor(insight.type)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getInsightIcon(insight.type)}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-semibold text-sm">{insight.title}</h5>
                        <p className="text-xs mt-1">{insight.description}</p>
                        <p className="text-xs mt-2 font-medium">Action suggérée: {insight.action}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAIInsightAction(insight)}
                      className="text-xs px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700"
                    >
                      Agir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pipeline par étapes */}
      <div className="bg-orange-100 rounded-lg p-4 border border-orange-200">
        <h4 className="text-sm font-semibold text-orange-900 mb-3">Pipeline par Étapes</h4>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(pipelineStats.byStage).map(([stage, stats]) => (
            <div key={stage} className="text-center">
              <div className={`text-xs px-2 py-1 rounded-full ${getStageColor(stage)} mb-1`}>
                {stage}
              </div>
              <div className="text-lg font-bold text-orange-900">{stats.count}</div>
              <div className="text-xs text-orange-700">{formatCurrency(stats.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtres et tri — compacts */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={selectedStage || ''}
          onChange={(e) => setSelectedStage(e.target.value || null)}
          className="text-[11px] leading-tight px-1.5 py-0.5 border border-orange-300 rounded bg-white text-orange-900 max-w-[148px] focus:outline-none focus:ring-1 focus:ring-orange-400"
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
          onChange={(e) => setSortBy(e.target.value as 'value' | 'probability' | 'lastContact')}
          className="text-[11px] leading-tight px-1.5 py-0.5 border border-orange-300 rounded bg-white text-orange-900 max-w-[168px] focus:outline-none focus:ring-1 focus:ring-orange-400"
        >
          <option value="value">Trier par valeur</option>
          <option value="probability">Trier par probabilité</option>
          <option value="lastContact">Trier par dernier contact</option>
        </select>
      </div>

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
                  <span className="font-medium">{lead.name || 'Prospect'}</span>
                  {lead.company ? ` · ${lead.company}` : ''}
                  {lead.email ? ` · ${lead.email}` : ''}
                  {lead.phone ? ` · ${lead.phone}` : ''}
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
                      className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
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
                      className={`text-xs px-2 py-1 rounded ${
                        lead.stage === 'Conclu' || lead.stage === 'Perdu'
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                      title={lead.stage === 'Conclu' ? 'Lead gagné' : lead.stage === 'Perdu' ? 'Lead non retenu' : 'Passer à l\'étape suivante'}
                    >
                      {lead.stage === 'Conclu' || lead.stage === 'Perdu' ? 'Finalisé' : getPrimaryActionLabel(lead.stage)}
                    </button>
                    <button
                      onClick={() => handleSetStage(lead, lead.stage === 'Perdu' ? 'Prospection' : 'Perdu', lead.stage === 'Perdu' ? 'Relance commerciale planifiée' : 'Lead classé non retenu - analyse en cours')}
                      className={`text-xs px-2 py-1 rounded ${
                        lead.stage === 'Perdu'
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
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
                      <div className="text-sm font-bold text-orange-700 mb-1">{formatCurrency(lead.value)}</div>
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
        <div className="max-h-96 overflow-y-auto">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-orange-300"></div>
            
    <div className="space-y-4">
              {sortedLeads.map((lead, index) => {
                const { full: titleFull, compact: titleCompact } = leadTitleForCard(lead.title);
                return (
                <div key={lead.id} className="relative flex items-start gap-4">
                  {/* Timeline dot */}
                  <div className={`absolute left-3 w-3 h-3 rounded-full border-2 border-white ${getStageColor(lead.stage).includes('bg-green') ? 'bg-green-500' : getStageColor(lead.stage).includes('bg-red') ? 'bg-red-500' : 'bg-orange-500'}`}></div>
                  
                  {/* Content */}
                  <div className="ml-8 bg-white rounded-lg p-4 border border-orange-200 flex-1 hover:shadow-md transition-shadow min-w-0">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex-1 min-w-0">
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
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-orange-700">{formatCurrency(lead.value)}</div>
                        <div className="text-sm text-orange-600">{lead.probability}%</div>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-2">
                      <div>Prochaine action: {lead.nextAction}</div>
                      <div>Assigné à: {lead.assignedTo}</div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-orange-600">
                      <span>Dernier contact: {formatDate(lead.lastContact)}</span>
                      <span>({getDaysSinceLastContact(lead.lastContact)} jours)</span>
                    </div>
                    <div className="mt-2">
                      <TransactionDossierLink
                        caseId={lead.transaction_case_id}
                        className="text-xs font-medium text-orange-700 hover:underline"
                      />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de détails du lead */}
      {showLeadDetails && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Détails du Lead</h3>
              <button
                onClick={() => setShowLeadDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Informations principales */}
              <div className="grid grid-cols-2 gap-6">
              <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">{selectedLead.title}</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm ${getStageColor(selectedLead.stage)}`}>
                        {formatStageLabel(selectedLead.stage)}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm ${getPriorityColor(selectedLead.priority)}`}>
                        {selectedLead.priority === 'high' ? 'Haute' : selectedLead.priority === 'medium' ? 'Moyenne' : 'Basse'} priorité
                      </span>
                  </div>
                    <div>
                      <span className="text-gray-600">Valeur:</span>
                      <div className="text-xl font-bold text-green-600">{formatCurrency(selectedLead.value)}</div>
                  </div>
                    <div>
                      <span className="text-gray-600">Probabilité:</span>
                      <div className="text-lg font-semibold">{selectedLead.probability}%</div>
                  </div>
                    {selectedLead.transaction_case_id ? (
                      <div>
                        <span className="text-gray-600">Dossier:</span>
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

                <div className="space-y-3">
              <div>
                    <span className="text-gray-600">Assigné à:</span>
                    <div className="font-medium">{selectedLead.assignedTo}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Prochaine action:</span>
                    <div className="font-medium">{selectedLead.nextAction}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Dernier contact:</span>
                    <div className="font-medium">{formatDate(selectedLead.lastContact)}</div>
                    <div className="text-sm text-orange-600">
                      Il y a {getDaysSinceLastContact(selectedLead.lastContact)} jours
                  </div>
                </div>
              </div>
              </div>

              {/* Notes */}
              {selectedLead.notes && (
                <div className="border-t pt-6">
                  <h5 className="text-lg font-semibold text-gray-900 mb-4">Notes</h5>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap">{selectedLead.notes}</pre>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="border-t pt-6">
                <h5 className="text-lg font-semibold text-gray-900 mb-4">Actions</h5>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleEditLead(selectedLead)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={handleAddNote}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    Ajouter une note
                  </button>
                  <button
                    onClick={handleScheduleCall}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    Programmer un appel
                  </button>
                  <button
                    onClick={() => handleNextStage(selectedLead)}
                    disabled={selectedLead.stage === 'Conclu' || selectedLead.stage === 'Perdu'}
                    className={`px-4 py-2 rounded-lg text-sm ${
                      selectedLead.stage === 'Conclu' || selectedLead.stage === 'Perdu'
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-orange-600 text-white hover:bg-orange-700'
                    }`}
                  >
                    {selectedLead.stage === 'Conclu' || selectedLead.stage === 'Perdu' ? 'Finalisé' : getPrimaryActionLabel(selectedLead.stage)}
                  </button>
                  <button
                    onClick={() => handleSetStage(
                      selectedLead,
                      selectedLead.stage === 'Perdu' ? 'Prospection' : 'Perdu',
                      selectedLead.stage === 'Perdu' ? 'Relance commerciale planifiée' : 'Lead classé non retenu - analyse en cours',
                    )}
                    className={`px-4 py-2 rounded-lg text-sm ${
                      selectedLead.stage === 'Perdu'
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                  >
                    {selectedLead.stage === 'Perdu' ? 'Réactiver ce lead' : 'Marquer non retenu'}
                  </button>
                </div>
              </div>

              {/* Historique des contacts (simulé) */}
              <div className="border-t pt-6">
                <h5 className="text-lg font-semibold text-gray-900 mb-4">Historique des contacts</h5>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Appel téléphonique</div>
                      <div className="text-sm text-gray-600">Contact établi, intérêt confirmé</div>
                    </div>
                    <div className="text-xs text-gray-500">{formatDate(selectedLead.lastContact)}</div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Email de présentation</div>
                      <div className="text-sm text-gray-600">Envoi du catalogue produits</div>
                    </div>
                    <div className="text-xs text-gray-500">2024-01-15</div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium">Premier contact</div>
                      <div className="text-sm text-gray-600">Lead généré via site web</div>
                    </div>
                    <div className="text-xs text-gray-500">2024-01-10</div>
                  </div>
                </div>
              </div>
            </div>
                      </div>
                    </div>
                  )}

      {/* Modal d'édition */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Modifier le Lead</h3>
              <button
                onClick={() => setShowEditForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
                      <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                      </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Étape</label>
                <select
                  value={editForm.stage || ''}
                  onChange={(e) => setEditForm({...editForm, stage: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Prospection">Prospection</option>
                  <option value="Devis">Devis</option>
                  <option value="Négociation">Négociation</option>
                  <option value="Conclu">Gagné</option>
                  <option value="Perdu">Non retenu</option>
                </select>
                    </div>

                    <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
                <select
                  value={editForm.priority || ''}
                  onChange={(e) => setEditForm({...editForm, priority: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Basse</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                </select>
                    </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valeur (MAD)</label>
                <input
                  type="number"
                  value={editForm.value || ''}
                  onChange={(e) => setEditForm({...editForm, value: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                  </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Probabilité (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editForm.probability || ''}
                  onChange={(e) => setEditForm({...editForm, probability: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prochaine action</label>
                <input
                  type="text"
                  value={editForm.nextAction || ''}
                  onChange={(e) => setEditForm({...editForm, nextAction: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigné à</label>
                <input
                  type="text"
                  value={editForm.assignedTo || ''}
                  onChange={(e) => setEditForm({...editForm, assignedTo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setShowEditForm(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
