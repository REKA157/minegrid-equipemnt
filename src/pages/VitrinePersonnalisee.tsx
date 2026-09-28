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
import BackToDashboardButton from '../components/common/BackToDashboardButton';
import { VITRINE_COLUMNS } from '../constants/apiQueryFields';
import { useCurrencyStore } from '../stores/currencyStore';
import Price from '../components/Price';
import { toast } from '../utils/toast';
import { useMemberScope } from '../hooks/useMemberScope';
import { isInvitedMember } from '../utils/api/memberScope';
import { submitQuoteRequest } from '../utils/api/quoteRequests';
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

// Logique de la vitrine sortie dans son propre module, ou elle est enfin
// testable (vitrineHelpers.test.ts). Y COMPRIS la lecture de l'identifiant
// vendeur, dont la regex tronquait les UUID : voir l'en-tete du module.
import {
  FORMULAIRE_LOCATION_VIDE,
  lireIdentifiantVendeurDepuisHash,
  isValidImageUrl,
  getDefaultImageForCategory,
} from './vitrineHelpers';

/** Identifiant du vendeur porte par l'URL courante. */
function getSellerIdFromHash() {
  return lireIdentifiantVendeurDepuisHash(window.location.hash);
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

export default function VitrinePersonnalisee() {
  const [vitrineData, setVitrineData] = useState<VitrineData | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { currentCurrency } = useCurrencyStore();
  const [isOwner, setIsOwner] = useState(false);
  // Édition réservée au PROPRIÉTAIRE : un membre invité a la vitrine en lecture seule.
  const { scope: memberScope } = useMemberScope();
  const canEdit = isOwner && !isInvitedMember(memberScope);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showRentalForm, setShowRentalForm] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  // États pour l'édition
  const [editData, setEditData] = useState<Partial<VitrineData>>({});
  const [newService, setNewService] = useState('');
  const [newSpecialization, setNewSpecialization] = useState('');
  const [newCertification, setNewCertification] = useState('');
  
  // Critères de recherche du visiteur : transmis tels quels à l'entreprise,
  // aucun moteur de recommandation n'existe côté serveur.
  const [criteres, setCriteres] = useState({ chantier: '', budget: '', duree: '' });

  // Simulateur : le calcul n'utilise QUE les tarifs de location publiés sur
  // l'annonce. Pas de tarif publié = pas d'estimation (cf. estimationIndisponible).
  const [simulation, setSimulation] = useState({ machineId: '', duree: '1', unite: 'mois' });
  const [estimation, setEstimation] = useState<{
    machine: string;
    tarif: number;
    unite: string;
    quantite: number;
    total: number;
  } | null>(null);
  const [estimationIndisponible, setEstimationIndisponible] = useState<string | null>(null);

  // Demande de location (modale)
  const [rentalForm, setRentalForm] = useState(FORMULAIRE_LOCATION_VIDE);
  const [rentalSubmitting, setRentalSubmitting] = useState(false);
  const [rentalError, setRentalError] = useState<string | null>(null);
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
            // Anti-façade : NE PAS inventer la disponibilité ni les prix de location.
            // On reflète les vraies valeurs de la machine si elles existent, sinon
            // disponible par défaut (l'annonce est publiée) et prix de location null
            // (affiché « sur demande » plutôt qu'un montant fabriqué).
            is_available: machine.is_available ?? true,
            rental_price_daily: machine.rental_price_daily ?? null,
            rental_price_weekly: machine.rental_price_weekly ?? null,
            rental_price_monthly: machine.rental_price_monthly ?? null,
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
    // Sécurité : un membre invité ne peut pas enregistrer la vitrine (lecture seule).
    if (!canEdit) {
      toast('La vitrine est en lecture seule : seul le propriétaire peut la modifier.');
      return;
    }
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
    setRentalForm(FORMULAIRE_LOCATION_VIDE);
    setRentalError(null);
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

  /**
   * Seuls canaux de contact RÉELS d'une vitrine : le numéro WhatsApp et l'e-mail
   * saisis par l'entreprise. Rien d'autre n'est branché côté serveur — pas de
   * file de rappel, pas d'équipe d'experts, pas de moteur de recommandation.
   */
  const canalContact = (() => {
    const whatsapp = vitrineData?.whatsapp?.replace(/\D/g, '') || '';
    if (whatsapp) return { type: 'whatsapp' as const, cible: whatsapp };
    const email = vitrineData?.email?.trim() || '';
    if (email) return { type: 'email' as const, cible: email };
    return null;
  })();

  const handleEnvoyerCriteres = () => {
    if (!canalContact) return;
    const message = [
      `Bonjour ${vitrineData?.company_name || ''},`.trim(),
      'Je cherche un équipement correspondant à ces critères :',
      `- Type de chantier : ${criteres.chantier || 'non précisé'}`,
      `- Budget estimé : ${criteres.budget || 'non précisé'}`,
      `- Durée d'utilisation : ${criteres.duree || 'non précisée'}`,
    ].join('\n');

    if (canalContact.type === 'whatsapp') {
      window.open(`https://wa.me/${canalContact.cible}?text=${encodeURIComponent(message)}`, '_blank');
      return;
    }
    const sujet = encodeURIComponent('Recherche d\'équipement');
    window.open(`mailto:${canalContact.cible}?subject=${sujet}&body=${encodeURIComponent(message)}`, '_blank');
  };

  const handleEstimerLocation = () => {
    setEstimation(null);
    setEstimationIndisponible(null);

    const machine = machines.find(m => m.id === simulation.machineId);
    if (!machine) {
      setEstimationIndisponible('Sélectionnez un équipement pour obtenir une estimation.');
      return;
    }
    const quantite = Number(simulation.duree);
    if (!Number.isFinite(quantite) || quantite <= 0) {
      setEstimationIndisponible('Indiquez une durée supérieure à zéro.');
      return;
    }
    const tarif =
      simulation.unite === 'mois'
        ? machine.rental_price_monthly
        : simulation.unite === 'semaines'
          ? machine.rental_price_weekly
          : machine.rental_price_daily;

    if (!tarif || tarif <= 0) {
      setEstimationIndisponible(
        `Le tarif de location n'est pas renseigné sur l'annonce « ${machine.name} » pour cette unité : aucune estimation ne peut être calculée ici.`,
      );
      return;
    }
    setEstimation({
      machine: machine.name,
      tarif,
      unite: simulation.unite,
      quantite,
      total: tarif * quantite,
    });
  };

  const handleEnvoyerDemandeLocation = async () => {
    if (!selectedMachine) return;
    const nom = rentalForm.nom.trim();
    const email = rentalForm.email.trim();
    if (!nom || !email) {
      setRentalError('Renseignez votre nom et votre email : sans eux le loueur ne peut pas vous répondre.');
      return;
    }

    setRentalSubmitting(true);
    setRentalError(null);
    try {
      const options = [
        rentalForm.transport ? 'transport' : null,
        rentalForm.chauffeur ? 'chauffeur' : null,
        rentalForm.maintenance ? 'maintenance sur site' : null,
      ].filter(Boolean);
      const message = [
        `Demande de location — ${selectedMachine.name}`,
        `Type de chantier : ${rentalForm.chantier}`,
        `Période souhaitée : du ${rentalForm.dateDebut || 'non précisé'} au ${rentalForm.dateFin || 'non précisé'}`,
        `Lieu de livraison : ${rentalForm.lieu || 'non précisé'}`,
        `Options demandées : ${options.length ? options.join(', ') : 'aucune'}`,
      ].join('\n');

      const resultat = await submitQuoteRequest({
        machine_id: selectedMachine.id,
        machine_name: selectedMachine.name,
        brand: selectedMachine.brand || null,
        seller_id: vitrineData?.user_id || null,
        buyer_name: nom,
        buyer_email: email,
        buyer_phone: rentalForm.telephone.trim() || null,
        need_by_date: rentalForm.dateDebut || null,
        message,
        source: 'vitrine_location',
      });

      toast.success(
        `Demande de location enregistrée (référence ${resultat.quoteId}). Elle apparaît dans les demandes du loueur.`,
      );
      setShowRentalForm(false);
      setRentalForm(FORMULAIRE_LOCATION_VIDE);
    } catch (error) {
      console.error('Erreur demande de location:', error);
      setRentalError(
        'La demande n\'a pas pu être enregistrée. Réessayez, ou contactez l\'entreprise directement.',
      );
      toast.error('La demande de location n\'a pas pu être enregistrée.');
    } finally {
      setRentalSubmitting(false);
    }
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
              <BackToDashboardButton />
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">
                Ma vitrine entreprise
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {!isEditing ? (
                <>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Modifier
                    </button>
                  )}
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
              {/* Bloc « Évaluations Clients » retiré : il affichait une note 5.0 et
                  « 247 avis clients » codés en dur, identiques pour toutes les
                  vitrines (fausse preuve sociale). À rebrancher sur une vraie table
                  d'avis le jour où elle existera. */}
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
                  
                  {canEdit && (
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
                  {canEdit && selectedCategory === 'all' && (
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
                                            {machine.rental_price_daily ? (
                                              <div className="flex items-baseline space-x-4">
                                                <div>
                                                  <span className="text-2xl font-bold text-orange-600">{machine.rental_price_daily}€</span>
                                                  <span className="text-sm text-gray-500 ml-1">/jour</span>
                                                </div>
                                                {machine.rental_price_weekly ? (
                                                  <div className="text-sm text-gray-500">
                                                    {machine.rental_price_weekly}€/semaine
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : (
                                              <div className="text-lg font-semibold text-orange-600">Prix sur demande</div>
                                            )}
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
            {canEdit && (
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
                  {canEdit && (
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





            {/* Guide — critères de recherche et estimation de location */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Guide
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Critères de recherche — transmis à l'entreprise sur son canal réel */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="text-orange-600 mr-2">🧠</span>
                    Décrivez votre besoin
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="criteres-chantier" className="block text-sm font-medium text-gray-700 mb-2">Type de chantier</label>
                      <select
                        id="criteres-chantier"
                        value={criteres.chantier}
                        onChange={(e) => setCriteres(prev => ({ ...prev, chantier: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Sélectionnez votre chantier</option>
                        <option>Construction de routes</option>
                        <option>Mining / Extraction</option>
                        <option>Agriculture</option>
                        <option>Démolition</option>
                        <option>Manutention</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="criteres-budget" className="block text-sm font-medium text-gray-700 mb-2">Budget estimé</label>
                      <select
                        id="criteres-budget"
                        value={criteres.budget}
                        onChange={(e) => setCriteres(prev => ({ ...prev, budget: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Sélectionnez votre budget</option>
                        <option>Moins de 50k€</option>
                        <option>50k€ - 150k€</option>
                        <option>150k€ - 500k€</option>
                        <option>Plus de 500k€</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="criteres-duree" className="block text-sm font-medium text-gray-700 mb-2">Durée d'utilisation</label>
                      <select
                        id="criteres-duree"
                        value={criteres.duree}
                        onChange={(e) => setCriteres(prev => ({ ...prev, duree: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Sélectionnez la durée</option>
                        <option>1-3 mois</option>
                        <option>3-6 mois</option>
                        <option>6-12 mois</option>
                        <option>Plus d'un an</option>
                      </select>
                    </div>

                    <button
                      onClick={handleEnvoyerCriteres}
                      disabled={!canalContact}
                      className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!canalContact
                        ? 'Envoyer mes critères'
                        : canalContact.type === 'email'
                          ? '✉️ Envoyer mes critères par email'
                          : '💬 Envoyer mes critères sur WhatsApp'}
                    </button>
                    <p className="text-xs text-gray-600">
                      {canalContact
                        ? 'Vos critères sont recopiés dans un message que vous envoyez vous-même à l\'entreprise. MineGrid ne fait aucune recommandation automatique.'
                        : 'Cette entreprise n\'a pas renseigné de canal de contact (WhatsApp ou email) : impossible de lui transmettre vos critères depuis cette page.'}
                    </p>
                  </div>
                </div>

                {/* Estimation de location — calculée sur les tarifs publiés, sinon rien */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="text-orange-600 mr-2">💰</span>
                    Estimation de location
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="simulateur-equipement" className="block text-sm font-medium text-gray-700 mb-2">Équipement</label>
                      <select
                        id="simulateur-equipement"
                        value={simulation.machineId}
                        onChange={(e) => setSimulation(prev => ({ ...prev, machineId: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Sélectionnez un équipement</option>
                        {filteredMachines.map(machine => (
                          <option key={machine.id} value={machine.id}>{machine.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="simulateur-duree" className="block text-sm font-medium text-gray-700 mb-2">Durée de location</label>
                      <div className="flex space-x-2">
                        <input
                          id="simulateur-duree"
                          type="number"
                          min="1"
                          value={simulation.duree}
                          onChange={(e) => setSimulation(prev => ({ ...prev, duree: e.target.value }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                        <label htmlFor="simulateur-unite" className="sr-only">Unité de durée</label>
                        <select
                          id="simulateur-unite"
                          value={simulation.unite}
                          onChange={(e) => setSimulation(prev => ({ ...prev, unite: e.target.value }))}
                          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        >
                          <option value="mois">mois</option>
                          <option value="semaines">semaines</option>
                          <option value="jours">jours</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleEstimerLocation}
                      className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                    >
                      🧮 Estimer le coût de location
                    </button>

                    {estimation && (
                      <div className="bg-white p-4 rounded-lg border border-orange-200">
                        <p className="text-sm text-gray-700">
                          {estimation.machine} — {estimation.quantite} {estimation.unite} au tarif publié de {estimation.tarif}€/{estimation.unite === 'mois' ? 'mois' : estimation.unite === 'semaines' ? 'semaine' : 'jour'}
                        </p>
                        <p className="text-2xl font-bold text-orange-600 mt-1">
                          <Price amount={estimation.total} />
                        </p>
                        <p className="text-xs text-gray-600 mt-2">
                          Location seule. Transport, carburant, chauffeur, assurance et caution ne sont pas chiffrés ici : demandez-les à l'entreprise.
                        </p>
                      </div>
                    )}

                    {estimationIndisponible && (
                      <div className="bg-white p-4 rounded-lg border border-gray-300">
                        <p className="text-sm text-gray-700">{estimationIndisponible}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Les trois cartes « Rappel gratuit », « Expert dédié » et « Solution
                  complète » ont été retirées : aucun de ces services n'existe côté
                  serveur (pas de file de rappel, pas d'équipe de conseillers, pas
                  d'offre bundle). Leurs boutons affichaient un succès et un délai
                  d'intervention après un simple setTimeout. À rétablir le jour où
                  le service existe réellement, pas avant. */}
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

                {/* Bloc « Projets réalisés à proximité » retiré : les projets (Route A1
                    Rabat, Mine de Khouribga, Port de Casablanca) étaient codés en dur,
                    identiques pour toutes les vitrines (faux portfolio). À rebrancher sur
                    une vraie table de réalisations le jour où elle existera. */}
              </div>
            </div>


          </div>
        </div>
      </div>

      {/* Demande de location — écrit une vraie demande (quote_requests) */}
      {showRentalForm && selectedMachine && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Demande de location - {selectedMachine.name}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Ce formulaire envoie une demande au loueur : ce n'est pas une réservation confirmée.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="location-nom" className="block text-sm font-medium text-gray-700 mb-1">Votre nom *</label>
                <input
                  id="location-nom"
                  type="text"
                  value={rentalForm.nom}
                  onChange={(e) => setRentalForm(prev => ({ ...prev, nom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="location-email" className="block text-sm font-medium text-gray-700 mb-1">Votre email *</label>
                  <input
                    id="location-email"
                    type="email"
                    value={rentalForm.email}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="location-telephone" className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input
                    id="location-telephone"
                    type="tel"
                    value={rentalForm.telephone}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, telephone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="location-chantier" className="block text-sm font-medium text-gray-700 mb-1">Type de chantier</label>
                <select
                  id="location-chantier"
                  value={rentalForm.chantier}
                  onChange={(e) => setRentalForm(prev => ({ ...prev, chantier: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option>Construction</option>
                  <option>Mining</option>
                  <option>Agriculture</option>
                  <option>Forestry</option>
                  <option>Autre</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="location-debut" className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                  <input
                    id="location-debut"
                    type="date"
                    value={rentalForm.dateDebut}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, dateDebut: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="location-fin" className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                  <input
                    id="location-fin"
                    type="date"
                    value={rentalForm.dateFin}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, dateFin: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="location-lieu" className="block text-sm font-medium text-gray-700 mb-1">Lieu de livraison</label>
                <input
                  id="location-lieu"
                  type="text"
                  placeholder="Adresse complète"
                  value={rentalForm.lieu}
                  onChange={(e) => setRentalForm(prev => ({ ...prev, lieu: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={rentalForm.transport}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, transport: e.target.checked }))}
                  />
                  <span className="text-sm">Transport souhaité</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={rentalForm.chauffeur}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, chauffeur: e.target.checked }))}
                  />
                  <span className="text-sm">Chauffeur souhaité</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={rentalForm.maintenance}
                    onChange={(e) => setRentalForm(prev => ({ ...prev, maintenance: e.target.checked }))}
                  />
                  <span className="text-sm">Maintenance sur site souhaitée</span>
                </label>
              </div>

              {rentalError && (
                <p className="text-sm text-red-600">{rentalError}</p>
              )}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowRentalForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleEnvoyerDemandeLocation}
                disabled={rentalSubmitting}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {rentalSubmitting ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 