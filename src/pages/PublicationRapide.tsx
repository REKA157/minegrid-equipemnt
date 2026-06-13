import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Eye, 
  Download,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  X,
  Camera,
  Image as ImageIcon,
  RefreshCw,
  Edit,
  Settings,
  MoreVertical,
  BarChart3,
  TrendingUp,
  Users,
  Calendar
} from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { getSellerMachines } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { fetchModelSpecs, fetchModelSpecsFull, toPublicationRapideForm, summarizeSpecs, missingForPublication } from '../services/autoSpecsService';
import { toast } from '../utils/toast';
interface MachineFormData {
  name: string;
  brand: string;
  model: string;
  category: string;
  type: string;
  year: number;
  price: number;
  total_hours: number;
  description: string;
  location: string;
  specifications: {
    weight: number;
    power: { value: number; unit: string };
    dimensions: string;
    workingWeight: number;
    operatingCapacity: number;
  };
  images: File[];
}

// Détermine le tableau de bord cible selon la formule d'abonnement
function navigateBackToDashboard(): void {
  console.log('🔍 Navigation vers le tableau de bord approprié...');
  
  try {
    // 1) Vérifier l'abonnement actuel dans localStorage
    const userSubscription = localStorage.getItem('userSubscription');
    const tempSubscription = localStorage.getItem('tempSubscription');
    const hasActiveSubscription = localStorage.getItem('tempHasActiveSubscription') === 'true';
    
    console.log('📊 Abonnement détecté:', { userSubscription, tempSubscription, hasActiveSubscription });
    
    // 2) Déterminer le tableau de bord selon l'abonnement
    let targetDashboard = '#dashboard'; // Par défaut
    
    if (userSubscription || tempSubscription) {
      const subscriptionType = userSubscription || tempSubscription;
      
      if (subscriptionType === 'entreprise' || subscriptionType === 'enterprise') {
        targetDashboard = '#dashboard-entreprise-display';
        console.log('🎯 Redirection vers Dashboard Enterprise');
      } else {
        targetDashboard = '#dashboard';
        console.log('🎯 Redirection vers Dashboard Standard');
      }
    } else if (hasActiveSubscription) {
      targetDashboard = '#dashboard';
      console.log('🎯 Redirection vers Dashboard (abonnement temporaire)');
    }
    
    // 3) Effectuer la redirection
    console.log('🚀 Redirection vers:', targetDashboard);
    window.location.hash = targetDashboard;
    
  } catch (error) {
    console.error('❌ Erreur navigation:', error);
    // En dernier recours, revenir en arrière
    window.history.back();
  }
}

