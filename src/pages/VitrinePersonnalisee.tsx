import React, { useState, useEffect } from 'react';
import {
  Globe, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Star, 
  ChevronRight,
  Download,
  Share2,
  Edit,
  Save,
  X,
  Plus,
  Trash2,
  Upload,
  Check,
  Wrench,
  Truck,
  Scale,
  Calendar
} from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { VITRINE_COLUMNS } from '../constants/apiQueryFields';
import { useCurrencyStore } from '../stores/currencyStore';
import Price from '../components/Price';
import { toast } from '../utils/toast';
interface VitrineData {
  id: string;
  company_name: string;
  logo_url: string;
  description: string;
  services: string[];
  address: string;
  phone: string;
  email: string;
  website: string;
  working_hours: string;
  specializations: string[];
  certifications: string[];
  user_id: string;
  created_at: string;
  updated_at: string;
  business_type: 'seller' | 'renter' | 'both';
  founding_year: number;
  intervention_zone: string;
  equipment_count: number;
  projects_delivered: number;
  whatsapp: string;
  emergency_phone: string;
  delivery_radius: number;
  min_rental_duration: number;
  deposit_required: boolean;
  fuel_included: boolean;
  driver_included: boolean;
  maintenance_included: boolean;
  // Nouveaux champs pour les conditions de vente
  warranty_months?: number;
  delivery_time_weeks?: number;
  transport_included?: boolean;
  installation_included?: boolean;
}

interface Machine {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  type?: string; // 'sale', 'rental', 'both'
  price: number;
  year: number;
  images: string[];
  description: string;
  location: string;
  is_available: boolean;
  rental_price_daily?: number;
  rental_price_weekly?: number;
  rental_price_monthly?: number;
  min_rental_days?: number;
  max_rental_days?: number;
  fuel_consumption?: string;
  operator_required?: boolean;
  delivery_available?: boolean;
  delivery_cost?: number;
  specifications?: any;
}

function getSellerIdFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#vitrine\/?(\w+)?/);
  return match && match[1] ? match[1] : null;
}

// Fonction pour valider une URL d'image
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmedUrl = url.trim();
  if (trimmedUrl === '') return false;
  
  // Vérifier si c'est une URL valide
  try {
    new URL(trimmedUrl);
    return true;
  } catch {
    return false;
  }
}

