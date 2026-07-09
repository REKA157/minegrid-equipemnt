import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Clock, Phone, Mail,
  Zap, Target, Users,
  FileText, CheckCircle
} from 'lucide-react';
import { showNotification, exportData } from '../../../services/apiService';
import { getMessages, getOffers, getDashboardStats } from '../../../utils/api';
import type { DashboardStats } from '../../../utils/api/types';
import { buildCorrelatedDailyActions } from '../../../utils/correlateLeadActions';
import { RealPipelineService } from '../../../services/realPipelineService';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';
import { readPersistedActionStates, persistActionState } from '../../../utils/dailyActionStatus';

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

// Statuts d'action persistés : SOURCE UNIQUE partagée (cf. utils/dailyActionStatus),
// pour que le Pipeline affiche le même « traité / en cours » sur ses cartes de lead.

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
  const [realActions, setRealActions] = useState<DailyAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialerSettings, setShowDialerSettings] = useState(false);
  const [dialerConfig, setDialerConfig] = useState<DialerConfig>({
    mode: 'direct',
    provider: 'twilio',
    apiBaseUrl: '',
    defaultCountryCode: '+212', // Maroc — marché principal de la plateforme.
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

      // Réapplique les statuts mémorisés (terminée / en cours / reprogrammée) :
      // sans ça, chaque reconstruction (60 s, focus, refresh) les effaçait.
      const saved = readPersistedActionStates();
      actions = actions.map((a) => {
        const st = saved[a.id];
        if (!st) return a;
        return {
          ...a,
          ...(st.status ? { status: st.status } : {}),
          ...(st.dueTime ? { dueTime: st.dueTime } : {}),
        };
      });

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
      // Les actions TERMINÉES descendent toujours en bas (si affichées).
      const doneRank = (x: DailyAction) => (x.status === 'completed' ? 1 : 0);
      const done = doneRank(a) - doneRank(b);
      if (done !== 0) return done;
      switch (sortBy) {
        case 'priority': {
          const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          // À priorité égale : l'échéance la plus proche d'abord.
          return (
            priorityOrder[b.priority] - priorityOrder[a.priority] ||
            a.dueTime.localeCompare(b.dueTime)
          );
        }
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
    
    // (Pas de notification « Exécution de… » : chaque handler notifie son
    // résultat réel — une seule notification honnête au lieu de deux.)
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
      setRealActions(prev => prev.map(a =>
        a.id === action.id
          ? { ...a, status: 'in-progress' as const }
          : a
      ));
      // MÉMORISÉ : le statut survit aux reconstructions (60 s / focus / refresh).
      persistActionState(action.id, { status: 'in-progress' });
      showNotification('success', `Action "${action.title}" démarrée`);
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
      // MÉMORISÉ : une action terminée ne ressuscite plus à la reconstruction.
      persistActionState(action.id, { status: 'completed' });

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
    } catch (err) {
      console.error('Erreur lors de la complétion:', err);
      showNotification('error', 'Impossible de terminer l\'action');
    }
  };

  const handleRescheduleAction = (action: DailyAction) => {
    try {
      const newTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newDueTime = newTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setRealActions((prev) =>
        prev.map((a) => (a.id === action.id ? { ...a, dueTime: newDueTime } : a)),
      );
      // MÉMORISÉ : le report survit aux reconstructions.
      persistActionState(action.id, { dueTime: newDueTime });

      showNotification('success', `Action "${action.title}" reprogrammée à demain ${newDueTime}`);

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

    // Seule action rapide restante : l'export CSV (réel). Il notifie lui-même
    // son succès/erreur — pas de « Exécution de… » générique.
    switch (action) {
      case 'export-actions':
        handleExportActions();
        break;
      default:
        break;
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

  const handleExportActions = () => {
    try {
      // Action immédiate
      // Export RÉEL : seul le format csv déclenche un vrai téléchargement.
      void exportData(filteredActions, 'actions-prioritaires', 'csv').then((r) => {
        if (r?.success) showNotification('success', 'Actions exportées (fichier CSV téléchargé)');
        else showNotification('error', "L'export a échoué. Réessayez.");
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      showNotification('error', 'Impossible d\'exporter les actions');
    }
  };

  return (
    // Chrome allégé : la carte hôte (shell) fournit déjà bordure + fond + padding,
    // et affiche le TITRE dans sa barre — pas d'en-tête interne dupliqué ici.
    <div className="bg-white rounded-lg p-4">
      {/* Fine rangée d'état/outils (le titre vit dans la barre de la carte). */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
        )}
        {error && (
          <div className="text-red-600 text-xs bg-red-100 px-2 py-1 rounded">
            ⚠️ Erreur de connexion
          </div>
        )}
        <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">
          {filteredActions.filter(a => a.status === 'pending').length} en attente
        </span>
        <button
          onClick={() => setShowDialerSettings((v) => !v)}
          className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded hover:bg-orange-200 transition-colors"
          title="Réglages d'appel (téléphonie)"
        >
          Appels
        </button>
      </div>

      {showDialerSettings && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
          {/* auto-fit : s'adapte à la largeur RÉELLE de la carte (pas au viewport). */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
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
        <div className="space-y-2">
          {filteredActions.map((action) => {
          const timeStatus = getTimeStatus(action.dueTime);
          
          return (
            <div key={action.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
              {/* Ligne 1 — DÉCISION : statut, titre, priorité ; échéance + valeur à droite. */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="shrink-0">{getStatusIcon(action.status)}</span>
                <h4 className="font-semibold text-gray-900 truncate min-w-0" title={action.title}>
                  {action.title}
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-xs border shrink-0 ${getPriorityColor(action.priority)}`}>
                  {action.priority === 'high' ? 'Haute' : action.priority === 'medium' ? 'Moyenne' : 'Basse'}
                </span>
                {action.sourceKind === 'pipeline' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200 shrink-0">
                    Kanban
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${getTimeStatusColor(timeStatus)}`}>
                    {action.dueTime || 'Non définie'}
                  </span>
                  {action.value ? (
                    <span className="text-xs font-semibold text-green-600 whitespace-nowrap">
                      {formatCurrency(action.value)}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Ligne 2 — MÉTA unique : durée · contact · société · téléphone. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500">
                <span className="whitespace-nowrap">{action.estimatedDuration} min</span>
                {(action.contact?.name || '').trim() ? (
                  <>
                    <span aria-hidden>·</span>
                    <span
                      className="font-medium text-gray-700 truncate max-w-[180px]"
                      title={[action.contact?.name, action.contact?.phone, action.contact?.email]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      {(action.contact?.name || '').trim()}
                    </span>
                  </>
                ) : null}
                {(action.contact?.company || '').trim() ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate max-w-[160px]">{(action.contact?.company || '').trim()}</span>
                  </>
                ) : null}
                {action.contact?.phone ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Phone className="w-3 h-3" />
                      {action.contact.phone}
                    </span>
                  </>
                ) : null}
              </div>

              {/* Ligne 3 — contexte : 1 ligne, détail au survol. */}
              {action.description ? (
                <p className="mt-1 text-sm text-gray-600 line-clamp-1" title={action.description}>
                  {action.description}
                </p>
              ) : null}

              {/* Ligne 4 — conseil : 1 ligne discrète (fini le pavé encadré). */}
              {action.aiRecommendation ? (
                <p className="mt-1 text-xs text-blue-700 line-clamp-1" title={action.aiRecommendation}>
                  <Zap className="w-3 h-3 inline -mt-0.5 mr-1" />
                  {action.aiRecommendation}
                </p>
              ) : null}

              {/* Boutons : 2 visibles max (la PROCHAINE étape + le canal n°1) ;
                  le reste dans un menu « ⋯ » sans nouvel état React. */}
              <div className="mt-2 flex flex-wrap items-center gap-2 justify-end">
                {action.status === 'pending' && (
                  <>
                    <button
                      onClick={(e) => handleActionClick(action, 'start', e)}
                      className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors"
                    >
                      Démarrer
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
                    className="text-xs bg-orange-600 text-white border border-orange-600 px-3 py-1 rounded-lg hover:bg-orange-700 transition-colors font-semibold"
                  >
                    Terminer
                  </button>
                )}
                <details className="relative">
                  <summary
                    className="list-none cursor-pointer text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 select-none"
                    title="Plus d'actions"
                  >
                    ⋯
                  </summary>
                  <div className="absolute right-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[170px]">
                    <button
                      onClick={(e) => handleActionClick(action, 'contact', e)}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Appeler (téléphone)
                    </button>
                    <button
                      onClick={(e) => handleActionClick(action, 'reschedule', e)}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Reprogrammer à demain
                    </button>
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Export des actions affichées (fichier CSV réel — seule automatisation réellement branchée). */}
      <div className="border-t border-gray-200 pt-4 mt-6">
        <button
          className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-2 rounded-lg hover:bg-orange-200 transition-colors"
          onClick={(e) => handleQuickAction('export-actions', e)}
        >
          Exporter les actions (CSV)
        </button>
      </div>
    </div>
  );
};

export default DailyActionsPriorityWidget; 