export default function PublicationRapide() {
  const [activeTab, setActiveTab] = useState<'list' | 'manual' | 'excel' | 'analytics'>('list');
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);

  // ✅ NOUVEAUX ÉTATS POUR LES ANALYTICS RÉELLES
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    totalContacts: 0,
    conversionRate: 0,
    weeklyPerformance: [],
    topPerformers: [],
    categoryStats: {},
    responseTime: 0
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Formulaire manuel
  const [formData, setFormData] = useState<MachineFormData>({
    name: '',
    brand: '',
    model: '',
    category: '',
    type: '',
    year: new Date().getFullYear(),
    price: 0,
    total_hours: 0,
    description: '',
    location: '',
    specifications: {
      weight: 0,
      power: { value: 0, unit: 'HP' },
      dimensions: '',
      workingWeight: 0,
      operatingCapacity: 0
    },
    images: []
  });

  const categories = [
    'Pelles hydrauliques',
    'Bulldozers',
    'Chargeurs',
    'Concasseurs',
    'Cribles',
    'Foreuses',
    'Grues',
    'Niveleuses',
    'Compacteurs',
    'Outils de démolition'
  ];

  // ✅ NOUVELLE FONCTION POUR CHARGER LES ANALYTICS RÉELLES
  const loadAnalyticsData = async () => {
    try {
      setAnalyticsLoading(true);
      const user = await getCurrentUser();
      if (!user) throw new Error('Utilisateur non connecté');

      // 1. Récupérer les vues des machines
      const { data: viewsData, error: viewsError } = await supabase
        .from('machine_views')
        .select('machine_id, created_at')
        .in('machine_id', machines.map(m => m.id));

      if (viewsError) {
        console.error('Erreur chargement vues:', viewsError);
      }

      // 2. Récupérer les messages/contacts avec plus de détails
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('machine_id, created_at, status, updated_at')
        .eq('sellerid', user.id);

      if (messagesError) {
        console.error('Erreur chargement messages:', messagesError);
      }

      // 3. Calculer les statistiques
      const totalViews = viewsData?.length || 0;
      const totalContacts = messagesData?.length || 0;
      const conversionRate = totalViews > 0 ? (totalContacts / totalViews * 100).toFixed(1) : 0;

      // 4. Performance hebdomadaire (7 derniers jours)
      const weeklyPerformance = [];
      const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayViews = viewsData?.filter(v => {
          const viewDate = new Date(v.created_at);
          return viewDate.toDateString() === date.toDateString();
        }).length || 0;
        
        weeklyPerformance.push({
          day: days[date.getDay() === 0 ? 6 : date.getDay() - 1],
          views: dayViews,
          percentage: totalViews > 0 ? Math.round((dayViews / totalViews) * 100) : 0
        });
      }

      // 5. Top des annonces performantes
      const machineViews = {};
      viewsData?.forEach(view => {
        machineViews[view.machine_id] = (machineViews[view.machine_id] || 0) + 1;
      });

      const topPerformers = machines
        .map(machine => ({
          ...machine,
          views: machineViews[machine.id] || 0,
          contacts: messagesData?.filter(m => m.machine_id === machine.id).length || 0
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);

      // 6. Statistiques par catégorie
      const categoryStats = {};
      machines.forEach(machine => {
        const views = machineViews[machine.id] || 0;
        if (!categoryStats[machine.category]) {
          categoryStats[machine.category] = { views: 0, machines: 0 };
        }
        categoryStats[machine.category].views += views;
        categoryStats[machine.category].machines += 1;
      });

      // ✅ 7. TEMPS DE RÉPONSE MOYEN RÉEL
      const responseTimes = [];
      
      if (messagesData && messagesData.length > 0) {
        // Grouper les messages par machine_id pour calculer les temps de réponse
        const messagesByMachine = {};
        messagesData.forEach(message => {
          if (!messagesByMachine[message.machine_id]) {
            messagesByMachine[message.machine_id] = [];
          }
          messagesByMachine[message.machine_id].push(message);
        });

        // Calculer le temps de réponse pour chaque machine
        Object.values(messagesByMachine).forEach(machineMessages => {
          // Trier par date de création
          const sortedMessages = (machineMessages as any[]).sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          // Calculer le temps entre le premier message et la réponse
          if (sortedMessages.length >= 2) {
            const firstMessage = sortedMessages[0];
            const responseMessage = sortedMessages.find(m => 
              m.status === 'replied' || 
              new Date(m.updated_at) > new Date(firstMessage.created_at)
            );

            if (responseMessage) {
              const responseTime = (new Date(responseMessage.updated_at).getTime() - 
                                  new Date(firstMessage.created_at).getTime()) / (1000 * 60 * 60); // en heures
              responseTimes.push(responseTime);
            }
          }
        });
      }

      // Calculer la moyenne des temps de réponse
      const avgResponseTime = responseTimes.length > 0 
        ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
        : 0; // ✅ 0 au lieu de 2.3 si aucune donnée

      setAnalyticsData({
        totalViews,
        totalContacts,
        conversionRate: parseFloat(conversionRate.toString()),
        weeklyPerformance,
        topPerformers,
        categoryStats,
        responseTime: parseFloat(avgResponseTime.toString())
      });

    } catch (error) {
      console.error('Erreur chargement analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // ✅ MODIFIER loadMachines pour charger aussi les analytics
  const loadMachines = async () => {
    try {
      setLoading(true);
      console.log("🔄 Chargement des machines...");
      const machinesData = await getSellerMachines();
      console.log("📊 Machines chargées:", machinesData);
      setMachines(machinesData);
      
      // Charger les analytics après les machines
      await loadAnalyticsData();
    } catch (err) {
      console.error('❌ Erreur chargement machines :', err);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour éditer une machine
  const handleEditMachine = (machine: any) => {
    console.log("✏️ Édition de la machine:", machine);
    // Pré-remplir le formulaire avec les données de la machine
    setFormData({
      name: machine.name || '',
      brand: machine.brand || '',
      model: machine.model || '',
      category: machine.category || '',
      type: machine.type || '',
      year: machine.year || new Date().getFullYear(),
      price: machine.price || 0,
      total_hours: machine.total_hours || 0,
      description: machine.description || '',
      location: machine.location || '',
      specifications: {
        weight: machine.specifications?.weight || 0,
        power: { 
          value: machine.specifications?.power?.value || 0, 
          unit: machine.specifications?.power?.unit || 'HP' 
        },
        dimensions: machine.specifications?.dimensions || '',
        workingWeight: machine.specifications?.workingWeight || 0,
        operatingCapacity: machine.specifications?.operatingCapacity || 0
      },
      images: []
    });
    
    // Stocker l'ID de la machine en cours d'édition
    setEditingMachineId(machine.id);
    
    // Basculer vers l'onglet de publication manuelle
    setActiveTab('manual');
    
    // Scroll vers le formulaire
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  // Fonction pour gérer les paramètres d'une machine
  const handleMachineSettings = (machine: any) => {
    console.log("⚙️ Paramètres de la machine:", machine);
    
    // Afficher une modal ou une section pour les paramètres
    const settings = [
      { label: 'Statut', value: machine.status || 'Actif' },
      { label: 'Visibilité', value: machine.visibility || 'Publique' },
      { label: 'Date de création', value: new Date(machine.created_at).toLocaleDateString('fr-FR') },
      { label: 'Dernière modification', value: machine.updated_at ? new Date(machine.updated_at).toLocaleDateString('fr-FR') : 'Jamais' }
    ];
    
    // Créer une modal simple avec les paramètres
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg p-6 max-w-md w-full mx-4';

    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-4';
    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-gray-900';
    title.textContent = `Paramètres - ${machine.name}`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'text-gray-400 hover:text-gray-600';
    closeBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.append(title, closeBtn);

    const body = document.createElement('div');
    body.className = 'space-y-2';
    settings.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'flex justify-between py-2 border-b border-gray-200';
      const label = document.createElement('span');
      label.className = 'font-medium text-gray-700';
      label.textContent = `${s.label}:`;
      const val = document.createElement('span');
      val.className = 'text-gray-600';
      val.textContent = String(s.value);
      row.append(label, val);
      body.appendChild(row);
    });

    const footer = document.createElement('div');
    footer.className = 'mt-6 flex space-x-3';
    const closeBtn2 = document.createElement('button');
    closeBtn2.className = 'flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors';
    closeBtn2.textContent = 'Fermer';
    closeBtn2.addEventListener('click', () => overlay.remove());
    const viewBtn = document.createElement('button');
    viewBtn.className = 'flex-1 bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors';
    viewBtn.textContent = "Voir l'annonce";
    viewBtn.addEventListener('click', () => { window.location.hash = `#machines/${machine.id}`; });
    footer.append(closeBtn2, viewBtn);

    card.append(header, body, footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  };

  // Fonction pour supprimer une machine
  const handleDeleteMachine = async (machine: any) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'annonce "${machine.name}" ?`)) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('machines')
        .delete()
        .eq('id', machine.id);
      
      if (error) {
        console.error('Erreur suppression:', error);
        toast('Erreur lors de la suppression');
        return;
      }
      
      toast('Annonce supprimée avec succès !');
      loadMachines(); // Recharger la liste
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la suppression');
    }
  };

  useEffect(() => {
    loadMachines();
  }, []);

  const handleFormChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof MachineFormData] as any),
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, ...files]
    }));
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast('Vous devez être connecté pour publier une machine');
        return;
      }

      // Upload des images (seulement si de nouvelles images sont ajoutées)
      const imageUrls: string[] = [];
      for (const image of formData.images) {
        const fileName = `machine_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const { data, error } = await supabase.storage
          .from('machine-image')
          .upload(fileName, image);

        if (error) {
          console.error('Erreur upload image:', error);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('machine-image')
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }

      // Préparation des données de la machine
      const machineData: any = {
        name: formData.name,
        brand: formData.brand,
        model: formData.model,
        category: formData.category,
        type: formData.type,
        year: formData.year,
        price: formData.price,
        description: formData.description,
        location: formData.location,
        specifications: formData.specifications,
        total_hours: formData.total_hours,
        seller_id: user.id
      };

      // Ajouter les images seulement si de nouvelles ont été uploadées
      if (imageUrls.length > 0) {
        machineData.images = imageUrls;
      }

      let result;
      if (editingMachineId) {
        // Mode édition - Mise à jour
        result = await supabase
          .from('machines')
          .update(machineData)
          .eq('id', editingMachineId)
          .select()
          .single();
      } else {
        // Mode création - Insertion
        machineData.created_at = new Date().toISOString();
        result = await supabase
          .from('machines')
          .insert(machineData)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Erreur opération machine:', result.error);
        toast(editingMachineId ? 'Erreur lors de la modification' : 'Erreur lors de la publication');
        return;
      }

      toast(editingMachineId ? 'Machine modifiée avec succès !' : 'Machine publiée avec succès !');
      
      // Reset du formulaire et retour à la liste
      setFormData({
        name: '',
        brand: '',
        model: '',
        category: '',
        type: '',
        year: new Date().getFullYear(),
        price: 0,
        total_hours: 0,
        description: '',
        location: '',
        specifications: {
          weight: 0,
          power: { value: 0, unit: 'HP' },
          dimensions: '',
          workingWeight: 0,
          operatingCapacity: 0
        },
        images: []
      });
      
      setEditingMachineId(null);
      setActiveTab('list');
      loadMachines(); // Recharger la liste

    } catch (error) {
      console.error('Erreur:', error);
      toast(editingMachineId ? 'Erreur lors de la modification' : 'Erreur lors de la publication');
    } finally {
      setLoading(false);
    }
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setExcelFile(file);
    // SÉCURITÉ / INTÉGRITÉ DU CATALOGUE : l'ancienne version simulait un « OCR » puis
    // PRÉ-REMPLISSAIT 2 machines fictives codées en dur (CAT 320D Bamako, Komatsu D65),
    // qui étaient ensuite réellement insérées dans la base de production. On ne
    // fabrique plus aucune donnée. L'extraction réelle du fichier Excel reste à
    // implémenter (côté serveur / n8n, cf. SellEquipment.handleExcelSubmit).
    setPreviewData([]);
    toast("L'import Excel est en cours d'intégration. Utilisez la publication manuelle pour ajouter une annonce.");
  };

  const handleExcelSubmit = async () => {
    if (previewData.length === 0) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast('Vous devez être connecté pour publier des machines');
        return;
      }

      const machinesToInsert = previewData.map(machine => ({
        ...machine,
        seller_id: user.id,
        created_at: new Date().toISOString(),
        specifications: {
          weight: 0,
          power: { value: 0, unit: 'HP' },
          dimensions: '',
          workingWeight: 0,
          operatingCapacity: 0
        },
        images: []
      }));

      const { data, error } = await supabase
        .from('machines')
        .insert(machinesToInsert);

      if (error) {
        console.error('Erreur publication machines:', error);
        toast('Erreur lors de la publication');
        return;
      }

      toast(`${previewData.length} machines publiées avec succès !`);
      setPreviewData([]);
      setExcelFile(null);

    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la publication');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    // En-têtes avec TOUTES les colonnes nécessaires et compatibles (MIS À JOUR)
    const headers = [
      // Colonnes obligatoires (mapping exact avec n8n)
      'nom',
      'marque', 
      'modele',
      'categorie',
      'type',
      'annee',
      'prix_euros',  // ✅ Nom exact pour n8n
      'condition',
      'description',
      
      // NOUVEAUX CHAMPS GPS (optionnels mais recommandés)
      'total_hours',      // ✅ NOUVEAU : Nombre d'heures d'utilisation
      'latitude',         // ✅ NOUVEAU : Coordonnée GPS latitude
      'longitude',        // ✅ NOUVEAU : Coordonnée GPS longitude
      'adresse',          // ✅ NOUVEAU : Adresse complète
      'ville',            // ✅ NOUVEAU : Ville de localisation
      'pays',             // ✅ NOUVEAU : Pays de localisation
      'code_postal',      // ✅ NOUVEAU : Code postal
      
      // Spécifications techniques (mapping exact avec n8n)
      'poids',
      'puissance_valeur',
      'puissance_unite',
      'capacite_operationnelle',
      'poids_de_travail',  // ✅ Nom exact pour n8n
      'dimensions',
      
      // Images et médias
      'images',
      
      // Informations supplémentaires (optionnelles)
      'videos',
      'view360',
      'is_premium',
      'rental_price_daily',
      'rental_price_weekly',
      'rental_price_monthly',
      'fuel_consumption',
      'operator_required',
      'delivery_available',
      'delivery_cost'
    ];

    // Exemples de données réelles avec TOUTES les colonnes (MIS À JOUR)
    const examples = [
      [
        'Pelle hydraulique CAT 320D',
        'Caterpillar',
        '320D',
        'Pelles hydrauliques',
        'sale',
        '2018',
        '125000',
        'used',
        'Pelle hydraulique Caterpillar 320D en excellent état. Machine bien entretenue, prête à travailler. Idéale pour travaux de terrassement et extraction.',
        '2500',           // ✅ NOUVEAU : total_hours
        '33.5731',        // ✅ NOUVEAU : latitude (Casablanca)
        '-7.5898',        // ✅ NOUVEAU : longitude (Casablanca)
        '123 Rue Mohammed V, Casablanca',  // ✅ NOUVEAU : adresse
        'Casablanca',     // ✅ NOUVEAU : ville
        'Maroc',          // ✅ NOUVEAU : pays
        '20000',          // ✅ NOUVEAU : code_postal
        '19500',
        '127',
        'kW',
        '18500',
        '19500',
        '6.1m x 2.55m x 3.0m',
        'https://example.com/image1.jpg;https://example.com/image2.jpg',
        'https://example.com/video1.mp4',
        'https://example.com/360view.html',
        'false',
        '',
        '',
        '',
        '15L/h',
        'true',
        'true',
        '500'
      ],
      [
        'Bulldozer Komatsu D65',
        'Komatsu',
        'D65',
        'Bulldozers',
        'both',
        '2019',
        '180000',
        'used',
        'Bulldozer Komatsu D65 en très bon état. Parfait pour travaux de déblaiement et nivellement.',
        '1800',           // ✅ NOUVEAU : total_hours
        '34.0209',        // ✅ NOUVEAU : latitude (Rabat)
        '-6.8416',        // ✅ NOUVEAU : longitude (Rabat)
        '456 Avenue Hassan II, Rabat',  // ✅ NOUVEAU : adresse
        'Rabat',          // ✅ NOUVEAU : ville
        'Maroc',          // ✅ NOUVEAU : pays
        '10000',          // ✅ NOUVEAU : code_postal
        '18000',
        '145',
        'kW',
        '22000',
        '18000',
        '5.8m x 2.4m x 2.9m',
        'https://example.com/bulldozer1.jpg',
        'https://example.com/bulldozer_video.mp4',
        '',
        'true',
        '1200',
        '8000',
        '30000',
        '20L/h',
        'true',
        'true',
        '800'
      ],
      [
        'Chargeur frontal JCB 3CX',
        'JCB',
        '3CX',
        'Chargeurs',
        'both',
        '2020',
        '85000',
        'used',
        'Chargeur frontal JCB 3CX polyvalent. Vente ou location possible. Excellent pour travaux urbains.',
        '1200',           // ✅ NOUVEAU : total_hours
        '14.7167',        // ✅ NOUVEAU : latitude (Dakar)
        '-17.4677',       // ✅ NOUVEAU : longitude (Dakar)
        '789 Boulevard de la Corniche, Dakar',  // ✅ NOUVEAU : adresse
        'Dakar',          // ✅ NOUVEAU : ville
        'Sénégal',        // ✅ NOUVEAU : pays
        '10000',          // ✅ NOUVEAU : code_postal
        '8500',
        '55',
        'kW',
        '12000',
        '8500',
        '4.2m x 1.9m x 2.4m',
        'https://example.com/chargeur1.jpg',
        '',
        '',
        'false',
        '800',
        '5000',
        '20000',
        '12L/h',
        'true',
        'true',
        '300'
      ],
      [
        'Concasseur mobile Metso LT1213',
        'Metso',
        'LT1213',
        'Concasseurs',
        'sale',
        '2017',
        '320000',
        'used',
        'Concasseur mobile Metso LT1213 pour concassage primaire et secondaire. Très productif.',
        '4500',           // ✅ NOUVEAU : total_hours
        '5.3600',         // ✅ NOUVEAU : latitude (Abidjan)
        '-4.0083',        // ✅ NOUVEAU : longitude (Abidjan)
        '321 Route des Lagunes, Abidjan',  // ✅ NOUVEAU : adresse
        'Abidjan',        // ✅ NOUVEAU : ville
        'Côte d\'Ivoire', // ✅ NOUVEAU : pays
        '10000',          // ✅ NOUVEAU : code_postal
        '42000',
        '310',
        'kW',
        '35000',
        '42000',
        '12.5m x 3.0m x 3.4m',
        'https://example.com/concasseur1.jpg',
        'https://example.com/concasseur_video.mp4',
        '',
        'true',
        '',
        '',
        '',
        '25L/h',
        'true',
        'true',
        '1200'
      ],
      [
        'Foreuse rotative Atlas Copco ROC L8',
        'Atlas Copco',
        'ROC L8',
        'Foreuses',
        'sale',
        '2016',
        '280000',
        'used',
        'Foreuse rotative Atlas Copco ROC L8 pour forage de production. Très fiable.',
        '3800',           // ✅ NOUVEAU : total_hours
        '-11.6647',       // ✅ NOUVEAU : latitude (Lubumbashi)
        '27.4793',        // ✅ NOUVEAU : longitude (Lubumbashi)
        '654 Avenue du Commerce, Lubumbashi',  // ✅ NOUVEAU : adresse
        'Lubumbashi',     // ✅ NOUVEAU : ville
        'RDC',            // ✅ NOUVEAU : pays
        '10000',          // ✅ NOUVEAU : code_postal
        '28000',
        '200',
        'kW',
        '25000',
        '28000',
        '8.5m x 2.5m x 2.8m',
        'https://example.com/foreuse1.jpg',
        '',
        '',
        'false',
        '',
        '',
        '',
        '18L/h',
        'true',
        'true',
        '900'
      ]
    ];

    // Instructions détaillées et précises (MIS À JOUR)
    const instructions = `# INSTRUCTIONS D'IMPORT EN LOT - MINEGRID ÉQUIPEMENT (MIS À JOUR)
# 
# ⚠️ IMPORTANT : Ce fichier inclut TOUS les nouveaux champs GPS et total_hours
# Compatible avec la nouvelle structure Supabase optimisée
#
# COLONNES OBLIGATOIRES (doivent être remplies) :
# - nom : Nom complet de la machine
# - marque : Marque du fabricant
# - modele : Modèle spécifique
# - categorie : Doit être une des valeurs suivantes : Pelles hydrauliques, Bulldozers, Chargeurs, Concasseurs, Cribles, Foreuses, Grues, Niveleuses, Compacteurs, Outils de démolition, Matériel de Voirie
# - type : Doit être "sale" (vente), "rental" (location) ou "both" (vente et location)
# - annee : Année de fabrication (nombre entre 1950 et ${new Date().getFullYear()})
# - prix_euros : Prix en euros (nombre positif sans devise) - ⚠️ NOM EXACT POUR N8N
# - condition : Doit être "new" (neuf) ou "used" (occasion)
# - description : Description détaillée de la machine
#
# NOUVEAUX CHAMPS GPS (optionnels mais recommandés) :
# - total_hours : Nombre total d'heures d'utilisation de la machine - ✅ NOUVEAU !
# - latitude : Coordonnée GPS latitude (ex: 33.5731 pour Casablanca) - ✅ NOUVEAU !
# - longitude : Coordonnée GPS longitude (ex: -7.5898 pour Casablanca) - ✅ NOUVEAU !
# - adresse : Adresse complète de la machine - ✅ NOUVEAU !
# - ville : Ville de localisation - ✅ NOUVEAU !
# - pays : Pays de localisation - ✅ NOUVEAU !
# - code_postal : Code postal - ✅ NOUVEAU !
#
# COLONNES OPTIONNELLES (peuvent être laissées vides) :
# - poids : Poids en kg
# - puissance_valeur : Valeur de la puissance (nombre)
# - puissance_unite : Unité de puissance ("kW" ou "CV")
# - capacite_operationnelle : Capacité en kg
# - poids_de_travail : Poids de travail en kg - ⚠️ NOM EXACT POUR N8N
# - dimensions : Dimensions au format "L x l x H"
# - images : URLs des images séparées par des points-virgules (;)
# - videos : URLs des vidéos séparées par des points-virgules (;)
# - view360 : URL de la vue 360°
# - is_premium : "true" ou "false" pour le statut premium
# - rental_price_daily : Prix location journalier en euros
# - rental_price_weekly : Prix location hebdomadaire en euros
# - rental_price_monthly : Prix location mensuel en euros
# - fuel_consumption : Consommation carburant (ex: "15L/h")
# - operator_required : "true" ou "false" si opérateur requis
# - delivery_available : "true" ou "false" si livraison disponible
# - delivery_cost : Coût de livraison en euros
#
# 🎯 MAPPING SUPABASE AUTOMATIQUE :
# - prix_euros → price (Supabase)
# - total_hours → total_hours (Supabase) - ✅ NOUVEAU !
# - latitude → latitude (Supabase) - ✅ NOUVEAU !
# - longitude → longitude (Supabase) - ✅ NOUVEAU !
# - adresse → address (Supabase) - ✅ NOUVEAU !
# - ville → city (Supabase) - ✅ NOUVEAU !
# - pays → country (Supabase) - ✅ NOUVEAU !
# - code_postal → postal_code (Supabase) - ✅ NOUVEAU !
# - poids_de_travail → specifications.workingWeight (Supabase)
# - sellerid → automatiquement assigné par n8n
#
# 📍 EXEMPLES DE COORDONNÉES GPS :
# - Casablanca, Maroc : 33.5731, -7.5898
# - Rabat, Maroc : 34.0209, -6.8416
# - Dakar, Sénégal : 14.7167, -17.4677
# - Bamako, Mali : 12.6392, -8.0029
# - Abidjan, Côte d'Ivoire : 5.3600, -4.0083
# - Lubumbashi, RDC : -11.6647, 27.4793
#
# EXEMPLES DE DONNÉES CI-DESSOUS :
`;

    // Créer le contenu CSV avec en-têtes et exemples
    const csvContent = [
      headers.join(','),
      ...examples.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const fullContent = instructions + '\n' + csvContent;

    // Créer et télécharger le fichier
    const blob = new Blob([fullContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_import_machines_minegrid_complet_mis_a_jour.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ✅ MODIFIER LA SECTION ANALYTICS POUR UTILISER LES DONNÉES RÉELLES
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={navigateBackToDashboard}
                className="text-gray-600 hover:text-gray-900"
                title="Retourner au tableau de bord"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">
                Service Enterprise - Gestion des Annonces
              </h1>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={navigateBackToDashboard}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retourner au tableau de bord
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Onglets */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('list')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'list'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Eye className="h-5 w-5 inline mr-2" />
                Mes Annonces
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'manual'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FileText className="h-5 w-5 inline mr-2" />
                Publication manuelle
              </button>
              <button
                onClick={() => setActiveTab('excel')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'excel'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Upload className="h-5 w-5 inline mr-2" />
                Import Excel/CSV avec OCR
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'analytics'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <BarChart3 className="h-5 w-5 inline mr-2" />
                Analytics détaillés
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'list' ? (
              /* Liste des annonces */
              <div className="bg-white rounded-xl shadow-lg p-6 border border-orange-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                    Mes Annonces
                  </h3>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={loadMachines}
                      disabled={loading}
                      className="p-2 text-gray-500 hover:text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Rafraîchir les annonces"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => setActiveTab('manual')}
                      className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="h-4 w-4 inline mr-2" />
                      Nouvelle annonce
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Équipement
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Prix
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Catégorie
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                            Chargement des annonces...
                          </td>
                        </tr>
                      ) : machines.length > 0 ? (
                        machines.map((machine) => (
                          <tr key={machine.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{machine.name}</div>
                              <div className="text-sm text-gray-500">{machine.brand}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{machine.price} €</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{machine.category}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {machine.type === 'sale' ? 'Vente' : 
                                 machine.type === 'rental' ? 'Location' : 
                                 machine.type === 'both' ? 'Vente/Location' : 
                                 'Non défini'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex space-x-2">
                                <a 
                                  href={`#machines/${machine.id}`} 
                                  className="text-orange-600 hover:text-orange-700 transition-colors"
                                  title="Voir l'annonce"
                                >
                                  <Eye className="h-4 w-4" />
                                </a>
                                <button 
                                  onClick={() => handleEditMachine(machine)}
                                  className="text-orange-600 hover:text-orange-700 transition-colors"
                                  title="Modifier l'annonce"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleMachineSettings(machine)}
                                  className="text-orange-400 hover:text-orange-600 transition-colors"
                                  title="Paramètres"
                                >
                                  <Settings className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteMachine(machine)}
                                  className="text-orange-800 hover:text-orange-900 transition-colors"
                                  title="Supprimer l'annonce"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                            Aucune annonce publiée pour le moment.
                            <br />
                            <button 
                              onClick={() => setActiveTab('manual')}
                              className="text-orange-600 hover:text-orange-700 mt-2 inline-block font-medium"
                            >
                              Publier votre première annonce
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Fonctionnalités avancées Enterprise */}
                <div className="mt-8 p-6 bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                  <h4 className="text-lg font-semibold text-orange-800 mb-4">
                    🚀 Fonctionnalités Enterprise
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-lg border border-orange-200">
                      <h5 className="font-medium text-orange-700 mb-2">Publication en masse</h5>
                      <p className="text-sm text-gray-600">Importez plusieurs annonces depuis Excel/CSV</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-orange-200">
                      <h5 className="font-medium text-orange-700 mb-2">Gestion avancée</h5>
                      <p className="text-sm text-gray-600">Modifiez et gérez toutes vos annonces</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-orange-200">
                      <h5 className="font-medium text-orange-700 mb-2">Analytics détaillés</h5>
                      <p className="text-sm text-gray-600">Suivez les performances de vos annonces</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'manual' ? (
              /* Formulaire manuel */
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {editingMachineId ? 'Modifier une annonce' : 'Publier une nouvelle annonce'}
                  </h3>
                  {editingMachineId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMachineId(null);
                        setFormData({
                          name: '',
                          brand: '',
                          model: '',
                          category: '',
                          type: '',
                          year: new Date().getFullYear(),
                          price: 0,
                          total_hours: 0,
                          description: '',
                          location: '',
                          specifications: {
                            weight: 0,
                            power: { value: 0, unit: 'HP' },
                            dimensions: '',
                            workingWeight: 0,
                            operatingCapacity: 0
                          },
                          images: []
                        });
                      }}
                      className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                    >
                      Annuler l'édition
                    </button>
                  )}
                </div>
                <form onSubmit={handleManualSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom de la machine *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Marque *
                    </label>
                    <input
                      type="text"
                      value={formData.brand}
                      onChange={(e) => handleFormChange('brand', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Modèle *
                    </label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => handleFormChange('model', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                      onClick={async () => {
                        if (!formData.brand || !formData.model) {
                          toast('Renseignez la marque et le modèle');
                          return;
                        }
                        try {
                          const context = {
                            name: formData.name,
                            brand: formData.brand,
                            model: formData.model,
                            category: formData.category,
                            type: formData.type,
                            year: formData.year,
                            price: formData.price,
                            total_hours: formData.total_hours,
                            description: formData.description,
                            location: formData.location,
                            specifications: formData.specifications
                          };
                                                      const { specs } = await fetchModelSpecsFull(formData.brand, formData.model, context); // context complet, champs vides inclus
                          if (!specs) { toast('Aucune spécification trouvée'); return; }
                          const mapped = toPublicationRapideForm(specs);
                          setFormData(prev => ({ 
                            ...prev, 
                            description: mapped.description || prev.description,
                            specifications: { ...prev.specifications, ...mapped.specifications }
                          }));
                          const summary = summarizeSpecs(specs);
                          const missing = missingForPublication(specs);
                          const msg = `Spécifications pré-remplies.\n${summary}${missing.length ? `\nChamps manquants: ${missing.join(', ')}` : ''}`;
                          toast(msg);
                        } catch (e) {
                          console.error(e);
                          toast('Erreur lors de la récupération des spécifications');
                        }
                      }}
                    >
                      Remplir automatiquement (IA)
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Catégorie *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => handleFormChange('category', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="">Sélectionner une catégorie</option>
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Type de transaction *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => handleFormChange('type', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="">Sélectionner le type</option>
                      <option value="sale">Vente uniquement</option>
                      <option value="rental">Location uniquement</option>
                      <option value="both">Vente et Location</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Année *
                    </label>
                    <input
                      type="number"
                      value={formData.year}
                      onChange={(e) => handleFormChange('year', parseInt(e.target.value))}
                      min="1900"
                      max={new Date().getFullYear() + 1}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prix (€) *
                    </label>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => handleFormChange('price', parseFloat(e.target.value))}
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre d'heures
                    </label>
                    <input
                      type="number"
                      value={formData.total_hours}
                      onChange={(e) => handleFormChange('total_hours', parseInt(e.target.value))}
                      min="0"
                      placeholder="Ex: 2500"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">Nombre total d'heures d'utilisation de la machine</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Localisation *
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => handleFormChange('location', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    rows={4}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Décrivez votre machine..."
                  />
                </div>

                {/* Spécifications techniques */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Spécifications techniques</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Poids (kg)
                      </label>
                      <input
                        type="number"
                        value={formData.specifications.weight}
                        onChange={(e) => handleFormChange('specifications.weight', parseFloat(e.target.value))}
                        min="0"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Puissance
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="number"
                          value={formData.specifications.power.value}
                          onChange={(e) => handleFormChange('specifications.power', { 
                            ...formData.specifications.power, 
                            value: parseFloat(e.target.value) 
                          })}
                          min="0"
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <select
                          value={formData.specifications.power.unit}
                          onChange={(e) => handleFormChange('specifications.power', { 
                            ...formData.specifications.power, 
                            unit: e.target.value 
                          })}
                          className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="HP">HP</option>
                          <option value="kW">kW</option>
                          <option value="CV">CV</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dimensions
                      </label>
                      <input
                        type="text"
                        value={formData.specifications.dimensions}
                        onChange={(e) => handleFormChange('specifications.dimensions', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="L x l x H (m)"
                      />
                    </div>
                  </div>
                </div>

                {/* Images */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Images</h3>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Ajouter des images
                      </button>
                      <input
                        ref={imageInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>
                    
                    {formData.images.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {formData.images.map((image, index) => (
                          <div key={index} className="relative">
                            <img
                              src={URL.createObjectURL(image)}
                              alt={`Image ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t">
                  <a
                    href="#dashboard-entreprise"
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-block"
                  >
                    Annuler
                  </a>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 flex items-center"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {editingMachineId ? 'Modification...' : 'Publication...'}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {editingMachineId ? 'Modifier la machine' : 'Publier la machine'}
                      </>
                    )}
                  </button>
                </div>
              </form>
                </div>
            ) : activeTab === 'excel' ? (
              /* Import Excel/CSV */
              <div className="space-y-6">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 mr-3" />
                    <div>
                      <h3 className="text-sm font-medium text-orange-900">
                        Import en lot avec OCR
                      </h3>
                      <p className="text-sm text-orange-700 mt-1">
                        Téléchargez un fichier Excel ou CSV contenant vos machines. 
                        Notre système OCR extrait automatiquement les informations.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={downloadTemplate}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Télécharger le modèle
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choisir un fichier
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelUpload}
                      className="hidden"
                    />
                  </div>

                  {excelFile && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-orange-600 mr-3" />
                        <span className="text-sm text-orange-800">
                          Fichier sélectionné : {excelFile.name}
                        </span>
                      </div>
                    </div>
                  )}

                  {loading && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Traitement en cours...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Aperçu des données extraites */}
                {previewData.length > 0 && (
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Aperçu des données extraites ({previewData.length} machines)
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="space-y-3">
                        {previewData.map((machine, index) => (
                          <div key={index} className="bg-white rounded-lg p-4 border">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium text-gray-900">{machine.name}</h4>
                                <p className="text-sm text-gray-600">
                                  {machine.brand} {machine.model} • {machine.year}
                                </p>
                                <p className="text-sm text-gray-500">{machine.location}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-orange-600">{machine.price.toLocaleString()} €</p>
                                <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                                  {machine.category}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {previewData.length > 0 && (
                  <div className="flex justify-end space-x-4 pt-6 border-t">
                    <button
                      onClick={() => {
                        setPreviewData([]);
                        setExcelFile(null);
                      }}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleExcelSubmit}
                      disabled={loading}
                      className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 flex items-center"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Publication...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Publier {previewData.length} machine(s)
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : activeTab === 'analytics' ? (
              /* ✅ ANALYTICS AVEC DONNÉES RÉELLES */
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">Analytics détaillées</h3>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={loadAnalyticsData}
                      disabled={analyticsLoading}
                      className="p-2 text-gray-500 hover:text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Actualiser les données"
                    >
                      <RefreshCw className={`h-4 w-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <span className="text-sm text-gray-500">
                      Dernière mise à jour : {new Date().toLocaleTimeString('fr-FR')}
                    </span>
                  </div>
                </div>

                {analyticsLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                    <p className="text-gray-500 mt-2">Chargement des analytics...</p>
                  </div>
                ) : (
                  <>
                    {/* Statistiques principales */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Total annonces</p>
                            <p className="text-3xl font-bold text-orange-600">{machines.length}</p>
                            <p className="text-xs text-orange-600 mt-1">Actives</p>
                          </div>
                          <div className="bg-orange-100 p-3 rounded-xl">
                            <FileText className="h-8 w-8 text-orange-600" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Vues totales</p>
                            <p className="text-3xl font-bold text-orange-600">{analyticsData.totalViews.toLocaleString()}</p>
                            <p className="text-xs text-orange-600 mt-1">Réelles</p>
                          </div>
                          <div className="bg-orange-100 p-3 rounded-xl">
                            <Eye className="h-8 w-8 text-orange-600" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Contacts reçus</p>
                            <p className="text-3xl font-bold text-orange-600">{analyticsData.totalContacts}</p>
                            <p className="text-xs text-orange-600 mt-1">Réels</p>
                          </div>
                          <div className="bg-orange-100 p-3 rounded-xl">
                            <Users className="h-8 w-8 text-orange-600" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Taux de conversion</p>
                            <p className="text-3xl font-bold text-orange-600">{analyticsData.conversionRate}%</p>
                            <p className="text-xs text-orange-600 mt-1">Calculé</p>
                          </div>
                          <div className="bg-orange-100 p-3 rounded-xl">
                            <TrendingUp className="h-8 w-8 text-orange-600" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Graphiques et analyses */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                      {/* Performance des 7 derniers jours */}
                      <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm">
                        <h5 className="text-lg font-semibold text-gray-900 mb-6">Performance des 7 derniers jours</h5>
                        <div className="space-y-4">
                          {analyticsData.weeklyPerformance.map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 w-16">{item.day}</span>
                              <div className="flex items-center space-x-3 flex-1">
                                <div className="flex-1 bg-gray-200 rounded-full h-3">
                                  <div 
                                    className="bg-orange-600 h-3 rounded-full transition-all duration-300" 
                                    style={{ width: `${item.percentage}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm font-medium text-gray-900 w-16 text-right">{item.views} vues</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top des annonces performantes */}
                      <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm">
                        <h5 className="text-lg font-semibold text-gray-900 mb-6">Top des annonces performantes</h5>
                        <div className="space-y-4">
                          {analyticsData.topPerformers.map((machine, index) => (
                            <div key={machine.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                                  index === 0 ? 'bg-yellow-500' : 
                                  index === 1 ? 'bg-gray-400' : 
                                  index === 2 ? 'bg-orange-500' : 'bg-orange-400'
                                }`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{machine.name}</p>
                                  <p className="text-sm text-gray-600">{machine.brand} • {machine.category}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-orange-600">{machine.views} vues</p>
                                <p className="text-sm text-gray-600">{machine.contacts} contacts</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Analyses détaillées */}
                    <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm mt-8">
                      <h5 className="text-lg font-semibold text-gray-900 mb-6">Analyses détaillées</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                          <h6 className="font-semibold text-orange-800 mb-2">Meilleur jour</h6>
                          <p className="text-2xl font-bold text-orange-600">
                            {analyticsData.weeklyPerformance.length > 0 
                              ? analyticsData.weeklyPerformance.reduce((max, day) => 
                                  (day as any).views > (max as any).views ? day : max
                                ).day 
                              : 'N/A'
                            }
                          </p>
                          <p className="text-sm text-gray-600">
                            {analyticsData.weeklyPerformance.length > 0 
                              ? `${analyticsData.weeklyPerformance.reduce((max, day) => 
                                  (day as any).views > (max as any).views ? day : max
                                ).views} vues`
                              : 'Aucune donnée'
                            }
                          </p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                          <h6 className="font-semibold text-orange-800 mb-2">Catégorie la plus vue</h6>
                          <p className="text-2xl font-bold text-orange-600">
                            {Object.keys(analyticsData.categoryStats).length > 0 
                              ? (Object.entries(analyticsData.categoryStats)
                                  .reduce((max, [cat, stats]) => 
                                    (stats as any).views > (max as any).views ? { category: cat, ...(stats as any) } : max
                                  ) as any).category
                              : 'N/A'
                            }
                          </p>
                          <p className="text-sm text-gray-600">
                            {Object.keys(analyticsData.categoryStats).length > 0 
                              ? `${Math.round(Number(Object.values(analyticsData.categoryStats)
                                  .reduce((total, stats) => Number(total) + Number((stats as any).views), 0)) / 
                                  analyticsData.totalViews * 100)}% des vues`
                              : 'Aucune donnée'
                            }
                          </p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                          <h6 className="font-semibold text-orange-800 mb-2">Temps de réponse</h6>
                          <p className="text-2xl font-bold text-orange-600">{analyticsData.responseTime}h</p>
                          <p className="text-sm text-gray-600">Moyenne des réponses</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
} 