// Fonction pour récupérer les images d'une machine depuis Supabase Storage
async function getMachineImagesFromStorage(machineId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.storage
      .from('machine-images')
      .list(`${machineId}/`);
    
    if (error) {
      console.error('Erreur récupération images storage:', error);
      return [];
    }
    
    if (data && data.length > 0) {
      return data
        .filter(file => file.name && (file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') || file.name.endsWith('.png')))
        .map(file => {
          const { data: { publicUrl } } = supabase.storage
            .from('machine-images')
            .getPublicUrl(`${machineId}/${file.name}`);
          return publicUrl;
        });
    }
    
    return [];
  } catch (error) {
    console.error('Erreur récupération images:', error);
    return [];
  }
}

// Fonction pour obtenir une image par défaut selon la catégorie de machine
function getDefaultImageForCategory(category: string): string[] {
  const imageMap: { [key: string]: string } = {
    'excavator': 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
    'loader': 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
    'bulldozer': 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
    'crane': 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
    'drill': 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
    'truck': 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
    'compactor': 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
    'grader': 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
    'construction': 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
    // Ajout de nouvelles catégories avec des images plus spécifiques
    'excavatrice': 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
    'pelle': 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
    'chargeuse': 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
    'bouteur': 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
    'grue': 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
    'foreuse': 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
    'forage': 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
    'camion': 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
    'compacteur': 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
    'niveleuse': 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80'
  };
  
  // Normaliser la catégorie pour une meilleure correspondance
  const normalizedCategory = category.toLowerCase().trim();
  return [imageMap[normalizedCategory] || imageMap['construction']];
}

export default function VitrinePersonnalisee() {
  const [vitrineData, setVitrineData] = useState<VitrineData | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { currentCurrency } = useCurrencyStore();
  const [isOwner, setIsOwner] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showRentalForm, setShowRentalForm] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  // États pour l'édition
  const [editData, setEditData] = useState<Partial<VitrineData>>({});
  const [newService, setNewService] = useState('');
  const [newSpecialization, setNewSpecialization] = useState('');
  const [newCertification, setNewCertification] = useState('');
  
  // États pour les interactions intelligentes
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showCostSimulation, setShowCostSimulation] = useState(false);
  const [showCallbackForm, setShowCallbackForm] = useState(false);
  const [showExpertContact, setShowExpertContact] = useState(false);
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [showDataInfo, setShowDataInfo] = useState(false);

  // Filtrer les machines selon la catégorie sélectionnée
  const filteredMachines = machines.filter(machine => {
    if (selectedCategory === 'all') return true;
    // Normaliser les catégories pour une comparaison insensible à la casse
    const machineCategory = machine.category?.toLowerCase() || '';
    const selectedCat = selectedCategory.toLowerCase();
    
    // Mapping des catégories pour une meilleure correspondance
    const categoryMapping: { [key: string]: string[] } = {
      'excavator': ['excavator', 'excavatrice', 'pelle'],
      'bulldozer': ['bulldozer', 'bouteur'],
      'crane': ['crane', 'grue'],
      'loader': ['loader', 'chargeuse'],
      'truck': ['truck', 'camion'],
      'drill': ['drill', 'foreuse', 'forage']
    };
    
    if (categoryMapping[selectedCat]) {
      return categoryMapping[selectedCat].includes(machineCategory);
    }
    
    return machineCategory === selectedCat;
  });

  // Réinitialiser le slide quand on change de catégorie
  useEffect(() => {
    setCurrentSlide(0);
  }, [selectedCategory]);

  useEffect(() => {
    loadVitrineData();
    // Écoute le hash pour navigation dynamique
    window.addEventListener('hashchange', loadVitrineData);
    return () => window.removeEventListener('hashchange', loadVitrineData);
  }, []);

  const loadVitrineData = async () => {
    setLoading(true);
    try {
      const sellerId = getSellerIdFromHash();
      const { data: { user } } = await supabase.auth.getUser();
      let userIdToLoad = sellerId;
      let owner = false;
      const showTestData = false;
      
      // Déterminer quel utilisateur afficher et si c'est le propriétaire
      if (!sellerId && user) {
        // Pas de sellerId dans l'URL, afficher la vitrine de l'utilisateur connecté
        userIdToLoad = user.id;
        owner = true;
      } else if (user && sellerId === user.id) {
        // L'utilisateur connecté regarde sa propre vitrine
        owner = true;
      } else if (sellerId) {
        // Affichage d'une vitrine publique d'un autre utilisateur
        userIdToLoad = sellerId;
        owner = false;
      } else {
        // Pas d'utilisateur connecté et pas de sellerId
        setLoading(false);
        return;
      }
      
      setIsOwner(owner);

      // Récupérer la vitrine
      const { data, error } = await supabase
        .from('vitrines')
        .select(VITRINE_COLUMNS)
        .eq('user_id', userIdToLoad)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erreur chargement vitrine:', error);
      }

      if (data) {
        setVitrineData(data);
        setEditData(data);
      } else {
        // Vitrine par défaut si propriétaire
        if (owner) {
          const defaultVitrine: VitrineData = {
            id: '',
            company_name: 'Mon Entreprise',
            logo_url: '',
            description: 'Description de votre entreprise...',
            services: ['Vente d\'équipements', 'Location', 'Maintenance'],
            address: 'Adresse de votre entreprise',
            phone: '+33 1 23 45 67 89',
            email: 'contact@monentreprise.com',
            website: 'https://monentreprise.com',
            working_hours: 'Lun-Ven: 8h-18h',
            specializations: ['Équipements miniers', 'Machines de construction'],
            certifications: ['ISO 9001', 'Certification sécurité'],
            user_id: userIdToLoad || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            business_type: 'both',
            founding_year: 2010,
            intervention_zone: 'France, Europe, Afrique',
            equipment_count: 50,
            projects_delivered: 200,
            whatsapp: '+33 1 23 45 67 89',
            emergency_phone: '+33 1 23 45 67 90',
            delivery_radius: 100,
            min_rental_duration: 1,
            deposit_required: true,
            fuel_included: false,
            driver_included: false,
            maintenance_included: true,
            // Valeurs par défaut pour les conditions de vente
            warranty_months: 12,
            delivery_time_weeks: 4,
            transport_included: true,
            installation_included: false
          };
          setVitrineData(defaultVitrine);
          setEditData(defaultVitrine);
        } else {
          setVitrineData(null);
        }
      }

      // Récupérer les machines du vendeur avec données de location
      const { data: machinesData, error: machinesError } = await supabase
        .from('machines')
        .select('*, machine_images(*)')
        .eq('sellerid', userIdToLoad)
        .order('created_at', { ascending: false });
      
      if (machinesError) {
        console.error('Erreur chargement machines:', machinesError);
      }
      
      // Afficher les vraies machines si disponibles, sinon des données de démonstration
      if (machinesData && machinesData.length > 0) {
        console.log('Machines trouvées:', machinesData.length, machinesData);
        
        // Utiliser les vraies machines de l'utilisateur avec données de location simulées
        const machinesWithRental = await Promise.all(machinesData.map(async (machine) => {
          // Récupérer les vraies images de la machine
          let machineImages: string[] = [];
          
          // Essayer de récupérer les images depuis machine_images si elles existent
          if (machine.machine_images && machine.machine_images.length > 0) {
            machineImages = machine.machine_images
              .map((img: any) => img.image_url)
              .filter((url: string) => isValidImageUrl(url));
          }
          
          // Si pas d'images dans machine_images, essayer le champ images direct
          if (machineImages.length === 0 && machine.images && machine.images.length > 0) {
            machineImages = machine.images.filter((img: string) => isValidImageUrl(img));
          }
          
          // Si pas d'images dans la base de données, essayer de récupérer depuis le storage
          if (machineImages.length === 0) {
            try {
              const storageImages = await getMachineImagesFromStorage(machine.id);
              if (storageImages.length > 0) {
                machineImages = storageImages;
              }
            } catch (error) {
              console.error('Erreur récupération images storage pour machine', machine.id, error);
            }
          }
          
          // Si toujours pas d'images, utiliser une image par défaut
          if (machineImages.length === 0) {
            machineImages = getDefaultImageForCategory(machine.category || 'construction');
          }
          
          return {
            ...machine,
            images: machineImages,
            type: machine.type || 'both', // S'assurer que le type est bien défini
            is_available: Math.random() > 0.3, // 70% de disponibilité
            rental_price_daily: machine.price ? Math.round(machine.price * 0.02) : 500,
            rental_price_weekly: machine.price ? Math.round(machine.price * 0.12) : 2800,
            rental_price_monthly: machine.price ? Math.round(machine.price * 0.35) : 8000,
            min_rental_days: 1,
            max_rental_days: 365,
            fuel_consumption: '15-25 L/h',
            operator_required: true,
            delivery_available: true,
            delivery_cost: 200
          };
        }));
        
        console.log('Machines avec images:', machinesWithRental);
        setMachines(machinesWithRental);
      } else {
        // Pas de machines trouvées pour ce vendeur
        console.log('Aucune machine trouvée pour le vendeur');
        setMachines([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const vitrineToSave = {
        ...editData,
        user_id: user.id,
        updated_at: new Date().toISOString()
      };

      let result;
      if (vitrineData?.id) {
        // Mise à jour
        result = await supabase
          .from('vitrines')
          .update(vitrineToSave)
          .eq('id', vitrineData.id)
          .select()
          .single();
      } else {
        // Création
        result = await supabase
          .from('vitrines')
          .insert(vitrineToSave)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Erreur sauvegarde:', result.error);
        toast('Erreur lors de la sauvegarde');
        return;
      }

      setVitrineData(result.data);
      setIsEditing(false);
      toast('Vitrine sauvegardée avec succès !');
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const addService = () => {
    if (newService.trim()) {
      setEditData(prev => ({
        ...prev,
        services: [...(prev.services || []), newService.trim()]
      }));
      setNewService('');
    }
  };

  const removeService = (index: number) => {
    setEditData(prev => ({
      ...prev,
      services: prev.services?.filter((_, i) => i !== index) || []
    }));
  };

  const addSpecialization = () => {
    if (newSpecialization.trim()) {
      setEditData(prev => ({
        ...prev,
        specializations: [...(prev.specializations || []), newSpecialization.trim()]
      }));
      setNewSpecialization('');
    }
  };

  const removeSpecialization = (index: number) => {
    setEditData(prev => ({
      ...prev,
      specializations: prev.specializations?.filter((_, i) => i !== index) || []
    }));
  };

  const addCertification = () => {
    if (newCertification.trim()) {
      setEditData(prev => ({
        ...prev,
        certifications: [...(prev.certifications || []), newCertification.trim()]
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (index: number) => {
    setEditData(prev => ({
      ...prev,
      certifications: prev.certifications?.filter((_, i) => i !== index) || []
    }));
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileName = `logo_${user.id}_${Date.now()}`;
      const { data, error } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file);

      if (error) {
        console.error('Erreur upload logo:', error);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);

      setEditData(prev => ({
        ...prev,
        logo_url: publicUrl
      }));
    } catch (error) {
      console.error('Erreur:', error);
    }
  };



  const handleRentalRequest = (machine: Machine) => {
    setSelectedMachine(machine);
    setShowRentalForm(true);
  };

  const handleWhatsAppContact = () => {
    const message = `Bonjour, je suis intéressé par vos services. Pouvez-vous me donner plus d'informations ?`;
    const whatsappUrl = `https://wa.me/${vitrineData?.whatsapp?.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleEmergencyCall = () => {
    window.location.href = `tel:${vitrineData?.emergency_phone}`;
  };

  // Fonctions pour les interactions intelligentes
  const handleGetRecommendations = () => {
    setShowRecommendations(true);
    // Simulation de recommandations basées sur les critères
    setTimeout(() => {
      toast('Recommandations envoyées par email ! Nos experts vous contacteront dans les 24h.');
      setShowRecommendations(false);
    }, 1000);
  };

  const handleCalculateCost = () => {
    setShowCostSimulation(true);
    // Simulation de calcul de coût
    setTimeout(() => {
      toast('Estimation envoyée par email ! Coût total estimé : 7 500€ pour 3 mois avec transport inclus.');
      setShowCostSimulation(false);
    }, 1000);
  };

  const handleCallbackRequest = () => {
    setShowCallbackForm(true);
    // Simulation de demande de rappel
    setTimeout(() => {
      toast('Demande de rappel enregistrée ! Un expert vous appellera sous 2h.');
      setShowCallbackForm(false);
    }, 1000);
  };

  const handleExpertContact = () => {
    setShowExpertContact(true);
    // Simulation de contact expert
    setTimeout(() => {
      toast('Expert contacté ! Il vous rappellera dans les 30 minutes.');
      setShowExpertContact(false);
    }, 1000);
  };

  const handleBundleRequest = () => {
    setShowBundleForm(true);
    // Simulation de demande de bundle
    setTimeout(() => {
      toast('Devis bundle demandé ! Notre équipe vous enverra une proposition complète sous 24h.');
      setShowBundleForm(false);
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement de votre vitrine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <a 
                href="#dashboard-entreprise-display"
                className="text-gray-600 hover:text-gray-900"
              >
                ← Retour au tableau de bord
              </a>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">
                Vitrine Personnalisée
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {!isEditing ? (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Modifier
                  </button>
                  <button 
                    onClick={async () => {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        window.location.hash = `#vitrine/${user.id}`;
                      }
                    }}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Voir en public
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Annuler
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center disabled:opacity-50"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Informations de l'entreprise */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6">
              {/* Logo et nom */}
              <div className="text-center mb-6">
                {isEditing ? (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Logo de l'entreprise
                    </label>
                    <div className="flex items-center justify-center">
                      {editData.logo_url ? (
                        <img 
                          src={editData.logo_url} 
                          alt="Logo" 
                          className="w-24 h-24 object-contain border border-gray-300 rounded-lg"
                        />
                      ) : (
                        <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                          <Upload className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="mt-2 text-sm text-gray-600"
                    />
                  </div>
                ) : (
                  vitrineData?.logo_url && (
                    <img 
                      src={vitrineData.logo_url} 
                      alt="Logo" 
                      className="w-24 h-24 object-contain mx-auto mb-4"
                    />
                  )
                )}
                
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.company_name || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, company_name: e.target.value }))}
                    className="text-2xl font-bold text-gray-900 text-center w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-gray-900">{vitrineData?.company_name}</h2>
                )}
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                {isEditing ? (
                  <textarea
                    value={editData.description || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    rows={4}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Décrivez votre entreprise..."
                  />
                ) : (
                  <p className="text-gray-600 text-sm">{vitrineData?.description}</p>
                )}
              </div>

              {/* Services */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Services</h3>
                {isEditing ? (
                  <div>
                    <div className="space-y-2 mb-3">
                      {editData.services?.map((service, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                          <span className="text-sm">{service}</span>
                          <button
                            onClick={() => removeService(index)}
                            className="text-orange-600 hover:text-orange-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newService}
                        onChange={(e) => setNewService(e.target.value)}
                        placeholder="Nouveau service"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                      <button
                        onClick={addService}
                        className="px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vitrineData?.services?.map((service, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-600">
                        <Check className="h-4 w-4 text-orange-600 mr-2" />
                        {service}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Informations de contact */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact</h3>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.address || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, address: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                      />
                    ) : (
                      <span>{vitrineData?.address}</span>
                    )}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.phone || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                      />
                    ) : (
                      <span>{vitrineData?.phone}</span>
                    )}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="h-4 w-4 mr-2" />
                    {isEditing ? (
                      <input
                        type="email"
                        value={editData.email || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                      />
                    ) : (
                      <span>{vitrineData?.email}</span>
                    )}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Globe className="h-4 w-4 mr-2" />
                    {isEditing ? (
                      <input
                        type="url"
                        value={editData.website || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, website: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                      />
                    ) : (
                      <span>{vitrineData?.website}</span>
                    )}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Clock className="h-4 w-4 mr-2" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.working_hours || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, working_hours: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                      />
                    ) : (
                      <span>{vitrineData?.working_hours}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Spécialisations */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Spécialisations</h3>
                {isEditing ? (
                  <div>
                    <div className="space-y-2 mb-3">
                      {editData.specializations?.map((spec, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                          <span className="text-sm">{spec}</span>
                          <button
                            onClick={() => removeSpecialization(index)}
                            className="text-orange-600 hover:text-orange-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newSpecialization}
                        onChange={(e) => setNewSpecialization(e.target.value)}
                        placeholder="Nouvelle spécialisation"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                      <button
                        onClick={addSpecialization}
                        className="px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vitrineData?.specializations?.map((spec, index) => (
                      <div key={index} className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full mr-2 mb-2">
                        {spec}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Certifications */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Certifications</h3>
                {isEditing ? (
                  <div>
                    <div className="space-y-2 mb-3">
                      {editData.certifications?.map((cert, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                          <span className="text-sm">{cert}</span>
                          <button
                            onClick={() => removeCertification(index)}
                            className="text-orange-600 hover:text-orange-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newCertification}
                        onChange={(e) => setNewCertification(e.target.value)}
                        placeholder="Nouvelle certification"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                      <button
                        onClick={addCertification}
                        className="px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vitrineData?.certifications?.map((cert, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-600">
                        <Star className="h-4 w-4 text-yellow-500 mr-2" />
                        {cert}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Services Professionnels */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Services Professionnels</h3>
                {isEditing ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {editData.services?.map((service, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                          <span className="text-sm">{service}</span>
                          <button
                            onClick={() => removeService(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newService}
                        onChange={(e) => setNewService(e.target.value)}
                        placeholder="Nouveau service"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                      <button
                        onClick={addService}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Services prédéfinis pour vendeurs/loueurs d'engins */}
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">Services suggérés pour votre secteur :</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                          'Maintenance & Réparation',
                          'Transport & Logistique',
                          'Financement',
                          'Location d\'équipements',
                          'Formation des équipes',
                          'Export International',
                          'Reprise d\'ancien matériel',
                          'Assistance technique 24/7',
                          'Garantie étendue'
                        ].map((suggestedService) => (
                          <button
                            key={suggestedService}
                            onClick={() => {
                              if (!editData.services?.includes(suggestedService)) {
                                setEditData(prev => ({
                                  ...prev,
                                  services: [...(prev.services || []), suggestedService]
                                }));
                              }
                            }}
                            disabled={editData.services?.includes(suggestedService)}
                            className={`px-3 py-1 text-xs rounded-full border ${
                              editData.services?.includes(suggestedService)
                                ? 'bg-orange-100 text-orange-800 border-orange-300 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                            }`}
                          >
                            {suggestedService}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {vitrineData?.services?.map((service, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                        <Wrench className="h-4 w-4 text-orange-500 mr-2" />
                        {service}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Évaluations Clients */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Évaluations Clients</h3>
                <div className="flex items-center justify-start">
                  <div className="text-left">
                    <div className="flex items-center mb-4">
                      <div className="flex text-yellow-400 mr-3">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-6 w-6 fill-current" />
                        ))}
                      </div>
                      <div className="text-2xl font-bold text-gray-900">5.0</div>
                    </div>
                    <div className="text-lg text-gray-600 mb-2">
                      <span className="font-semibold text-orange-600">247</span> avis clients
                    </div>
                    <div className="text-sm text-gray-500">
                      Basé sur les évaluations récentes
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Machines de l'entreprise */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  Nos Équipements ({filteredMachines.length})
                </h2>
                <div className="flex items-center space-x-4">
                  {/* Filtres par catégorie */}
                  <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="all">Toutes catégories</option>
                    <option value="excavator">Excavatrices</option>
                    <option value="bulldozer">Bulldozers</option>
                    <option value="crane">Grues</option>
                    <option value="loader">Chargeuses</option>
                    <option value="truck">Camions</option>
                    <option value="drill">Foreuses</option>
                  </select>
                  
                  {isOwner && (
                    <button 
                      onClick={() => window.location.hash = '#dashboard/annonces'}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter une machine
                    </button>
                  )}
                </div>
              </div>

              {filteredMachines.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Aucune machine trouvée
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {selectedCategory === 'all' 
                      ? 'Publiez vos premières machines pour les afficher dans votre vitrine.'
                      : `Aucune machine dans la catégorie "${selectedCategory}"`
                    }
                  </p>
                  {isOwner && selectedCategory === 'all' && (
                    <button 
                      onClick={() => window.location.hash = '#dashboard/annonces'}
                      className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      Publier ma première machine
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  {/* Carrousel amélioré */}
                  <div className="overflow-hidden">
                    <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
                      {/* Grouper les machines par slides */}
                      {(() => {
                        const machinesPerSlide = 2; // 2 machines par slide pour plus de lisibilité
                        const slides = [];
                        
                        for (let i = 0; i < filteredMachines.length; i += machinesPerSlide) {
                          const slideMachines = filteredMachines.slice(i, i + machinesPerSlide);
                          slides.push(
                            <div key={i} className="w-full flex-shrink-0 px-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {slideMachines.map((machine) => (
                                  <div
                                    key={machine.id}
                                    className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer"
                                    onClick={() => window.location.hash = `#machines/${machine.id}`}
                                  >
                                    <div className="relative">
                                      <div className="aspect-w-16 aspect-h-9 bg-gray-100">
                                        {machine.images && machine.images.length > 0 ? (
                                          <img
                                            src={machine.images[0]}
                                            alt={machine.name}
                                            className="w-full h-64 object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-64 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                                            <Building2 className="h-16 w-16 text-gray-400" />
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Badge de disponibilité */}
                                      <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-sm font-medium shadow-lg ${
                                        machine.is_available 
                                                          ? 'bg-orange-500 text-white'
                : 'bg-orange-400 text-white'
                                      }`}>
                                        {machine.is_available ? '✓ Disponible' : '✗ Indisponible'}
                                      </div>



                                      {/* Gradient overlay pour le texte */}
                                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent h-20"></div>
                                    </div>
                                    
                                    <div className="p-6">
                                      <h3 className="font-bold text-xl text-gray-900 mb-2">{machine.name}</h3>
                                      <p className="text-sm text-gray-600 mb-3">
                                        {machine.brand} {machine.model} • {machine.year}
                                      </p>
                                      <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                                        <div className="flex items-center">
                                          <MapPin className="h-4 w-4 mr-1" />
                                          {machine.location}
                                        </div>
                                        <div className="px-2 py-1 bg-orange-500 text-white rounded-full text-xs font-medium">
                                          ⭐ Certifié
                                        </div>
                                      </div>
                                      
                                      {/* Prix selon le type de business */}
                                      <div className="mb-4">
                                        {vitrineData?.business_type === 'renter' || vitrineData?.business_type === 'both' ? (
                                          <div className="space-y-2">
                                            <div className="text-sm text-gray-600">
                                              <span className="font-semibold">Location :</span>
                                            </div>
                                            <div className="flex items-baseline space-x-4">
                                              <div>
                                                <span className="text-2xl font-bold text-orange-600">{machine.rental_price_daily}€</span>
                                                <span className="text-sm text-gray-500 ml-1">/jour</span>
                                              </div>
                                              <div className="text-sm text-gray-500">
                                                {machine.rental_price_weekly}€/semaine
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-2xl font-bold text-orange-600">
                                            <Price amount={machine.price} showOriginal />
                                          </div>
                                        )}
                                      </div>

                                      {/* Spécifications rapides */}
                                      {machine.specifications && (
                                        <div className="flex flex-wrap gap-2 mb-4">
                                          {machine.specifications.power?.value && (
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                                              ⚡ {machine.specifications.power.value} {machine.specifications.power.unit}
                                            </span>
                                          )}
                                          {machine.specifications.weight && (
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                                              ⚖️ {machine.specifications.weight.toLocaleString()} kg
                                            </span>
                                          )}
                                          {machine.fuel_consumption && (
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                                              ⛽ {machine.fuel_consumption}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); window.location.hash = `#machines/${machine.id}`; }}
                                          className="text-orange-600 hover:text-orange-700 font-medium flex items-center transition-colors"
                                        >
                                          Voir détails
                                          <ChevronRight className="h-4 w-4 ml-1" />
                                        </button>
                                        
                                        {/* Boutons d'action selon le type de machine et le type de business */}
                                        {(() => {
                                          const machineType = machine.type || 'both';
                                          const businessType = vitrineData?.business_type || 'both';
                                          
                                          if (machineType === 'rental' || businessType === 'renter') {
                                            return (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleRentalRequest(machine); }}
                                                disabled={!machine.is_available}
                                                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                  machine.is_available
                                                    ? 'bg-orange-600 text-white hover:bg-orange-700 hover:shadow-lg'
                                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                }`}
                                              >
                                                {machine.is_available ? 'Réserver maintenant' : 'Indisponible'}
                                              </button>
                                            );
                                          }
                                          
                                          if (machineType === 'sale' || businessType === 'seller') {
                                            return (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); window.location.hash = `#machines/${machine.id}`; }}
                                                className="px-6 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 hover:shadow-lg transition-all duration-200"
                                              >
                                                Acheter
                                              </button>
                                            );
                                          }
                                          
                                          return (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleRentalRequest(machine); }}
                                              disabled={!machine.is_available}
                                              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                machine.is_available
                                                  ? 'bg-orange-600 text-white hover:bg-orange-700 hover:shadow-lg'
                                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                              }`}
                                            >
                                              {machine.is_available ? 'Réserver maintenant' : 'Indisponible'}
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        
                        return slides;
                      })()}
                    </div>
                  </div>

                  {/* Navigation du carrousel */}
                  {(() => {
                    const machinesPerSlide = 2;
                    const totalSlides = Math.ceil(filteredMachines.length / machinesPerSlide);
                    
                    if (totalSlides > 1) {
                      return (
                        <>
                          {/* Bouton précédent */}
                          <button
                            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                            disabled={currentSlide === 0}
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center transition-all duration-200 ${
                              currentSlide === 0 
                                ? 'text-gray-300 cursor-not-allowed' 
                                : 'text-gray-700 hover:text-orange-600 hover:shadow-xl'
                            }`}
                          >
                            <ChevronRight className="h-6 w-6 transform rotate-180" />
                          </button>

                          {/* Bouton suivant */}
                          <button
                            onClick={() => setCurrentSlide(Math.min(totalSlides - 1, currentSlide + 1))}
                            disabled={currentSlide === totalSlides - 1}
                            className={`absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center transition-all duration-200 ${
                              currentSlide === totalSlides - 1 
                                ? 'text-gray-300 cursor-not-allowed' 
                                : 'text-gray-700 hover:text-orange-600 hover:shadow-xl'
                            }`}
                          >
                            <ChevronRight className="h-6 w-6" />
                          </button>

                          {/* Indicateurs */}
                          <div className="flex justify-center mt-6 space-x-2">
                            {Array.from({ length: totalSlides }, (_, index) => (
                              <button
                                key={index}
                                onClick={() => setCurrentSlide(index)}
                                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                                  index === currentSlide 
                                    ? 'bg-orange-600 scale-125' 
                                    : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                              />
                            ))}
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>

            {/* Section d'information sur les données affichées */}
            {isOwner && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-orange-800">
                      Comment fonctionne votre vitrine ?
                    </h3>
                    <div className="mt-2 text-sm text-orange-700">
                      <p className="mb-2">
                        <strong>Vos vraies annonces :</strong> Cette vitrine affiche automatiquement les équipements que vous avez publiés via le bouton "Publication rapide".
                      </p>
                      <p className="mb-2">
                        <strong>Données de démonstration :</strong> Si vous n'avez pas encore publié d'équipements, des exemples sont affichés pour montrer le potentiel de votre vitrine.
                      </p>
                      <p>
                        <strong>Partagez votre vitrine :</strong> Votre URL personnalisée permet aux clients de voir vos équipements : <code className="bg-orange-100 px-2 py-1 rounded text-xs">votre-site.com/#vitrine/{vitrineData?.user_id}</code>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* Conditions de location/vente */}
            {(
              <div className="bg-white rounded-lg shadow-md p-6 mt-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {(vitrineData?.business_type || 'both') === 'seller' ? 'Conditions de Vente' : 
                     (vitrineData?.business_type || 'both') === 'renter' ? 'Conditions de Location' : 
                     'Conditions de Location et Vente'}
                  </h2>
                  {isOwner && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-1 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center text-sm"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Modifier
                    </button>
                  )}
                </div>
                
                {isEditing ? (
                  <div className="space-y-6">
                    {/* Type de business */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type d'activité
                      </label>
                      <select
                        value={editData.business_type || 'both'}
                        onChange={(e) => setEditData(prev => ({ ...prev, business_type: e.target.value as 'seller' | 'renter' | 'both' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="seller">Vente uniquement</option>
                        <option value="renter">Location uniquement</option>
                        <option value="both">Vente et Location</option>
                      </select>
                    </div>

                    {/* Conditions de location */}
                    {(editData.business_type === 'renter' || editData.business_type === 'both') && (
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Conditions de Location</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Durée minimale (jours)
                            </label>
                            <input
                              type="number"
                              value={editData.min_rental_duration || 1}
                              onChange={(e) => setEditData(prev => ({ ...prev, min_rental_duration: parseInt(e.target.value) || 1 }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              min="1"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Rayon de livraison (km)
                            </label>
                            <input
                              type="number"
                              value={editData.delivery_radius || 100}
                              onChange={(e) => setEditData(prev => ({ ...prev, delivery_radius: parseInt(e.target.value) || 100 }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              min="0"
                            />
                          </div>
                        </div>
                        
                        <div className="mt-4 space-y-3">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editData.deposit_required || false}
                              onChange={(e) => setEditData(prev => ({ ...prev, deposit_required: e.target.checked }))}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Caution obligatoire</span>
                          </label>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editData.fuel_included || false}
                              onChange={(e) => setEditData(prev => ({ ...prev, fuel_included: e.target.checked }))}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Carburant inclus</span>
                          </label>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editData.driver_included || false}
                              onChange={(e) => setEditData(prev => ({ ...prev, driver_included: e.target.checked }))}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Chauffeur inclus</span>
                          </label>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editData.maintenance_included || false}
                              onChange={(e) => setEditData(prev => ({ ...prev, maintenance_included: e.target.checked }))}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Maintenance incluse</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Conditions de vente */}
                    {(editData.business_type === 'seller' || editData.business_type === 'both') && (
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Conditions de Vente</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Garantie (mois)
                            </label>
                            <input
                              type="number"
                              value={editData.warranty_months || 12}
                              onChange={(e) => setEditData(prev => ({ ...prev, warranty_months: parseInt(e.target.value) || 12 }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              min="0"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Délai de livraison (semaines)
                            </label>
                            <input
                              type="number"
                              value={editData.delivery_time_weeks || 4}
                              onChange={(e) => setEditData(prev => ({ ...prev, delivery_time_weeks: parseInt(e.target.value) || 4 }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              min="1"
                            />
                          </div>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editData.transport_included || false}
                              onChange={(e) => setEditData(prev => ({ ...prev, transport_included: e.target.checked }))}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Transport inclus</span>
                          </label>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={editData.installation_included || false}
                              onChange={(e) => setEditData(prev => ({ ...prev, installation_included: e.target.checked }))}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Installation incluse</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Affichage des conditions de location */}
                    {((vitrineData?.business_type || 'both') === 'renter' || (vitrineData?.business_type || 'both') === 'both') && (
                      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                                                      <span className="text-orange-600 mr-2">🏗️</span>
                          Informations de location
                        </h3>
                        <ul className="text-sm text-gray-600 space-y-2">
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Durée minimale : <strong>{vitrineData?.min_rental_duration || 1} jour(s)</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Caution : <strong>{vitrineData?.deposit_required ? 'Obligatoire' : 'Non requise'}</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Carburant : <strong>{vitrineData?.fuel_included ? 'Inclus' : 'À la charge du client'}</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Chauffeur : <strong>{vitrineData?.driver_included ? 'Inclus' : 'Non inclus'}</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Maintenance : <strong>{vitrineData?.maintenance_included ? 'Incluse' : 'À la charge du client'}</strong>
                          </li>
                        </ul>
                      </div>
                    )}
                    
                    {/* Affichage des conditions de vente */}
                    {((vitrineData?.business_type || 'both') === 'seller' || (vitrineData?.business_type || 'both') === 'both') && (
                      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                                                      <span className="text-orange-600 mr-2">💰</span>
                          Informations de vente
                        </h3>
                        <ul className="text-sm text-gray-600 space-y-2">
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Garantie : <strong>{vitrineData?.warranty_months || 12} mois</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Délai de livraison : <strong>{vitrineData?.delivery_time_weeks || 4} semaines</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Transport : <strong>{vitrineData?.transport_included ? 'Inclus' : 'À la charge du client'}</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Installation : <strong>{vitrineData?.installation_included ? 'Incluse' : 'Non incluse'}</strong>
                          </li>
                          <li className="flex items-center">
                            <span className="text-orange-500 mr-2">•</span>
                            Paiement : <strong>30% à la commande, 70% à la livraison</strong>
                          </li>
                        </ul>
                      </div>
                    )}
                    
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                        <span className="text-orange-600 mr-2">🚚</span>
                        Zone de livraison
                      </h3>
                      <p className="text-sm text-gray-600 mb-3">
                        Rayon de livraison : <strong>{vitrineData?.delivery_radius || 100} km</strong> autour de <strong>{vitrineData?.address || 'votre localisation'}</strong>
                      </p>
                      <div className="bg-white p-3 rounded-lg border border-orange-200">
                        <p className="text-xs text-gray-600 flex items-center">
                          <span className="text-orange-500 mr-2">💡</span>
                          Livraison gratuite dans un rayon de 50km. Au-delà, frais de transport selon la distance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}





            {/* Interactions Intelligentes */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Guide
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Assistant de choix intelligent */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="text-orange-600 mr-2">🧠</span>
                    Trouvez votre équipement idéal
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type de chantier</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option>Sélectionnez votre chantier</option>
                        <option>Construction de routes</option>
                        <option>Mining / Extraction</option>
                        <option>Agriculture</option>
                        <option>Démolition</option>
                        <option>Manutention</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Budget estimé</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option>Sélectionnez votre budget</option>
                        <option>Moins de 50k€</option>
                        <option>50k€ - 150k€</option>
                        <option>150k€ - 500k€</option>
                        <option>Plus de 500k€</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Durée d'utilisation</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option>Sélectionnez la durée</option>
                        <option>1-3 mois</option>
                        <option>3-6 mois</option>
                        <option>6-12 mois</option>
                        <option>Plus d'un an</option>
                      </select>
                    </div>
                    
                    <button 
                      onClick={handleGetRecommendations}
                      disabled={showRecommendations}
                      className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {showRecommendations ? '⏳ Traitement...' : '💡 Obtenir mes recommandations'}
                    </button>
                  </div>
                </div>

                {/* Simulation de coût */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="text-orange-600 mr-2">💰</span>
                    Simulateur de coût
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Équipement</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option>Sélectionnez un équipement</option>
                        {filteredMachines.slice(0, 3).map(machine => (
                          <option key={machine.id}>{machine.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Durée</label>
                      <div className="flex space-x-2">
                        <input type="number" placeholder="3" className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                          <option>mois</option>
                          <option>semaines</option>
                          <option>jours</option>
                        </select>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Localisation</label>
                      <input type="text" placeholder="Ex: Rabat, Maroc" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </div>
                    
                    <button 
                      onClick={handleCalculateCost}
                      disabled={showCostSimulation}
                      className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {showCostSimulation ? '⏳ Calcul...' : '🧮 Calculer le coût total'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Services d'accompagnement */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                {/* Demande de rappel */}
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                    <span className="text-orange-600 mr-2">📞</span>
                    Rappel gratuit
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Un expert vous rappelle sous 2h pour étudier votre projet
                  </p>
                  <button 
                    onClick={handleCallbackRequest}
                    disabled={showCallbackForm}
                    className="w-full px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {showCallbackForm ? '⏳ Enregistrement...' : 'Demander un rappel'}
                  </button>
                </div>

                {/* Conseiller expert */}
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                                          <span className="text-orange-600 mr-2">🧑‍🔧</span>
                    Expert dédié
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Accès direct à un conseiller spécialisé dans votre secteur
                  </p>
                  <button 
                    onClick={handleExpertContact}
                    disabled={showExpertContact}
                    className="w-full px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {showExpertContact ? '⏳ Contact...' : 'Contacter l\'expert'}
                  </button>
                </div>

                {/* Bundle clé-en-main */}
                <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                    <span className="text-teal-600 mr-2">📦</span>
                    Solution complète
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Machine + transport + opérateur + maintenance
                  </p>
                  <button 
                    onClick={handleBundleRequest}
                    disabled={showBundleForm}
                    className="w-full px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {showBundleForm ? '⏳ Demande...' : 'Demander un devis'}
                  </button>
                </div>
              </div>
            </div>

            {/* Badges de confiance et carte des projets */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Badges de confiance */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="text-orange-600 mr-2">🔐</span>
                    Certifications & Garanties
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 text-center">
                  <div className="text-orange-600 text-lg mb-1">✓</div>
                      <div className="text-xs font-medium text-gray-700">Vendeur Vérifié</div>
                    </div>
                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 text-center">
                  <div className="text-orange-600 text-lg mb-1">⭐</div>
                      <div className="text-xs font-medium text-gray-700">Pro Certifié</div>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 text-center">
                      <div className="text-orange-600 text-lg mb-1">🛡️</div>
                      <div className="text-xs font-medium text-gray-700">Garantie 12 mois</div>
                    </div>
                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 text-center">
                  <div className="text-orange-600 text-lg mb-1">🚚</div>
                      <div className="text-xs font-medium text-gray-700">Livraison incluse</div>
                    </div>
                  </div>
                </div>

                {/* Carte des projets réalisés */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="text-orange-600 mr-2">📍</span>
                    Projets réalisés à proximité
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Construction Route A1</div>
                          <div className="text-xs text-gray-600">Rabat - 15km • 2023</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Mine de Phosphate</div>
                          <div className="text-xs text-gray-600">Khouribga - 45km • 2023</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">Port de Casablanca</div>
                          <div className="text-xs text-gray-600">Casablanca - 80km • 2022</div>
                        </div>
                      </div>
                    </div>
                    <button className="w-full mt-3 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm">
                      Voir tous les projets
                    </button>
                  </div>
                </div>
              </div>
            </div>


          </div>
        </div>
      </div>

      {/* Modal de réservation de location */}
      {showRentalForm && selectedMachine && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Réservation - {selectedMachine.name}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de chantier</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option>Construction</option>
                  <option>Mining</option>
                  <option>Agriculture</option>
                  <option>Forestry</option>
                  <option>Autre</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date début</label>
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lieu de livraison</label>
                <input type="text" placeholder="Adresse complète" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              
              <div className="space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" />
                  <span className="text-sm">Transport inclus</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" />
                  <span className="text-sm">Chauffeur inclus</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" />
                  <span className="text-sm">Maintenance sur site</span>
                </label>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowRentalForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  toast('Demande de réservation envoyée !');
                  setShowRentalForm(false);
                }}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Réserver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 