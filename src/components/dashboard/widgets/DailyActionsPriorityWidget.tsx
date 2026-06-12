import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, Clock, DollarSign, Phone, Mail, Calendar, 
  ChevronRight, ChevronDown, Zap, Target, Users, TrendingUp,
  FileText, CheckCircle
} from 'lucide-react';
import { apiCall, showNotification, sendMessage, exportData } from '../../../services/apiService';
import { getMessages, getOffers, getDashboardStats } from '../../../utils/api';
import type { DashboardStats } from '../../../utils/api/types';
import { buildCorrelatedDailyActions } from '../../../utils/correlateLeadActions';
import { RealPipelineService } from '../../../services/realPipelineService';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalViews: 0,
  totalMessages: 0,
  totalOffers: 0,
  weeklyViews: 0,
  monthlyViews: 0,
  weeklyGrowth: 0,
  monthlyGrowth: 0,
};

interface DailyAction {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'call' | 'email' | 'meeting' | 'follow-up' | 'quote' | 'proposal';
  dueTime: string;
  contact?: {
    name: string;
    company: string;
    phone?: string;
    email?: string;
  };
  value?: number;
  status: 'pending' | 'in-progress' | 'completed';
  aiRecommendation?: string;
  estimatedDuration: number; // en minutes
  /** Alignement avec `public.leads` / Kanban */
  relatedLeadId?: string;
  sourceKind?: 'pipeline' | 'message' | 'offer' | 'stats';
  sourceId?: string;
}

interface Props {
  /** Données legacy optionnelles (fallback si aucune donnée Supabase) — forme libre. */
  data?: unknown[];
  widgetSize?: 'small' | 'medium' | 'large' | 'normal';
  onAction?: (action: string, data: any) => void;
}

function legacyPropsToActions(raw: unknown[]): DailyAction[] {
  return raw.slice(0, 12).map((row: any, i: number) => ({
    id: String(row?.id ?? `legacy-${i}`),
    title: String(row?.title ?? 'Action'),
    description: String(row?.description ?? ''),
    priority:
      row?.priority === 'high' || row?.priority === 'low' || row?.priority === 'medium'
        ? row.priority
        : 'medium',
    category: (row?.category as DailyAction['category']) || 'follow-up',
    dueTime: String(row?.dueTime ?? '10:00'),
    contact: row?.contact,
    value: Number(row?.value) || 0,
    status: row?.status === 'in-progress' || row?.status === 'completed' ? row.status : 'pending',
    aiRecommendation: row?.aiRecommendation,
    estimatedDuration: Number(row?.estimatedDuration) || 20,
  }));
}

type DialerMode = 'direct' | 'api';
type DialerProvider = 'twilio' | 'aircall' | 'ringover' | 'whatsapp' | 'custom';
type DialerConfig = {
  mode: DialerMode;
  provider: DialerProvider;
  apiBaseUrl: string;
  defaultCountryCode: string;
};

