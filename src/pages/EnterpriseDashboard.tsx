import React, { useState, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Building2,
  Users,
  Package,
  Truck,
  Wrench,
  Calendar,
  FileText,
  CheckCircle,
  ArrowRight,
  Star,
  Shield,
  Zap,
  Globe,
  Smartphone,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  Settings,
  Layout,
  PieChart,
  Activity,
  DollarSign,
  Clock,
  Target,
  RefreshCw,
  Bell,
  User,
  LogOut,
  Plus,
  MoreHorizontal,
  GripVertical,
  X,
  Maximize2,
  Minimize2,
  Edit,
  Play,
  Check,
  Trash2,
  Mail,
  Info,
  AlertTriangle,
  AlertCircle,
  Save,
  Download,
  Brain,
  Lightbulb,
  Award,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Share2,
  Copy,
  ExternalLink,
  BookOpen,
  Calculator,
  LineChart,
  ScatterChart,
  AreaChart,
  BarChart as BarChartIcon,
  Target as TargetIcon,
  TrendingUp as TrendingUpIcon
} from 'lucide-react';
import { PieChart as PieChartIcon, Pie, Cell, ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import {
  getDailyInterventions,
  getRepairsStatus,
  getInventoryStatus,
  getTechniciansWorkload,
  getMechanicStats,
  updateRepairStatus,
  assignTechnicianToRepair,
  createIntervention,
  getTechnicians,
  getEquipmentList,
  getInterventionsByStatus,
  getRentalRevenue,
  getEquipmentAvailability,
  getUpcomingRentals,
  getPreventiveMaintenance,
  createRental,
  updateRentalStatus,
  updateRental,
  createMaintenanceIntervention
} from '../utils/enterpriseApi';
import supabase from '../utils/supabaseClient';
import { VendeurWidgets } from './widgets/VendeurWidgets';
import { PlanningWidget } from "./enterprise/widgets/PlanningWidget";
import { EquipmentAvailabilityWidget } from "./enterprise/widgets/EquipmentAvailabilityWidget";
import { PreventiveMaintenanceWidget } from "./enterprise/widgets/PreventiveMaintenanceWidget";
import { getChartData } from "./enterprise/widgets/getChartData";
import { SalesPipelineWidget } from "./enterprise/widgets/SalesPipelineWidget";
import { InventoryStatusWidget } from "./enterprise/widgets/InventoryStatusWidget";
import { NotificationsWidget } from "./enterprise/widgets/NotificationsWidget";
import { AdvancedKPIsWidget } from "./enterprise/widgets/AdvancedKPIsWidget";
import { InterventionForm } from "./enterprise/widgets/InterventionForm";
import { EditRentalForm } from "./enterprise/widgets/EditRentalForm";
import { RentalDetailsModal } from "./enterprise/widgets/RentalDetailsModal";
import { getDailyActionsData } from "./enterprise/widgets/getDailyActionsData";
import { getAdvancedKPIsData } from "./enterprise/widgets/getAdvancedKPIsData";
import { getPlanningData } from "./enterprise/widgets/getPlanningData";

// Import supprimé car le composant est défini localement

const ResponsiveGridLayout = WidthProvider(Responsive);

// Mapping des icônes pour la récupération depuis la configuration
import type { Widget, WidgetLayout, DashboardConfig } from './enterprise/types';
import { CalendarWidget } from "./enterprise/widgets/CalendarWidget";
import { getListData } from "./enterprise/widgets/getListData";
import { useAdaptiveWidget } from "./enterprise/widgets/useAdaptiveWidget";
import { getNotificationsData } from "./enterprise/widgets/getNotificationsData";
import { RentalForm } from "./enterprise/widgets/RentalForm";
import { getEquipmentAvailabilityData } from "./enterprise/widgets/getEquipmentAvailabilityData";
import { widgetConfigs } from "./enterprise/widgets/widgetConfigs";
import { iconMap } from "./enterprise/widgets/iconMap";
import { DonutChart } from "./enterprise/widgets/DonutChart";
import { Modal } from "./enterprise/widgets/Modal";
import { getCalendarData } from "./enterprise/widgets/getCalendarData";
import { getMapData } from "./enterprise/widgets/getMapData";
import { getMetricData } from "./enterprise/widgets/getMetricData";
import { ChartWidget } from "./enterprise/widgets/ChartWidget";
import { MetricWidget } from "./enterprise/widgets/MetricWidget";
import { MapWidget } from "./enterprise/widgets/MapWidget";
import { ListWidget } from "./enterprise/widgets/ListWidget";
import { WidgetComponent } from "./enterprise/widgets/WidgetComponent";
import { renderWidgetContent } from "./enterprise/widgets/renderWidgetContent";
import { toast } from '../utils/toast';
// Hook pour l'adaptation automatique des widgets
// Données simulées pour les widgets
// Nouveau composant Score de Performance Commerciale
// Composant Score de Performance Commerciale avec toutes les fonctionnalités
// Composant widget modulaire
// Composant pour afficher les détails d'une location
// Composant pour éditer une location existante
// Widget Actions Prioritaires du Jour avec IA

export default function EnterpriseDashboard() {
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [layout, setLayout] = useState<{ [key: string]: WidgetLayout[] }>({ lg: [] });
  const [dataVersion, setDataVersion] = useState(0);
  const [showInterventionForm, setShowInterventionForm] = useState(false);
  const [showRentalForm, setShowRentalForm] = useState(false);
  const [showRentalDetails, setShowRentalDetails] = useState(false);
  const [showEditRentalForm, setShowEditRentalForm] = useState(false);
  const [selectedRental, setSelectedRental] = useState<any>(null);
  const [modalContent, setModalContent] = useState<React.ReactNode | null>(null);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMetier, setSelectedMetier] = useState<string>('vendeur');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDashboards, setSavedDashboards] = useState<any[]>([]);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const handleShowDetails = (content: React.ReactNode) => {
    setModalContent(content);
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('✅ Session utilisateur trouvée:', session);
          setIsAuthenticated(true);
        } else {
          console.error('❌ AUCUNE SESSION UTILISATEUR TROUVÉE. Veuillez vous connecter pour voir les données.');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Erreur lors de la vérification de la session:", error);
        setIsAuthenticated(false);
      } finally {
        setSessionChecked(true);
      }
    };
    checkSession();
  }, []);

  // Système de rafraîchissement automatique
  useEffect(() => {
    if (!isAuthenticated) return;

    // Démarrer le rafraîchissement automatique toutes les 2 minutes
    const interval = setInterval(() => {
      console.log('🔄 Rafraîchissement automatique des données...');
      refreshDashboardData();
    }, 120000); // 2 minutes

    setAutoRefreshInterval(interval);

    // Nettoyer l'intervalle lors du démontage
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isAuthenticated]);

  // Nettoyer l'intervalle lors du démontage du composant
  useEffect(() => {
    return () => {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }
    };
  }, [autoRefreshInterval]);

  useEffect(() => {
    // 1. Essayer de charger la configuration depuis le DashboardConfigurator
    const savedConfig = localStorage.getItem('enterpriseDashboardConfig');
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      console.log('🎯 [DEBUG] Configuration trouvée:', config.metier, 'Widgets:', config.widgets?.length);
      
      if (config.widgets && config.widgets.length > 0) {
        // Configuration du DashboardConfigurator trouvée
        const widgets: Widget[] = config.widgets.map((widget: any, index: number) => ({
          id: widget.id,
          type: widget.type as any,
          title: widget.title,
          description: widget.description,
          icon: iconMap[widget.icon?.name] || Target,
          enabled: widget.enabled !== false,
          dataSource: widget.dataSource,
          isCollapsed: false,
          position: widget.position || index
        }));
        
        const dashboardConfig: DashboardConfig = { 
          widgets, 
          theme: 'light', 
          layout: 'grid', 
          refreshInterval: 30, 
          notifications: true 
        };
        
        setDashboardConfig(dashboardConfig);
        setSelectedMetier(config.metier || 'vendeur');
        
        // Générer le layout
        if (config.layout?.lg) {
          setLayout(config.layout);
        } else {
          const defaultLayout = generateLayout(widgets);
          setLayout({ lg: defaultLayout });
        }
      } else {
        // Fallback vers la configuration par défaut vendeur
        loadDefaultVendeurConfig();
      }
    } else {
      // Aucune configuration trouvée, charger la configuration par défaut vendeur
      loadDefaultVendeurConfig();
    }
    setLoading(false);
  }, []);

  // Fonction pour charger la configuration par défaut vendeur
  const loadDefaultVendeurConfig = () => {
    console.log('🔄 [DEBUG] Chargement de la configuration par défaut vendeur');
    const widgets: Widget[] = VendeurWidgets.widgets.map((widget, index) => {
      console.log("🔍 [DEBUG] Widget trouvé:", widget.id, "Type:", widget.type, "Titre:", widget.title);
      
      // Log spécial pour le widget sales-evolution
      if (widget.id === 'sales-evolution') {
        console.log("🎯 [DEBUG] Widget sales-evolution trouvé dans la configuration!");
        console.log("🎯 [DEBUG] Détails du widget:", {
          id: widget.id,
          type: widget.type,
          title: widget.title,
          dataSource: widget.dataSource,
          priority: widget.priority
        });
      }
      
      return {
        id: widget.id,
        type: widget.type as any,
        title: widget.title,
        description: widget.description,
        icon: iconMap[widget.icon.name] || Target,
        enabled: true, // Activer tous les widgets enrichis
        dataSource: widget.dataSource,
        isCollapsed: false,
        position: index
      };
    });
    const defaultConfig: DashboardConfig = { widgets, theme: 'light', layout: 'grid', refreshInterval: 30, notifications: true };
    setDashboardConfig(defaultConfig);
    const defaultLayout = generateLayout(widgets);
    setLayout({ lg: defaultLayout });
    setSelectedMetier('vendeur');
  };

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [techs, equip] = await Promise.all([
          getTechnicians(),
          getEquipmentList()
        ]);
        setTechnicians(techs);
        setEquipment(equip);
      } catch (error) {
        console.error('Erreur lors du chargement des données de référence:', error);
      }
    };
    loadReferenceData();
  }, []);

  const generateLayout = (widgets: Widget[]): WidgetLayout[] => {
    // Trier les widgets par position pour respecter l'ordre de réorganisation
    const sortedWidgets = widgets.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    console.log("📐 [DEBUG] Génération du layout pour", sortedWidgets.length, "widgets");
    console.log("📐 [DEBUG] Widgets dans le layout:", sortedWidgets.map(w => ({ id: w.id, title: w.title, position: w.position })));

    return sortedWidgets.map((widget, index) => {
      // Disposition 1/3 - 2/3 : les 2 premiers widgets à gauche (1/3), les 2 suivants à droite (2/3)
      if (index < 2) {
        // Colonne gauche (1/3) - widgets 0 et 1
        return {
          i: widget.id,
          x: 0, // Position x = 0 (début)
          y: index, // Position y = 0 pour le premier, 1 pour le deuxième
          w: 4, // Largeur = 4 colonnes sur 12 (1/3)
          h: 2, // Hauteur = 2 unités
        };
      } else if (index < 4) {
        // Colonne droite (2/3) - widgets 2 et 3
        return {
          i: widget.id,
          x: 4, // Position x = 4 (après la colonne gauche)
          y: index - 2, // Position y = 0 pour le troisième, 1 pour le quatrième
          w: 8, // Largeur = 8 colonnes sur 12 (2/3)
          h: 2, // Hauteur = 2 unités
        };
      } else {
        // Widgets supplémentaires (au-delà de 4) - disposition en grille complète
        const row = Math.floor((index - 4) / 3);
        const col = (index - 4) % 3;
        return {
          i: widget.id,
          x: col * 4, // 3 colonnes de 4 unités chacune
          y: row + 2, // Commencer après les 2 premières lignes
          w: 4, // Largeur = 4 colonnes
          h: 2, // Hauteur = 2 unités
        };
      }
    });
  };

  const onLayoutChange = (layout: WidgetLayout[], allLayouts: { [key: string]: WidgetLayout[] }) => {
    setLayout(allLayouts);
    // Sauvegarder dans localStorage
    const savedConfig = JSON.parse(localStorage.getItem('enterpriseDashboardConfig') || '{}');
    savedConfig.layouts = allLayouts;
    localStorage.setItem('enterpriseDashboardConfig', JSON.stringify(savedConfig));
  };

  const handleRemoveWidget = (widgetId: string) => {
    if (!dashboardConfig) return;
    const newWidgets = dashboardConfig.widgets.filter(w => w.id !== widgetId);
    setDashboardConfig({ ...dashboardConfig, widgets: newWidgets });

    // Remove from layouts
    const newLayouts = { ...layout };
    for (const key in newLayouts) {
        newLayouts[key] = newLayouts[key].filter(l => l.i !== widgetId);
    }
    setLayout(newLayouts);

    // Persist changes
    const savedConfig = JSON.parse(localStorage.getItem('enterpriseDashboardConfig') || '{}');
    savedConfig.dashboardConfig = { ...dashboardConfig, widgets: newWidgets };
    savedConfig.layouts = newLayouts;
    localStorage.setItem('enterpriseDashboardConfig', JSON.stringify(savedConfig));
  };

  const handleToggleSize = (widgetId: string) => {
    const newLayouts = { ...layout };
    let changed = false;
    for (const key in newLayouts) {
        newLayouts[key] = newLayouts[key].map(l => {
            if (l.i === widgetId) {
                changed = true;
                // Cycle through 1/3, 2/3, 3/3 width. Assume 12 columns.
                const currentW = l.w;
                let nextW;
                if (currentW < 8) nextW = 8; // 2/3
                else if (currentW < 12) nextW = 12; // 3/3
                else nextW = 4; // 1/3
                return { ...l, w: nextW, h: l.h }; // Keep height for now
            }
            return l;
        });
    }

    if (changed) {
        setLayout(newLayouts);
        // Persist changes
        const savedConfig = JSON.parse(localStorage.getItem('enterpriseDashboardConfig') || '{}');
        savedConfig.layouts = newLayouts;
        localStorage.setItem('enterpriseDashboardConfig', JSON.stringify(savedConfig));
    }
  };

  const handleToggleVisibility = (widgetId: string) => {
    if (!dashboardConfig) return;
    const newWidgets = dashboardConfig.widgets.map(w => {
        if (w.id === widgetId) {
            return { ...w, isCollapsed: !w.isCollapsed };
        }
        return w;
    });
    const newConfig = { ...dashboardConfig, widgets: newWidgets };
    setDashboardConfig(newConfig);

    // Persist changes
    const savedConfig = JSON.parse(localStorage.getItem('enterpriseDashboardConfig') || '{}');
    savedConfig.dashboardConfig = newConfig;
    localStorage.setItem('enterpriseDashboardConfig', JSON.stringify(savedConfig));
  };

  const handleMarkRepairComplete = async (repairId: string) => {
    try {
      await updateRepairStatus(repairId, 'Terminé');
      // Recharger les données du dashboard
      if (dashboardConfig) {
        const newConfig = { ...dashboardConfig };
        setDashboardConfig(newConfig);
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
    }
  };

  const handleAssignTechnician = async (repairId: string, technicianId: string, technicianName: string) => {
    try {
      await assignTechnicianToRepair(repairId, technicianId, technicianName);
      // Recharger les données du dashboard
      if (dashboardConfig) {
        const newConfig = { ...dashboardConfig };
        setDashboardConfig(newConfig);
      }
    } catch (error) {
      console.error('Erreur lors de l\'assignation:', error);
    }
  };

  const handleCreateIntervention = async (formData: any) => {
    try {
      console.log('Création d\'une nouvelle intervention avec les données:', formData);
      await createIntervention(formData);
      setShowInterventionForm(false);
      refreshDashboardData();
    } catch (error) {
      console.error('Erreur lors de la création:', error);
    }
  };

  const handleCreateRental = async (formData: any) => {
    try {
      await createRental(formData);
      setShowRentalForm(false);
      refreshDashboardData();
    } catch (error) {
      console.error('Erreur lors de la création de la location:', error);
    }
  };

  const handleUpdateRentalStatus = async (rentalId: string, status: string) => {
    try {
      await updateRentalStatus(rentalId, status);
      refreshDashboardData();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };

  const refreshDashboardData = () => {
    console.log('🔄 Rafraîchissement des données du tableau de bord...');
    setDataVersion(prevVersion => prevVersion + 1);
  };

  // Ajouter la fonction saveDashboardConfig
  const saveDashboardConfig = () => {
    if (dashboardConfig) {
      const savedConfig = {
        ...dashboardConfig,
        layouts: layout
      };
      localStorage.setItem('enterpriseDashboardConfig', JSON.stringify(savedConfig));
    }
  };

  const handleSaveDashboard = () => {
    if (!dashboardConfig) return;

    // Créer un nom unique pour la sauvegarde avec timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const dashboardName = `Tableau de bord ${selectedMetier} - ${timestamp}`;

    const savedConfig = {
      name: dashboardName,
      dashboardConfig,
      layouts: layout,
      metier: selectedMetier,
      savedAt: new Date().toISOString()
    };

    // Récupérer les sauvegardes existantes
    const existingSaves = JSON.parse(localStorage.getItem('enterpriseDashboardSaves') || '[]');
    existingSaves.push(savedConfig);

    // Garder seulement les 10 dernières sauvegardes
    if (existingSaves.length > 10) {
      existingSaves.splice(0, existingSaves.length - 10);
    }

    localStorage.setItem('enterpriseDashboardSaves', JSON.stringify(existingSaves));

    // Sauvegarder aussi la configuration actuelle
    saveDashboardConfig();

    // Afficher la modale de confirmation
    setShowSaveModal(true);
  };

  const handleLoadDashboard = () => {
    const existingSaves = JSON.parse(localStorage.getItem('enterpriseDashboardSaves') || '[]');

    if (existingSaves.length === 0) {
      toast('Aucune sauvegarde trouvée.');
      return;
    }

    // Charger les sauvegardes dans l'état
    setSavedDashboards(existingSaves);
    setShowLoadModal(true);
  };

  const handleLoadSelectedDashboard = (index: number) => {
    const selectedSave = savedDashboards[index];

    // Charger la configuration
    setDashboardConfig(selectedSave.dashboardConfig);
    setLayout(selectedSave.layouts);
    setSelectedMetier(selectedSave.metier);

    // Sauvegarder comme configuration actuelle
    localStorage.setItem('enterpriseDashboardConfig', JSON.stringify(selectedSave));

    // Fermer la modale
    setShowLoadModal(false);

    toast(`Tableau de bord "${selectedSave.name}" chargé avec succès.`);
  };

  const handleShowRentalDetails = (rental: any) => {
    setSelectedRental(rental);
    setShowRentalDetails(true);
  };

  const handleCloseRentalDetails = () => {
    setShowRentalDetails(false);
    setSelectedRental(null);
  };

  const handleEditRental = (rental: any) => {
    setSelectedRental(rental);
    setShowEditRentalForm(true);
  };

  const handleCloseEditRental = () => {
    setShowEditRentalForm(false);
    setSelectedRental(null);
  };

  const handleUpdateRental = async (formData: any) => {
    try {
      if (!selectedRental) return;

      // Préparer les données pour la mise à jour
      const updateData = {
        start_date: formData.start_date,
        end_date: formData.end_date,
        total_price: parseFloat(formData.total_price),
        status: formData.status
      };

      // Mettre à jour la location dans la base de données
      await updateRental(selectedRental.id, updateData);

      // Fermer le formulaire d'édition
      setShowEditRentalForm(false);
      setSelectedRental(null);

      // Recharger les données du dashboard
      refreshDashboardData();

      console.log('Location mise à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la location:', error);
    }
  };

  if (!sessionChecked) {
    return <div className="p-8 text-center">Vérification de la session...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="p-8 text-center text-red-600 font-semibold">
        Vous n'êtes pas connecté. Veuillez vous connecter pour accéder au tableau de bord.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Tableau de Bord Entreprise
              </h1>
              <p className="text-sm text-gray-600">
                {selectedMetier && `Métier: ${selectedMetier.charAt(0).toUpperCase() + selectedMetier.slice(1)}`}
                {dashboardConfig && dashboardConfig.widgets && (
                  <span className="ml-2 text-orange-600">
                    • {dashboardConfig.widgets.filter(w => w.enabled).length} widgets actifs
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.location.hash = '#entreprise'}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter des widgets
              </button>

              <button
                onClick={handleSaveDashboard}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                title="Enregistrer le tableau de bord"
              >
                <Save className="h-4 w-4 mr-2" />
                Enregistrer
              </button>

              <button
                onClick={handleLoadDashboard}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center"
                title="Charger un tableau de bord sauvegardé"
              >
                <Download className="h-4 w-4 mr-2" />
                Charger
              </button>

              <button className="p-2 text-gray-400 hover:text-gray-600">
                <Bell className="h-6 w-6" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600">
                <Settings className="h-6 w-6" />
              </button>
              <button
                onClick={refreshDashboardData}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Rafraîchir les données"
              >
                <RefreshCw className="h-6 w-6" />
              </button>
              <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Services Communs - Affichés seulement quand le dashboard est configuré */}
        {dashboardConfig && dashboardConfig.widgets && layout.lg && layout.lg.length > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                Services en commun
                <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                  📧 Messages prioritaires
                </span>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <a
                  href="#vitrine"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <Globe className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Vitrine</span>
                </a>
                <a
                  href="#publication"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <FileText className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Publication</span>
                </a>
                <a
                  href="#devis"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <DollarSign className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Devis</span>
                </a>
                <a
                  href="#documents"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <Package className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Documents</span>
                </a>
                <a
                  href="#messages"
                  className="flex flex-col items-center p-4 bg-gradient-to-br from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 rounded-lg transition-all duration-300 group border-2 border-orange-300 shadow-md hover:shadow-lg relative overflow-hidden"
                >
                  {/* Indicateur de nouveaux messages */}
                  <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  
                  <Mail className="h-6 w-6 text-orange-700 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-orange-800">Boîte de réception</span>
                  
                  {/* Effet de brillance */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </a>
                <a
                  href="#planning"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <Calendar className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Planning</span>
                </a>
                <a
                  href="#assistant-ia"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <Zap className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Assistant IA</span>
                </a>
                <a
                  href="#dashboard-entreprise"
                  className="flex flex-col items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group border border-gray-200"
                >
                  <BarChart3 className="h-6 w-6 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-gray-700">Tableau de bord</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {dashboardConfig && dashboardConfig.widgets && layout.lg && layout.lg.length > 0 && (
          <ResponsiveGridLayout
            className="layout"
            layouts={layout}
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 4, xxs: 2}}
            rowHeight={100}
            onLayoutChange={(currentLayout, allLayouts) => {
              setLayout(allLayouts);
              saveDashboardConfig();
            }}
            draggableHandle=".handle"
          >
            {dashboardConfig && dashboardConfig.widgets && dashboardConfig.widgets
              .filter((widget) => widget.enabled)
              .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((widget) => {
                // Déterminer la taille du widget basée sur sa largeur dans la grille
                const widgetLayout = layout?.lg?.find((l: any) => l.i === widget.id);
                const widgetWidth = widgetLayout?.w || 1;
                let widgetSize: 'small' | 'normal' | 'large' = 'normal';
                
                if (widgetWidth <= 2) {
                  widgetSize = 'small';
                } else if (widgetWidth >= 4) {
                  widgetSize = 'large';
                }
                
                return (
                  <div key={widget.id}>
                    <WidgetComponent
                      widget={widget}
                      onRemove={handleRemoveWidget}
                      onToggleSize={handleToggleSize}
                      onToggleVisibility={handleToggleVisibility}
                      onShowDetails={handleShowDetails}
                      onMarkRepairComplete={handleMarkRepairComplete}
                      onAssignTechnician={handleAssignTechnician}
                      onShowInterventionForm={() => setShowInterventionForm(true)}
                      onShowRentalForm={() => setShowRentalForm(true)}
                      onUpdateRentalStatus={handleUpdateRentalStatus}
                      onShowRentalDetails={handleShowRentalDetails}
                      onEditRental={handleEditRental}
                      dataVersion={dataVersion}
                      widgetSize={widgetSize}
                    />
                  </div>
                );
              })}
          </ResponsiveGridLayout>
        )}

        {(!dashboardConfig || !dashboardConfig.widgets || dashboardConfig.widgets.length === 0) && (
          <div className="text-center py-12">
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
              <Layout className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Aucun widget configuré
              </h3>
              <p className="text-gray-600 mb-4">
                Configurez votre tableau de bord en allant dans le configurateur entreprise.
              </p>
              <button
                onClick={() => window.location.hash = '#entreprise'}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Configurer mon tableau de bord
              </button>
            </div>
          </div>
        )}
      </main>

      {showInterventionForm && (
        <Modal title="Nouvelle Intervention" onClose={() => setShowInterventionForm(false)}>
          <InterventionForm onClose={() => setShowInterventionForm(false)} onSubmit={handleCreateIntervention} equipment={equipment} technicians={technicians} />
        </Modal>
      )}

      {showRentalForm && (
        <Modal title="Nouvelle Location" onClose={() => setShowRentalForm(false)}>
          <RentalForm onClose={() => setShowRentalForm(false)} onSubmit={handleCreateRental} equipment={equipment} />
        </Modal>
      )}

      {showEditRentalForm && selectedRental && (
        <Modal title="Modifier la Location" onClose={handleCloseEditRental}>
          <EditRentalForm
            rental={selectedRental}
            onClose={handleCloseEditRental}
            onSubmit={handleUpdateRental}
            equipment={equipment}
          />
        </Modal>
      )}

      {showRentalDetails && selectedRental && (
        <RentalDetailsModal rental={selectedRental} onClose={handleCloseRentalDetails} />
      )}

      {modalContent && (
        <Modal title="Détails" onClose={() => setModalContent(null)}>
          {modalContent}
        </Modal>
      )}

      {/* Modale de confirmation de sauvegarde */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Sauvegarde réussie</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <Check className="h-6 w-6 text-orange-600" />
                </div>
              </div>
              <p className="text-center text-gray-700 mb-6">
                Votre tableau de bord a été sauvegardé avec succès !
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale de chargement des sauvegardes */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Charger un tableau de bord</h3>
              <button
                onClick={() => setShowLoadModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {savedDashboards.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Info className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-600">Aucune sauvegarde trouvée.</p>
                  <p className="text-sm text-gray-500 mt-2">Sauvegardez d'abord votre tableau de bord actuel.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedDashboards.map((save, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleLoadSelectedDashboard(index)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">{save.name}</h4>
                          <p className="text-sm text-gray-600">
                            Métier: {save.metier.charAt(0).toUpperCase() + save.metier.slice(1)}
                          </p>
                          <p className="text-xs text-gray-500">
                            Sauvegardé le: {new Date(save.savedAt).toLocaleString('fr-FR')}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                            {save.dashboardConfig?.widgets?.filter((w: any) => w.enabled).length || 0} widgets
                          </span>
                          <Download className="h-4 w-4 text-orange-600" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  {savedDashboards.length} sauvegarde{savedDashboards.length > 1 ? 's' : ''} disponible{savedDashboards.length > 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => setShowLoadModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Configuration des widgets par métier
// Fonction pour rendre le contenu du widget
// Fonction pour récupérer les données métriques
// Nouvelle fonction pour le Score de Performance Commerciale
// Fonction pour le Score de Performance Commerciale (widget Ventes du mois transformé)
// Fonction pour récupérer les données réelles de performance commerciale
// Fonction pour générer des données par défaut quand il n'y a pas de données réelles
// Fonction helper pour les recommandations d'activité
// Fonction pour récupérer les données de liste
// Fonction pour récupérer les données de disponibilité des équipements
// Composant spécialisé pour le Pipeline Commercial
// Composant spécialisé pour l'Évolution des Ventes
// Widget transformé : Plan d'action stock & revente
// Fonction pour récupérer les données de graphiques
// Fonction pour récupérer les données de calendrier
// Fonction pour récupérer les données de carte
// Fonction pour récupérer les données de maintenance
// Fonction pour récupérer les notifications et alertes
// Fonction pour récupérer les KPIs avancés
// Fonction pour récupérer les données de planification
// Fonction pour récupérer les données des actions quotidiennes
