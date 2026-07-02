import React, { useState } from 'react';
import { ClientEquipment, addClientEquipment, getProClientProfile } from '../../../utils/proApi';
import supabase from '../../../utils/supabaseClient';
import {
  Database,
  Edit,
  Eye,
  Filter,
  HardDrive,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { fetchModelSpecsFull, summarizeSpecs } from '../../../services/autoSpecsService';
import { toast } from '../../../utils/toast';
export function EquipmentTab({ equipment, userMachines, onRefresh }: { equipment: ClientEquipment[], userMachines: any[], onRefresh: () => Promise<void> }) {
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [showProEquipmentForm, setShowProEquipmentForm] = useState(false);
  const [proEquipmentForm, setProEquipmentForm] = useState({
    serial_number: '',
    equipment_type: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    location: '',
    status: 'active' as 'active' | 'maintenance' | 'inactive' | 'sold',
    total_hours: 0,
    fuel_consumption: 0,
    description: '',
    create_public_announcement: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddEquipment = () => {
    setShowAddEquipmentModal(true);
  };

  // États pour les modals et actions
  const [showViewEquipmentModal, setShowViewEquipmentModal] = useState(false);
  const [showEditEquipmentModal, setShowEditEquipmentModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<ClientEquipment | null>(null);
  
  // États pour la gestion des images d'équipement
  const [selectedEquipmentImages, setSelectedEquipmentImages] = useState<File[]>([]);
  const [equipmentImagePreviewUrls, setEquipmentImagePreviewUrls] = useState<string[]>([]);
  const [editEquipmentForm, setEditEquipmentForm] = useState({
    serial_number: '',
    equipment_type: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    location: '',
    status: 'active' as 'active' | 'maintenance' | 'inactive' | 'sold',
    total_hours: 0,
    fuel_consumption: 0,
    description: '',
    purchase_date: '',
    warranty_end: '',
    last_maintenance: '',
    next_maintenance: '',
    notes: '',
    price: 0,
    images: [] as string[]
  });

  // Fonctions de gestion des actions d'équipement
  const handleViewEquipment = (equipment: ClientEquipment) => {
    console.log('Voir équipement:', equipment);
    // Navigation vers la page de détail de la machine
    window.location.hash = `#machines/${equipment.id}`;
  };

  const handleEditEquipment = (equipment: ClientEquipment) => {
    console.log('Modifier équipement:', equipment);
    setSelectedEquipment(equipment);
    setEditEquipmentForm({
      serial_number: equipment.serial_number || '',
      equipment_type: equipment.equipment_type || '',
      brand: equipment.brand || '',
      model: equipment.model || '',
      year: equipment.year || new Date().getFullYear(),
      location: equipment.location || '',
      status: equipment.status || 'active',
      total_hours: equipment.total_hours || 0,
      fuel_consumption: equipment.fuel_consumption || 0,
      description: equipment.description || '',
      purchase_date: equipment.purchase_date || '',
      warranty_end: equipment.warranty_end || '',
      last_maintenance: equipment.last_maintenance || '',
      next_maintenance: equipment.next_maintenance || '',
      notes: equipment.notes || '',
      price: equipment.price || 0,
      images: equipment.images || []
    });
    // Réinitialiser les états d'images
    setSelectedEquipmentImages([]);
    setEquipmentImagePreviewUrls([]);
    setShowEditEquipmentModal(true);
  };

  const handleDeleteEquipment = async (equipment: ClientEquipment) => {
    console.log('Supprimer équipement:', equipment);
    if (confirm(`Êtes-vous sûr de vouloir supprimer l'équipement ${equipment.serial_number} ?`)) {
      try {
        const { error } = await supabase
          .from('machines')
          .delete()
          .eq('id', equipment.id);

        if (error) {
          console.error('Erreur lors de la suppression:', error);
          toast('Erreur lors de la suppression de l\'équipement');
        } else {
          console.log('✅ Équipement supprimé avec succès');
          toast(`Équipement ${equipment.serial_number} supprimé avec succès`);
          // Recharger les données
          onRefresh();
        }
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        toast('Erreur lors de la suppression de l\'équipement');
      }
    }
  };

  const handleUpdateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEquipment) return;

    try {
      const updatedImages = [...editEquipmentForm.images];

      // Upload des nouvelles images si elles existent
      if (selectedEquipmentImages.length > 0) {
        console.log('📸 Upload de', selectedEquipmentImages.length, 'nouvelles images...');
        
        for (const file of selectedEquipmentImages) {
          try {
            // Générer un nom de fichier unique
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `equipment-images/${fileName}`;

            // Upload vers Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('images')
              .upload(filePath, file);

            if (uploadError) {
              console.error('Erreur upload image:', uploadError);
              continue;
            }

            // Obtenir l'URL publique
            const { data: { publicUrl } } = supabase.storage
              .from('images')
              .getPublicUrl(filePath);

            if (publicUrl) {
              updatedImages.push(publicUrl);
              console.log('✅ Image uploadée:', publicUrl);
            }
          } catch (imageError) {
            console.error('Erreur lors de l\'upload d\'une image:', imageError);
          }
        }
      }

      // 1. Mettre à jour les données publiques dans machines (marque, type, description, prix, images)
      const { error } = await supabase
        .from('machines')
        .update({
          brand: editEquipmentForm.brand,
          category: editEquipmentForm.equipment_type,
          description: editEquipmentForm.description,
          price: editEquipmentForm.price,
          images: updatedImages
        })
        .eq('id', selectedEquipment.id);

      if (error) {
        console.error('Erreur lors de la mise à jour machines:', error);
        toast('Erreur lors de la mise à jour de l\'équipement');
        return;
      }

      // 2. Mettre à jour les détails Pro séparément (numéro de série, heures, etc.)
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        const { error: proError } = await supabase
          .from('pro_equipment_details')
          .upsert({
            machine_id: selectedEquipment.id,
            user_id: user.id,
            serial_number: editEquipmentForm.serial_number,
            total_hours: editEquipmentForm.total_hours,
            fuel_consumption: editEquipmentForm.fuel_consumption,
            purchase_date: editEquipmentForm.purchase_date || null,
            warranty_end: editEquipmentForm.warranty_end || null,
            last_maintenance: editEquipmentForm.last_maintenance || null,
            next_maintenance: editEquipmentForm.next_maintenance || null,
            notes: editEquipmentForm.notes || null
          });

        if (proError) {
          console.error('Erreur lors de la mise à jour pro_equipment_details:', proError);
          toast('Erreur lors de la mise à jour des détails Pro');
          return;
        }
      }

      console.log('✅ Équipement mis à jour avec succès');
      toast(`Équipement ${editEquipmentForm.serial_number} mis à jour avec succès`);
      setShowEditEquipmentModal(false);
      setSelectedEquipment(null);
      // Réinitialiser les états d'images
      setSelectedEquipmentImages([]);
      setEquipmentImagePreviewUrls([]);
      // Recharger les données
      onRefresh();
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      toast('Erreur lors de la mise à jour de l\'équipement');
    }
  };

  const handleEditInputChange = (field: string, value: any) => {
    setEditEquipmentForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Fonctions pour gérer les images d'équipement
  const handleEquipmentImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setSelectedEquipmentImages(prev => [...prev, ...newFiles]);
      
      // Créer les URLs de prévisualisation
      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setEquipmentImagePreviewUrls(prev => [...prev, e.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeEquipmentImage = (index: number) => {
    setSelectedEquipmentImages(prev => prev.filter((_, i) => i !== index));
    setEquipmentImagePreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingEquipmentImage = (index: number) => {
    setEditEquipmentForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  // États pour les modals d'annonces
  const [showViewAnnouncementModal, setShowViewAnnouncementModal] = useState(false);
  const [showEditAnnouncementModal, setShowEditAnnouncementModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any>(null);
  const [editAnnouncementForm, setEditAnnouncementForm] = useState({
    name: '',
    category: '',
    price: 0,
    location: '',
    description: '',
    images: [] as string[]
  });
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  // Fonctions de gestion des actions d'annonces
  const handleViewAnnouncement = (announcement: any) => {
    console.log('Voir annonce:', announcement);
    // Navigation vers la page de détail de la machine
    window.location.hash = `#machines/${announcement.id}`;
  };

  const handleEditAnnouncement = (announcement: any) => {
    console.log('Modifier annonce:', announcement);
    setSelectedAnnouncement(announcement);
    setEditAnnouncementForm({
      name: announcement.name || '',
      category: announcement.category || '',
      price: announcement.price || 0,
      location: announcement.location || '',
      description: announcement.description || '',
      images: announcement.images || []
    });
    setShowEditAnnouncementModal(true);
  };

  const handleShareAnnouncement = (announcement: any) => {
    console.log('Partager annonce:', announcement);
    if (navigator.share) {
      navigator.share({
        title: announcement.name,
        text: `Découvrez cet équipement: ${announcement.name}`,
        url: window.location.href
      });
    } else {
      // Fallback : copier le lien dans le presse-papiers
      navigator.clipboard.writeText(window.location.href).then(() => {
        toast('Lien copié dans le presse-papiers !');
      }).catch(() => {
        toast(`Partager l'annonce: ${announcement.name}`);
      });
    }
  };

  const handleUpdateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnnouncement) return;

    try {
      // Ici vous pouvez implémenter la mise à jour en base de données
      // Pour l'instant, on simule la mise à jour
      console.log('✅ Annonce mise à jour:', editAnnouncementForm);
      toast(`Annonce ${editAnnouncementForm.name} mise à jour avec succès`);
      setShowEditAnnouncementModal(false);
      setSelectedAnnouncement(null);
      // Recharger les données
      onRefresh();
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      toast('Erreur lors de la mise à jour de l\'annonce');
    }
  };

  const handleAnnouncementInputChange = (field: string, value: any) => {
    setEditAnnouncementForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Fonctions pour gérer les images
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setSelectedImages(prev => [...prev, ...newFiles]);
      
      // Créer les URLs de prévisualisation
      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setImagePreviewUrls(prev => [...prev, e.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index: number) => {
    setEditAnnouncementForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleProEquipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Récupérer le profil Pro pour obtenir le client_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const proProfile = await getProClientProfile();
      if (!proProfile) throw new Error('Profil Pro non trouvé');

      // Préparer les données de l'équipement
      const equipmentData = {
        ...proEquipmentForm,
        client_id: proProfile.id,
        qr_code: `MINE-${proEquipmentForm.serial_number}-${Date.now()}`,
        purchase_date: new Date().toISOString(),
        warranty_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      // Ajouter l'équipement Pro (toujours interne)
      const newEquipment = await addClientEquipment(equipmentData);
      
      if (newEquipment) {
        console.log('✅ Équipement Pro ajouté:', newEquipment);
        
        // Si l'utilisateur veut créer une annonce publique
        if (proEquipmentForm.create_public_announcement) {
          try {
            // Créer une annonce publique basée sur l'équipement Pro
            const announcementData = {
              name: `${proEquipmentForm.brand} ${proEquipmentForm.model}`,
              category: proEquipmentForm.equipment_type,
              brand: proEquipmentForm.brand,
              model: proEquipmentForm.model,
              year: proEquipmentForm.year,
              location: proEquipmentForm.location,
              price: 0, // Prix à définir par l'utilisateur
              description: `Équipement ${proEquipmentForm.brand} ${proEquipmentForm.model} - ${proEquipmentForm.year}`,
              sellerid: proProfile.id,
              status: 'active'
            };

            const { data: announcement, error: announcementError } = await supabase
              .from('machines')
              .insert(announcementData)
              .select()
              .single();

            if (announcementError) {
              console.error('Erreur création annonce:', announcementError);
              toast('Équipement Pro ajouté, mais erreur lors de la création de l\'annonce publique');
            } else {
              console.log('✅ Annonce publique créée:', announcement);
              toast('Équipement Pro ajouté et annonce publique créée avec succès !');
            }
          } catch (error) {
            console.error('Erreur création annonce:', error);
            toast('Équipement Pro ajouté, mais erreur lors de la création de l\'annonce publique');
          }
        } else {
          toast('Équipement Pro ajouté avec succès ! (interne uniquement)');
        }
        
        setShowProEquipmentForm(false);
        setShowAddEquipmentModal(false);
            setProEquipmentForm({
      serial_number: '',
      equipment_type: '',
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      location: '',
      status: 'active',
      total_hours: 0,
      fuel_consumption: 0,
      description: '',
      create_public_announcement: false
    });
        
        // Recharger les données
        await onRefresh();
        
        // Notification de succès (vous pouvez implémenter un système de notification)
        toast('Équipement Pro ajouté avec succès !');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout de l\'équipement Pro:', error);
      toast('Erreur lors de l\'ajout de l\'équipement Pro');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setProEquipmentForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Équipements</h2>
        <button 
          onClick={handleAddEquipment}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un équipement
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un équipement..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Filter className="h-4 w-4 mr-2" />
            Filtres
          </button>
        </div>
      </div>

      {/* Section Équipements Pro */}
      {equipment.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Database className="h-5 w-5 mr-2 text-orange-600" />
              Équipements Pro ({equipment.length})
            </h3>
            <p className="text-sm text-gray-500 mt-1">Équipements gérés dans le portail Pro</p>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Équipement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Localisation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Heures
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prochaine Maintenance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {equipment.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {item.brand} {item.model}
                      </div>
                      <div className="text-sm text-gray-500">
                        S/N: {item.serial_number}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.status === 'active' ? 'bg-orange-100 text-orange-800' :
                      item.status === 'maintenance' ? 'bg-orange-200 text-orange-900' :
                      'bg-orange-300 text-orange-900'
                    }`}>
                      {item.status === 'active' ? 'Actif' :
                       item.status === 'maintenance' ? 'Maintenance' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.location || 'Non spécifié'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.total_hours} h
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.next_maintenance ? new Date(item.next_maintenance).toLocaleDateString() : 'Non planifiée'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleViewEquipment(item)}
                        className="text-orange-600 hover:text-orange-900 transition-colors"
                        title="Voir détails"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleEditEquipment(item)}
                        className="text-orange-500 hover:text-orange-700 transition-colors"
                        title="Modifier"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteEquipment(item)}
                        className="text-orange-700 hover:text-orange-900 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section Annonces d'Équipements */}
      {userMachines.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <HardDrive className="h-5 w-5 mr-2 text-blue-600" />
              Mes Annonces d'Équipements ({userMachines.length})
            </h3>
            <p className="text-sm text-gray-500 mt-1">Équipements publiés sur la plateforme</p>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Équipement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Catégorie
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prix
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Localisation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date de Publication
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {userMachines.map((machine) => (
                <tr key={machine.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {machine.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {machine.brand} {machine.model} ({machine.year})
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {machine.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {machine.price?.toLocaleString()} MAD
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {machine.location || 'Non spécifié'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(machine.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleViewAnnouncement(machine)}
                        className="text-blue-600 hover:text-blue-900 transition-colors"
                        title="Voir annonce"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleEditAnnouncement(machine)}
                        className="text-blue-500 hover:text-blue-700 transition-colors"
                        title="Modifier annonce"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleShareAnnouncement(machine)}
                        className="text-blue-700 hover:text-blue-900 transition-colors"
                        title="Partager"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Message si aucun équipement */}
      {equipment.length === 0 && userMachines.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg mb-4">
            Aucun équipement disponible
          </div>
          <p className="text-gray-400">
            Vous n'avez pas encore d'équipements Pro ou d'annonces publiées
          </p>
        </div>
      )}

      {/* Modal d'ajout d'équipement */}
      {showAddEquipmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Ajouter un équipement</h3>
              <button
                onClick={() => setShowAddEquipmentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Choix du type d'équipement */}
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-4">Type d'équipement</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => { try { sessionStorage.setItem('returnToHash', '#pro'); sessionStorage.setItem('publicationContext', 'pro'); } catch { /* ignore */ } window.location.hash = '#publication'; }}
                    className="p-4 border-2 border-orange-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors text-left"
                  >
                    <div className="flex items-center">
                      <HardDrive className="h-8 w-8 text-orange-600 mr-3" />
                      <div>
                        <h5 className="font-semibold text-gray-900">Annonce d'équipement</h5>
                        <p className="text-sm text-gray-600">Publier une annonce sur la plateforme</p>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowAddEquipmentModal(false);
                      setShowProEquipmentForm(true);
                    }}
                    className="p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex items-center">
                      <Database className="h-8 w-8 text-blue-600 mr-3" />
                      <div>
                        <h5 className="font-semibold text-gray-900">Équipement Pro</h5>
                        <p className="text-sm text-gray-600">Ajouter un équipement géré dans le portail Pro</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Informations */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-2">Différence entre les types :</h5>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Annonce :</strong> Équipement à vendre/louer sur la plateforme</li>
                  <li>• <strong>Équipement Pro :</strong> Équipement géré avec suivi maintenance, diagnostics, etc.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddEquipmentModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Formulaire Équipement Pro */}
      {showProEquipmentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Ajouter un Équipement Pro</h3>
              <button
                onClick={() => setShowProEquipmentForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleProEquipmentSubmit} className="space-y-6">
              {/* Informations de base */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de série *
                  </label>
                  <input
                    type="text"
                    value={proEquipmentForm.serial_number}
                    onChange={(e) => handleInputChange('serial_number', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type d'équipement *
                  </label>
                  <select
                    value={proEquipmentForm.equipment_type}
                    onChange={(e) => handleInputChange('equipment_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    required
                  >
                    <option value="">Sélectionner...</option>
                    <option value="Pelle hydraulique">Pelle hydraulique</option>
                    <option value="Chargeur frontal">Chargeur frontal</option>
                    <option value="Bulldozer">Bulldozer</option>
                    <option value="Excavatrice">Excavatrice</option>
                    <option value="Grue">Grue</option>
                    <option value="Camion">Camion</option>
                    <option value="Foreuse">Foreuse</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Marque
                  </label>
                  <input
                    type="text"
                    value={proEquipmentForm.brand}
                    onChange={(e) => handleInputChange('brand', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="ex: CAT, Volvo, Komatsu"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modèle
                  </label>
                  <input
                    type="text"
                    value={proEquipmentForm.model}
                    onChange={(e) => handleInputChange('model', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="ex: 320D, L120H"
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                      onClick={async () => {
                        if (!proEquipmentForm.brand || !proEquipmentForm.model) {
                          toast('Renseignez la marque et le modèle');
                          return;
                        }
                        try {
                          const context = {
                            name: proEquipmentForm.equipment_type || '',
                            brand: proEquipmentForm.brand || '',
                            model: proEquipmentForm.model || '',
                            category: '',
                            type: proEquipmentForm.equipment_type || '',
                            year: proEquipmentForm.year || null,
                            price: 0,
                            condition: '',
                            total_hours: proEquipmentForm.total_hours || 0,
                            description: '',
                            location: proEquipmentForm.location || '',
                            specifications: {
                              weight: '',
                              dimensions: { length: '', width: '', height: '' },
                              power: { value: '', unit: 'kW' },
                              operatingCapacity: { value: '', unit: 'kg' },
                              workingWeight: ''
                            }
                          };
                          const { specs } = await fetchModelSpecsFull(proEquipmentForm.brand, proEquipmentForm.model, context);
                          if (!specs) { toast('Aucune spécification trouvée'); return; }
                          const summary = summarizeSpecs(specs);
                          setProEquipmentForm(prev => ({ 
                            ...prev, 
                            description: prev.description ? `${prev.description}\n\n${summary}` : summary 
                          }));
                          toast('Spécifications récupérées et ajoutées à la description');
                        } catch (e) {
                          console.error(e);
                          toast('Erreur lors de la récupération des spécifications');
                        }
                      }}
                    >
                      Remplir automatiquement (IA)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Année
                  </label>
                  <input
                    type="number"
                    value={proEquipmentForm.year}
                    onChange={(e) => handleInputChange('year', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    min="1900"
                    max={new Date().getFullYear() + 1}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Statut
                  </label>
                  <select
                    value={proEquipmentForm.status}
                    onChange={(e) => handleInputChange('status', e.target.value as 'active' | 'maintenance' | 'inactive' | 'sold')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="active">Actif</option>
                    <option value="maintenance">En maintenance</option>
                    <option value="inactive">Inactif</option>
                    <option value="sold">Vendu</option>
                  </select>
                </div>
              </div>

              {/* Informations techniques */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Localisation
                  </label>
                  <input
                    type="text"
                    value={proEquipmentForm.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="ex: Site principal, Zone d'extraction"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Heures totales
                  </label>
                  <input
                    type="number"
                    value={proEquipmentForm.total_hours}
                    onChange={(e) => handleInputChange('total_hours', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    min="0"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Consommation carburant (L/h)
                  </label>
                  <input
                    type="number"
                    value={proEquipmentForm.fuel_consumption}
                    onChange={(e) => handleInputChange('fuel_consumption', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    min="0"
                    step="0.1"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Option de création d'annonce publique */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="create_public_announcement"
                    checked={proEquipmentForm.create_public_announcement}
                    onChange={(e) => handleInputChange('create_public_announcement', e.target.checked)}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <label htmlFor="create_public_announcement" className="ml-2 text-sm text-gray-700">
                    Créer également une annonce publique pour cet équipement
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Si coché, une annonce sera créée dans "Mes Annonces" avec les informations de base. 
                  Vous pourrez ensuite la modifier pour ajouter le prix et les images.
                </p>
              </div>

              {/* Boutons d'action */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowProEquipmentForm(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Ajout en cours...
                    </>
                  ) : (
                    'Ajouter l\'équipement'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de vue détaillée d'équipement */}
      {showViewEquipmentModal && selectedEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Détails de l'équipement</h3>
              <button
                onClick={() => setShowViewEquipmentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Informations principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Informations générales</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Numéro de série</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.serial_number}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Type d'équipement</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.equipment_type}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Marque</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.brand || 'Non spécifié'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Modèle</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.model || 'Non spécifié'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Statut et localisation</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Statut</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedEquipment.status === 'active' ? 'bg-green-100 text-green-800' :
                        selectedEquipment.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                        selectedEquipment.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {selectedEquipment.status === 'active' ? 'Actif' :
                         selectedEquipment.status === 'maintenance' ? 'En maintenance' :
                         selectedEquipment.status === 'inactive' ? 'Inactif' : 'Vendu'}
                      </span>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Localisation</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.location || 'Non spécifié'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Année</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.year || 'Non spécifié'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Heures totales</label>
                      <p className="text-sm text-gray-900">{selectedEquipment.total_hours || 0} heures</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowViewEquipmentModal(false);
                    handleEditEquipment(selectedEquipment);
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Modifier
                </button>
                <button
                  onClick={() => setShowViewEquipmentModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition d'équipement */}
      {showEditEquipmentModal && selectedEquipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Modifier l'équipement</h3>
              <button
                onClick={() => setShowEditEquipmentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateEquipment} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Numéro de série */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de série *
                  </label>
                  <input
                    type="text"
                    value={editEquipmentForm.serial_number}
                    onChange={(e) => handleEditInputChange('serial_number', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>

                {/* Type d'équipement */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type d'équipement *
                  </label>
                  <input
                    type="text"
                    value={editEquipmentForm.equipment_type}
                    onChange={(e) => handleEditInputChange('equipment_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>

                {/* Marque */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Marque
                  </label>
                  <input
                    type="text"
                    value={editEquipmentForm.brand}
                    onChange={(e) => handleEditInputChange('brand', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Modèle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modèle
                  </label>
                  <input
                    type="text"
                    value={editEquipmentForm.model}
                    onChange={(e) => handleEditInputChange('model', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                      onClick={async () => {
                        if (!editEquipmentForm.brand || !editEquipmentForm.model) {
                          toast('Renseignez la marque et le modèle');
                          return;
                        }
                        try {
                          const { specs } = await fetchModelSpecsFull(editEquipmentForm.brand, editEquipmentForm.model, { name: editEquipmentForm.equipment_type || '', brand: editEquipmentForm.brand || '', model: editEquipmentForm.model || '', year: editEquipmentForm.year || null, total_hours: editEquipmentForm.total_hours || 0, location: editEquipmentForm.location || '', specifications: { weight: '', dimensions: { length: '', width: '', height: '' }, power: { value: '', unit: 'kW' }, operatingCapacity: { value: '', unit: 'kg' }, workingWeight: '' } });
                          if (!specs) { toast('Aucune spécification trouvée'); return; }
                          const parts: string[] = [];
                          const d = specs.dimensions;
                          if (d) parts.push(`Dimensions: ${d.length_mm ?? '-'} x ${d.width_mm ?? '-'} x ${d.height_mm ?? '-'} mm`);
                          if (specs.weight_kg) parts.push(`Poids: ${specs.weight_kg} kg`);
                          const pkw = specs.engine?.power_kw; const php = specs.engine?.power_hp;
                          if (pkw || php) parts.push(`Puissance: ${pkw ?? ''}${pkw ? ' kW' : ''}${pkw && php ? ' / ' : ''}${php ?? ''}${php ? ' HP' : ''}`);
                          const summary = parts.join(' | ');
                          setEditEquipmentForm(prev => ({ ...prev, description: prev.description ? `${prev.description}\n${summary}` : summary }));
                          toast('Spécifications récupérées et ajoutées à la description');
                        } catch (e) {
                          console.error(e);
                          toast('Erreur lors de la récupération des spécifications');
                        }
                      }}
                    >
                      Remplir automatiquement (IA)
                    </button>
                  </div>
                </div>

                {/* Année */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Année
                  </label>
                  <input
                    type="number"
                    value={editEquipmentForm.year}
                    onChange={(e) => handleEditInputChange('year', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Localisation */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Localisation
                  </label>
                  <input
                    type="text"
                    value={editEquipmentForm.location}
                    onChange={(e) => handleEditInputChange('location', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Statut */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Statut
                  </label>
                  <select
                    value={editEquipmentForm.status}
                    onChange={(e) => handleEditInputChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="active">Actif</option>
                    <option value="maintenance">En maintenance</option>
                    <option value="inactive">Inactif</option>
                    <option value="sold">Vendu</option>
                  </select>
                </div>

                {/* Heures totales */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Heures totales
                  </label>
                  <input
                    type="number"
                    value={editEquipmentForm.total_hours}
                    onChange={(e) => handleEditInputChange('total_hours', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Consommation de carburant */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Consommation carburant (L/h)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editEquipmentForm.fuel_consumption}
                    onChange={(e) => handleEditInputChange('fuel_consumption', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Prix */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prix (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editEquipmentForm.price}
                    onChange={(e) => handleEditInputChange('price', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Images de l'équipement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Images de l'équipement
                </label>
                
                {/* Images existantes */}
                {editEquipmentForm.images.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-600 mb-2">Images existantes</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {editEquipmentForm.images.map((image, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={image}
                            alt={`Image ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeExistingEquipmentImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer cette image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nouvelles images */}
                {equipmentImagePreviewUrls.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-600 mb-2">Nouvelles images</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {equipmentImagePreviewUrls.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Nouvelle image ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeEquipmentImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer cette image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bouton d'ajout d'images */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-orange-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleEquipmentImageSelect}
                    className="hidden"
                    id="equipment-image-upload"
                  />
                  <label
                    htmlFor="equipment-image-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="text-sm text-gray-600">
                      Cliquez pour ajouter des images
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      JPG, PNG, GIF jusqu'à 5MB par image
                    </span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditEquipmentModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Mettre à jour
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de vue détaillée d'annonce */}
      {showViewAnnouncementModal && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Détails de l'annonce</h3>
              <button
                onClick={() => setShowViewAnnouncementModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Informations principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Informations générales</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Nom de l'équipement</label>
                      <p className="text-sm text-gray-900">{selectedAnnouncement.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Catégorie</label>
                      <p className="text-sm text-gray-900">{selectedAnnouncement.category}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Prix</label>
                      <p className="text-sm text-gray-900 font-semibold">{selectedAnnouncement.price} MAD</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Localisation</label>
                      <p className="text-sm text-gray-900">{selectedAnnouncement.location || 'Non spécifié'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Détails supplémentaires</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date de publication</label>
                      <p className="text-sm text-gray-900">{selectedAnnouncement.publication_date || 'Non spécifié'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Statut</label>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Vues</label>
                      <p className="text-sm text-gray-900">{selectedAnnouncement.views || 0} vues</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Images */}
              {selectedAnnouncement.images && selectedAnnouncement.images.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Images de l'équipement</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {selectedAnnouncement.images.map((image: string, index: number) => (
                      <div key={index} className="relative">
                        <img
                          src={image}
                          alt={`Image ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-gray-200 hover:scale-105 transition-transform cursor-pointer"
                          onClick={() => window.open(image, '_blank')}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedAnnouncement.description && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Description</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {selectedAnnouncement.description}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowViewAnnouncementModal(false);
                    handleEditAnnouncement(selectedAnnouncement);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleShareAnnouncement(selectedAnnouncement)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Partager
                </button>
                <button
                  onClick={() => setShowViewAnnouncementModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition d'annonce */}
      {showEditAnnouncementModal && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Modifier l'annonce</h3>
              <button
                onClick={() => setShowEditAnnouncementModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateAnnouncement} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nom de l'équipement */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de l'équipement *
                  </label>
                  <input
                    type="text"
                    value={editAnnouncementForm.name}
                    onChange={(e) => handleAnnouncementInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Catégorie */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Catégorie *
                  </label>
                  <select
                    value={editAnnouncementForm.category}
                    onChange={(e) => handleAnnouncementInputChange('category', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Sélectionner une catégorie</option>
                    <option value="Terrassement">Terrassement</option>
                    <option value="Maintenance & Levage">Maintenance & Levage</option>
                    <option value="Voirie">Voirie</option>
                    <option value="Transport">Transport</option>
                    <option value="Pelle hydraulique">Pelle hydraulique</option>
                  </select>
                </div>

                {/* Prix */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prix (MAD) *
                  </label>
                  <input
                    type="number"
                    value={editAnnouncementForm.price}
                    onChange={(e) => handleAnnouncementInputChange('price', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    min="0"
                  />
                </div>

                {/* Localisation */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Localisation
                  </label>
                  <input
                    type="text"
                    value={editAnnouncementForm.location}
                    onChange={(e) => handleAnnouncementInputChange('location', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ex: Casablanca, Maroc"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={editAnnouncementForm.description}
                  onChange={(e) => handleAnnouncementInputChange('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Description détaillée de l'équipement..."
                />
              </div>

              {/* Gestion des images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Images de l'équipement
                </label>
                
                {/* Images existantes */}
                {editAnnouncementForm.images.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-600 mb-2">Images existantes</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {editAnnouncementForm.images.map((image, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={image}
                            alt={`Image ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeExistingImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer cette image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nouvelles images */}
                {imagePreviewUrls.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-600 mb-2">Nouvelles images</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {imagePreviewUrls.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Nouvelle image ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer cette image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bouton d'ajout d'images */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="text-sm text-gray-600">
                      Cliquez pour ajouter des images
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      JPG, PNG, GIF jusqu'à 5MB par image
                    </span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditAnnouncementModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Mettre à jour
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