const DailyActionsPriorityWidget: React.FC<Props> = ({ 
  data = [], 
  widgetSize = 'medium',
  onAction 
}) => {
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'time' | 'value'>('priority');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [realActions, setRealActions] = useState<DailyAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialerSettings, setShowDialerSettings] = useState(false);
  const [dialerConfig, setDialerConfig] = useState<DialerConfig>({
    mode: 'direct',
    provider: 'twilio',
    apiBaseUrl: '',
    defaultCountryCode: '+33',
  });
  const { formatCurrency } = useWidgetMadCurrency();

  /** Après un contact réel, aligner `last_contact` du lead Kanban (cohérence multi-widgets). */
  const syncLeadAfterTouch = (action: DailyAction) => {
    if (!action.relatedLeadId) return;
    void RealPipelineService.updateLead(action.relatedLeadId, {
      last_contact: new Date().toISOString(),
    }).then((row) => {
      if (row) window.dispatchEvent(new Event('pipeline:refresh'));
    });
  };

  const loadRealData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [messagesRes, offersRes, statsRes, leadsRes] = await Promise.allSettled([
        getMessages(),
        getOffers(),
        getDashboardStats(),
        RealPipelineService.getLeads(),
      ]);
      const messages = messagesRes.status === 'fulfilled' ? messagesRes.value : [];
      const offers = offersRes.status === 'fulfilled' ? offersRes.value : [];
      const dashboardStats =
        statsRes.status === 'fulfilled' ? statsRes.value : EMPTY_DASHBOARD_STATS;
      const leads = leadsRes.status === 'fulfilled' ? leadsRes.value : [];

      let actions = buildCorrelatedDailyActions({
        leads,
        messages,
        offers,
        dashboardStats,
      }) as DailyAction[];

      if (actions.length === 0 && data.length > 0) {
        actions = legacyPropsToActions(data as unknown[]);
      }

      setRealActions(actions);
    } catch {
      setError('Impossible de charger les actions.');
      setRealActions(data.length > 0 ? legacyPropsToActions(data as unknown[]) : []);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void loadRealData();
  }, [loadRealData]);

  useEffect(() => {
    const onRefresh = () => {
      void loadRealData();
    };
    window.addEventListener('pipeline:refresh', onRefresh as EventListener);
    window.addEventListener('focus', onRefresh);
    const intervalId = window.setInterval(onRefresh, 60_000);
    return () => {
      window.removeEventListener('pipeline:refresh', onRefresh as EventListener);
      window.removeEventListener('focus', onRefresh);
      window.clearInterval(intervalId);
    };
  }, [loadRealData]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dailyActionsDialerConfig');
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<DialerConfig>;
      setDialerConfig((prev) => ({ ...prev, ...parsed }));
    } catch {
      // Ignore invalid payload.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('dailyActionsDialerConfig', JSON.stringify(dialerConfig));
  }, [dialerConfig]);

  // Utiliser les actions réelles au lieu des données simulées
  const displayActions = realActions;

  // Filtrer et trier les actions
  const filteredActions = displayActions
    .filter(action => {
      const priorityMatch = selectedPriority === 'all' || action.priority === selectedPriority;
      const categoryMatch = selectedCategory === 'all' || action.category === selectedCategory;
      const statusMatch = showCompleted || action.status !== 'completed';
      return priorityMatch && categoryMatch && statusMatch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'time':
          return a.dueTime.localeCompare(b.dueTime);
        case 'value':
          return (b.value || 0) - (a.value || 0);
        default:
          return 0;
      }
    });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'call': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'meeting': return <Users className="w-4 h-4" />;
      case 'follow-up': return <Clock className="w-4 h-4" />;
      case 'quote': return <FileText className="w-4 h-4" />;
      case 'proposal': return <Target className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'call': return 'text-blue-600';
      case 'email': return 'text-purple-600';
      case 'meeting': return 'text-green-600';
      case 'follow-up': return 'text-orange-600';
      case 'quote': return 'text-red-600';
      case 'proposal': return 'text-indigo-600';
      default: return 'text-gray-600';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'call': return 'Appel';
      case 'email': return 'Email';
      case 'meeting': return 'Réunion';
      case 'follow-up': return 'Suivi';
      case 'quote': return 'Devis';
      case 'proposal': return 'Proposition';
      default: return 'Autre';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in-progress': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'pending': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  const normalizePhone = (phone?: string) => {
    if (!phone) return '';
    const cleaned = phone.trim();
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
    if (cleaned.startsWith('0')) return `${dialerConfig.defaultCountryCode}${cleaned.slice(1)}`;
    return `${dialerConfig.defaultCountryCode}${cleaned}`;
  };

  const toDigits = (phone: string) => phone.replace(/[^\d]/g, '');

  const handleActionClick = (action: DailyAction, actionType: string, e?: React.MouseEvent) => {
    const button = e?.currentTarget as HTMLButtonElement | undefined;
    if (button) {
      button.disabled = true;
      button.style.opacity = '0.6';
      button.style.cursor = 'not-allowed';
    }

    console.log(`🔄 Action click: ${actionType}`, action);
    
    // Action immédiate
    if (onAction) {
      onAction(actionType, action);
    }
    
    // Notification immédiate
    showNotification('info', `Exécution de ${actionType}...`);
    
    // Actions synchrones immédiates
    switch (actionType) {
      case 'start':
        handleStartAction(action);
        break;
      case 'complete':
        handleCompleteAction(action);
        break;
      case 'contact':
        handleContactAction(action);
        break;
      case 'reschedule':
        handleRescheduleAction(action);
        break;
      default:
        showNotification('warning', `L'action "${actionType}" n'est pas encore implémentée`);
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

  const handleStartAction = (action: DailyAction) => {
    try {
      // Action immédiate - mise à jour du statut
      setRealActions(prev => prev.map(a => 
        a.id === action.id 
          ? { ...a, status: 'in-progress' as const }
          : a
      ));
      
      showNotification('success', `Action "${action.title}" démarrée`);
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/actions/start', { actionId: action.id }).catch(error => {
          console.error('Erreur API démarrage:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors du démarrage:', error);
      showNotification('error', 'Impossible de démarrer l\'action');
    }
  };

  const handleContactAction = (action: DailyAction) => {
    try {
      const phone = normalizePhone(action.contact?.phone);
      if (!phone) {
        showNotification('warning', 'Aucun numéro disponible pour cette action');
        return;
      }

      if (dialerConfig.mode === 'direct') {
        try {
          window.location.href = `tel:${phone}`;
          showNotification('success', `Dialer direct ouvert vers ${phone}`);
          syncLeadAfterTouch(action);
        } catch {
          void navigator.clipboard?.writeText(phone).catch(() => undefined);
          showNotification('warning', `Impossible d'ouvrir le dialer. Numéro copié: ${phone}`);
        }
        return;
      }

      if (!dialerConfig.apiBaseUrl) {
        try {
          window.location.href = `tel:${phone}`;
          showNotification('warning', "API non configurée: bascule en appel direct.");
          syncLeadAfterTouch(action);
        } catch {
          void navigator.clipboard?.writeText(phone).catch(() => undefined);
          showNotification('warning', "Configure l'URL API dialer pour lancer l'appel");
        }
        return;
      }

      setTimeout(() => {
        fetch(`${dialerConfig.apiBaseUrl.replace(/\/$/, '')}/calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: dialerConfig.provider,
            to: phone,
            action_id: action.id,
            label: action.title,
            region_hint: 'africa_europe',
          }),
        }).then((response) => {
          if (!response.ok) {
            throw new Error(`Dialer API error: ${response.status}`);
          }
          showNotification('success', `Appel lancé via API (${dialerConfig.provider})`);
          syncLeadAfterTouch(action);
        }).catch(error => {
          console.error('Erreur API appel:', error);
          showNotification('error', "Impossible de lancer l'appel API");
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors du contact:', error);
      showNotification('error', 'Impossible de contacter');
    }
  };

  const handleWhatsAppAction = (action: DailyAction) => {
    try {
      const phone = normalizePhone(action.contact?.phone);
      if (!phone) {
        showNotification('warning', 'Aucun numéro disponible pour WhatsApp');
        return;
      }
      const message = encodeURIComponent(`Bonjour ${action.contact?.name || ''}, suivi: ${action.title}`);
      const digits = toDigits(phone);
      const waUrl = `https://wa.me/${digits}?text=${message}`;
      const waWebUrl = `https://web.whatsapp.com/send?phone=${digits}&text=${message}`;

      if (dialerConfig.mode === 'direct' || dialerConfig.provider === 'whatsapp') {
        const popup = window.open(waUrl, '_blank', 'noopener,noreferrer');
        if (!popup) {
          window.open(waWebUrl, '_blank', 'noopener,noreferrer');
        }
        showNotification('success', 'Conversation WhatsApp ouverte');
        syncLeadAfterTouch(action);
        return;
      }

      if (!dialerConfig.apiBaseUrl) {
        const popup = window.open(waUrl, '_blank', 'noopener,noreferrer');
        if (!popup) {
          window.open(waWebUrl, '_blank', 'noopener,noreferrer');
        }
        showNotification('warning', "API non configurée: ouverture WhatsApp Web.");
        syncLeadAfterTouch(action);
        return;
      }

      fetch(`${dialerConfig.apiBaseUrl.replace(/\/$/, '')}/messages/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: dialerConfig.provider,
          to: phone,
          action_id: action.id,
          template: 'daily_action_followup',
        }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`WhatsApp API error: ${response.status}`);
        }
        showNotification('success', `WhatsApp envoyé via API (${dialerConfig.provider})`);
        syncLeadAfterTouch(action);
      }).catch((error) => {
        console.error('Erreur API WhatsApp:', error);
        showNotification('error', "Impossible d'envoyer le message WhatsApp");
      });
    } catch (error) {
      console.error('Erreur WhatsApp:', error);
      showNotification('error', 'Action WhatsApp impossible');
    }
  };

  const handleCompleteAction = (action: DailyAction) => {
    try {
      setRealActions((prev) =>
        prev.map((a) => (a.id === action.id ? { ...a, status: 'completed' as const } : a)),
      );

      showNotification('success', `Action "${action.title}" terminée`);

      if (action.relatedLeadId) {
        void (async () => {
          const updated = await RealPipelineService.updateLead(action.relatedLeadId!, {
            last_contact: new Date().toISOString(),
          });
          if (updated) {
            window.dispatchEvent(new Event('pipeline:refresh'));
          }
        })();
      }

      setTimeout(() => {
        apiCall('POST', '/api/actions/complete', { actionId: action.id }).catch((err) => {
          console.error('Erreur API complétion:', err);
        });
      }, 50);
    } catch (err) {
      console.error('Erreur lors de la complétion:', err);
      showNotification('error', 'Impossible de terminer l\'action');
    }
  };

  const handleRescheduleAction = (action: DailyAction) => {
    try {
      const newTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setRealActions((prev) =>
        prev.map((a) =>
          a.id === action.id
            ? {
                ...a,
                dueTime: newTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              }
            : a,
        ),
      );

      showNotification('success', `Action "${action.title}" reprogrammée`);

      if (action.relatedLeadId) {
        void (async () => {
          const updated = await RealPipelineService.updateLead(action.relatedLeadId!, {
            last_contact: newTime.toISOString(),
            next_action: `Reprogrammé : ${action.title}`,
          });
          if (updated) {
            window.dispatchEvent(new Event('pipeline:refresh'));
          }
        })();
      }

      setTimeout(() => {
        apiCall('POST', '/api/actions/reschedule', {
          actionId: action.id,
          newTime: newTime.toISOString(),
        }).catch((err) => {
          console.error('Erreur API reprogrammation:', err);
        });
      }, 50);
    } catch (err) {
      console.error('Erreur lors de la reprogrammation:', err);
      showNotification('error', 'Impossible de reprogrammer l\'action');
    }
  };

  const getTimeStatus = (dueTime: string | undefined) => {
    if (!dueTime) return 'upcoming';
    
    const now = new Date();
    const [hours, minutes] = dueTime.split(':').map(Number);
    const dueDate = new Date();
    dueDate.setHours(hours, minutes, 0, 0);
    
    const diffMs = dueDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < -1) return 'overdue';
    if (diffHours < 0) return 'due';
    if (diffHours < 1) return 'urgent';
    return 'upcoming';
  };

  const getTimeStatusColor = (status: string) => {
    switch (status) {
      case 'overdue': return 'text-red-600 bg-red-50';
      case 'due': return 'text-orange-600 bg-orange-50';
      case 'urgent': return 'text-yellow-600 bg-yellow-50';
      case 'upcoming': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Actions rapides avec réactivité maximale
  const handleQuickAction = (action: string, e?: React.MouseEvent) => {
    const button = e?.currentTarget as HTMLButtonElement | undefined;
    if (button) {
      button.disabled = true;
      button.style.opacity = '0.6';
      button.style.cursor = 'not-allowed';
    }

    console.log(`🔄 Action rapide: ${action}`);
    
    // Notification immédiate
    showNotification('info', `Exécution de ${action}...`);
    
    // Actions synchrones immédiates
    switch (action) {
      case 'new-task':
        handleNewTask();
        break;
      case 'auto-followup':
        handleAutoFollowup();
        break;
      case 'schedule':
        handleSchedule();
        break;
      case 'ai-report':
        handleAIReport();
        break;
      case 'export-actions':
        handleExportActions();
        break;
      case 'notify-team':
        handleNotifyTeam();
        break;
      case 'sync-crm':
        handleSyncCRM();
        break;
      case 'optimize-schedule':
        handleOptimizeSchedule();
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

  const handleNewTask = () => {
    try {
      // Action immédiate
      showNotification('success', 'Nouvelle tâche créée');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/actions/create', { 
          title: 'Nouvelle tâche',
          priority: 'medium',
          category: 'follow-up'
        }).catch(error => {
          console.error('Erreur API création tâche:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la création de tâche:', error);
      showNotification('error', 'Impossible de créer la tâche');
    }
  };

  const handleAutoFollowup = () => {
    try {
      // Action immédiate
      showNotification('success', 'Relances automatiques programmées');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/actions/auto-followup', { 
          actions: filteredActions.filter(a => a.status === 'pending')
        }).catch(error => {
          console.error('Erreur API relance auto:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la relance auto:', error);
      showNotification('error', 'Impossible de programmer les relances');
    }
  };

  const handleSchedule = () => {
    try {
      // Action immédiate
      showNotification('success', 'Actions planifiées');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/actions/schedule', { 
          actions: filteredActions.filter(a => a.status === 'pending')
        }).catch(error => {
          console.error('Erreur API planification:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la planification:', error);
      showNotification('error', 'Impossible de planifier les actions');
    }
  };

  const handleAIReport = () => {
    try {
      // Action immédiate
      showNotification('success', 'Rapport IA généré et exporté');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('GET', '/api/actions/ai-report', { 
          actions: filteredActions
        }).then(report => {
          exportData(report, 'rapport-actions-ia', 'pdf').catch(error => {
            console.error('Erreur export rapport:', error);
          });
        }).catch(error => {
          console.error('Erreur API rapport IA:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la génération du rapport:', error);
      showNotification('error', 'Impossible de générer le rapport IA');
    }
  };

  const handleExportActions = () => {
    try {
      // Action immédiate
      exportData(filteredActions, 'actions-prioritaires', 'excel');
      showNotification('success', 'Actions exportées');
      
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      showNotification('error', 'Impossible d\'exporter les actions');
    }
  };

  const handleNotifyTeam = () => {
    try {
      // Action immédiate
      showNotification('success', 'Équipe notifiée');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        sendMessage('TEAM', 'all', `Actions prioritaires du jour : ${filteredActions.length} tâches`).catch(error => {
          console.error('Erreur API notification équipe:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la notification:', error);
      showNotification('error', 'Impossible de notifier l\'équipe');
    }
  };

  const handleSyncCRM = () => {
    try {
      // Action immédiate
      showNotification('success', 'CRM synchronisé');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/actions/sync-crm', { 
          actions: filteredActions
        }).catch(error => {
          console.error('Erreur API sync CRM:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de la synchronisation CRM:', error);
      showNotification('error', 'Impossible de synchroniser le CRM');
    }
  };

  const handleOptimizeSchedule = () => {
    try {
      // Action immédiate
      showNotification('success', 'Planning optimisé par IA');
      
      // Appel API en arrière-plan (sans await)
      setTimeout(() => {
        apiCall('POST', '/api/actions/optimize-schedule', { 
          actions: filteredActions
        }).catch(error => {
          console.error('Erreur API optimisation planning:', error);
        });
      }, 50);
      
    } catch (error) {
      console.error('Erreur lors de l\'optimisation:', error);
      showNotification('error', 'Impossible d\'optimiser le planning');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Actions Commerciales Prioritaires</h3>
            <p className="text-sm text-gray-600">
              {loading
                ? 'Chargement des données réelles...'
                : error
                  ? 'Erreur de connexion'
                  : 'Leads du Kanban, messages et offres — même source que le pipeline commercial'}
            </p>
          </div>
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
          <span className="text-sm text-gray-500">
            {filteredActions.filter(a => a.status === 'pending').length} en attente
          </span>
          <button
            onClick={() => setShowDialerSettings((v) => !v)}
            className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded hover:bg-orange-200 transition-colors"
          >
            Dialer
          </button>
        </div>
      </div>

      {showDialerSettings && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-xs text-orange-800">
              Mode
              <select
                value={dialerConfig.mode}
                onChange={(e) => setDialerConfig((prev) => ({ ...prev, mode: e.target.value as DialerMode }))}
                className="mt-1 w-full border border-orange-200 rounded px-2 py-1 text-sm"
              >
                <option value="direct">Dialer direct</option>
                <option value="api">API dialer</option>
              </select>
            </label>
            <label className="text-xs text-orange-800">
              Provider
              <select
                value={dialerConfig.provider}
                onChange={(e) => setDialerConfig((prev) => ({ ...prev, provider: e.target.value as DialerProvider }))}
                className="mt-1 w-full border border-orange-200 rounded px-2 py-1 text-sm"
              >
                <option value="twilio">Twilio</option>
                <option value="aircall">Aircall</option>
                <option value="ringover">Ringover</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="custom">Custom SIP/API</option>
              </select>
            </label>
            <label className="text-xs text-orange-800">
              Indicatif
              <input
                value={dialerConfig.defaultCountryCode}
                onChange={(e) => setDialerConfig((prev) => ({ ...prev, defaultCountryCode: e.target.value }))}
                className="mt-1 w-full border border-orange-200 rounded px-2 py-1 text-sm"
                placeholder="+33 / +212 / +225"
              />
            </label>
            <label className="text-xs text-orange-800">
              URL API
              <input
                value={dialerConfig.apiBaseUrl}
                onChange={(e) => setDialerConfig((prev) => ({ ...prev, apiBaseUrl: e.target.value }))}
                className="mt-1 w-full border border-orange-200 rounded px-2 py-1 text-sm"
                placeholder="https://dialer-api.example.com"
              />
            </label>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1"
          >
            <option value="all">Toutes priorités</option>
            <option value="high">Haute</option>
            <option value="medium">Moyenne</option>
            <option value="low">Basse</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1"
          >
            <option value="all">Toutes catégories</option>
            <option value="call">Appels</option>
            <option value="email">Emails</option>
            <option value="meeting">Rendez-vous</option>
            <option value="follow-up">Suivi</option>
            <option value="quote">Devis</option>
            <option value="proposal">Propositions</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1"
          >
            <option value="priority">Par priorité</option>
            <option value="time">Par heure</option>
            <option value="value">Par valeur</option>
          </select>
        </div>
        
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded"
          />
          Afficher terminées
        </label>
      </div>

      {/* Liste des actions */}
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
        <div className="space-y-3">
          {filteredActions.map((action) => {
          const timeStatus = getTimeStatus(action.dueTime);
          
          return (
            <div key={action.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5">
                    {getStatusIcon(action.status)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-semibold text-gray-900">{action.title}</h4>
                      {action.sourceKind === 'pipeline' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                          Kanban
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded-full text-xs border ${getPriorityColor(action.priority)}`}>
                        {action.priority === 'high' ? 'Haute' : action.priority === 'medium' ? 'Moyenne' : 'Basse'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{action.description}</p>
                    
                    {/* Contact : masquer les lignes redondantes avec la description */}
                    {action.contact &&
                      (action.contact.name ||
                        action.contact.company ||
                        action.contact.phone ||
                        action.contact.email) && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 mb-2">
                        {(action.contact.name || '').trim() ? (
                          <span className="font-medium">{action.contact.name.trim()}</span>
                        ) : null}
                        {(action.contact.name || '').trim() &&
                        (action.contact.company || '').trim() ? (
                          <span aria-hidden>•</span>
                        ) : null}
                        {(action.contact.company || '').trim() ? (
                          <span>{action.contact.company.trim()}</span>
                        ) : null}
                        {action.contact.phone ? (
                          <>
                            {((action.contact.name || '').trim() ||
                              (action.contact.company || '').trim()) && (
                              <span aria-hidden>•</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {action.contact.phone}
                            </span>
                          </>
                        ) : null}
                        {action.contact.email ? (
                          <>
                            {((action.contact.name || '').trim() ||
                              (action.contact.company || '').trim() ||
                              action.contact.phone) && (
                              <span aria-hidden>•</span>
                            )}
                            <span className="truncate max-w-[200px]" title={action.contact.email}>
                              {action.contact.email}
                            </span>
                          </>
                        ) : null}
                      </div>
                    )}
                    
                    {/* AI Recommendation */}
                    {action.aiRecommendation && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2">
                        <div className="flex items-start gap-2">
                          <Zap className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-800">{action.aiRecommendation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  {/* Time and value */}
                  <div className="text-right">
                    <div className={`text-sm font-medium px-2 py-1 rounded ${getTimeStatusColor(timeStatus)}`}>
                      {action.dueTime || 'Non définie'}
                    </div>
                    {action.value && (
                      <div className="text-sm font-semibold text-green-600 mt-1">
                        {formatCurrency(action.value)}
                      </div>
                    )}
                  </div>
                  
                  {/* Category icon */}
                  <div className={`p-2 rounded-lg ${getCategoryColor(action.category)} bg-gray-100`}>
                    {getCategoryIcon(action.category)}
                  </div>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-3 h-3" />
                  <span>{action.estimatedDuration} min</span>
                  {action.value && (
                    <>
                      <span>•</span>
                      <DollarSign className="w-3 h-3" />
                      <span>Valeur élevée</span>
                    </>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {action.status === 'pending' && (
                    <>
                      <button
                        onClick={(e) => handleActionClick(action, 'start', e)}
                        className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors"
                      >
                        Démarrer
                      </button>
                      <button
                        onClick={(e) => handleActionClick(action, 'contact', e)}
                        className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors"
                      >
                        Contacter
                      </button>
                      <button
                        onClick={() => handleWhatsAppAction(action)}
                        className="text-xs bg-green-100 text-green-800 border border-green-300 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors"
                      >
                        WhatsApp
                      </button>
                    </>
                  )}
                  
                  {action.status === 'in-progress' && (
                    <button
                      onClick={(e) => handleActionClick(action, 'complete', e)}
                      className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors"
                    >
                      Terminer
                    </button>
                  )}
                  
                  <button
                    onClick={(e) => handleActionClick(action, 'reschedule', e)}
                    className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors"
                  >
                    Reprogrammer
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Automatisations (client léger : API simulée sauf export) */}
      <div className="border-t border-gray-200 pt-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Automatisations</h4>
            <p className="text-[11px] text-gray-500 mt-1 max-w-2xl">
              <span className="font-medium text-gray-700">Exporter</span> génère un fichier depuis les actions affichées.
              Les autres boutons passent par une <span className="font-medium">simulation d&apos;API</span> (aucun serveur métier pour l&apos;instant).
            </p>
          </div>
          <button
            className="p-1 text-orange-500 hover:text-orange-700 transition-colors shrink-0"
            onClick={() => setShowQuickActions((v) => !v)}
            title={showQuickActions ? 'Fermer' : 'Ouvrir'}
          >
            {showQuickActions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        {showQuickActions && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('new-task', e)}
            >
              Nouvelle tâche <span className="opacity-70">· démo</span>
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('auto-followup', e)}
            >
              Relance auto <span className="opacity-70">· démo</span>
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('schedule', e)}
            >
              Planifier <span className="opacity-70">· démo</span>
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('ai-report', e)}
            >
              Rapport IA <span className="opacity-70">· démo</span>
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('export-actions', e)}
            >
              Exporter
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('notify-team', e)}
            >
              Notifier équipe <span className="opacity-70">· démo</span>
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('sync-crm', e)}
            >
              Sync CRM <span className="opacity-70">· démo</span>
            </button>
            <button 
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors" 
              onClick={(e) => handleQuickAction('optimize-schedule', e)}
            >
              Optimiser planning <span className="opacity-70">· démo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyActionsPriorityWidget; 