import React, { useState } from 'react';
import { Calendar, MapPin, Star, PenTool as Tool, Truck, Scale, Ruler, Phone, Mail, FileText, ChevronRight, ChevronLeft, Heart, Share2, Download } from 'lucide-react';
import type { Equipment } from '../types';

// Données de démonstration
const equipmentData: Equipment = {
  id: '1',
  name: 'Finisseur VÖGELE SUPER 1800-3i',
  brand: 'VÖGELE',
  model: 'SUPER 1800-3i',
  category: 'Matériel de Voirie',
  year: 2023,
  price: 450000,
  condition: 'new',
  description: `Le finisseur VÖGELE SUPER 1800-3i représente la nouvelle génération de finisseurs sur pneus. 
  Équipé des dernières technologies, il offre une performance exceptionnelle pour tous types de chantiers routiers.
  
  Caractéristiques principales :
  - Système de conduite ErgoPlus 3
  - Table extensible AB 500 TV
  - Système d'alimentation optimisé
  - Excellent rapport qualité-prix
  
  Applications :
  - Construction d'autoroutes
  - Routes nationales et départementales
  - Pistes d'aéroport
  - Parkings et zones industrielles`,
  specifications: {
    weight: 19500,
    dimensions: '6.1m x 2.55m x 3.0m',
    power: {
      value: 127,
      unit: 'kW'
    },
    operatingCapacity: 18500,
    workingWeight: 19500
  },
  images: [
    'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1563185628-6422a5788352?auto=format&fit=crop&w=800&q=80'
  ],
  seller: {
    id: 's1',
    name: 'Minegrid Equipment Pro',
    rating: 4.8,
    location: 'Casablanca'
  }
};

export default function EquipmentDetail() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showContactForm, setShowContactForm] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const equipmentId = equipmentData.id;

  const toggleFavorite = () => {
    const stored = window.localStorage.getItem('favorite_machine_ids');
    let ids: string[] = [];
    try {
      ids = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(ids)) ids = [];
    } catch {
      ids = [];
    }
    const nextIds = isFavorite ? ids.filter((id) => id !== equipmentId) : [...new Set([...ids, equipmentId])];
    window.localStorage.setItem('favorite_machine_ids', JSON.stringify(nextIds));
    setIsFavorite(!isFavorite);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#machines/${equipmentId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: equipmentData.name,
          text: equipmentData.model,
          url: shareUrl,
        });
        setShareFeedback('Lien partagé');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback('Lien copié');
      } else {
        window.prompt('Copiez ce lien :', shareUrl);
        setShareFeedback('Lien prêt à copier');
      }
    } catch {
      setShareFeedback('Partage annulé');
    } finally {
      window.setTimeout(() => setShareFeedback(null), 2000);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === equipmentData.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? equipmentData.images.length - 1 : prev - 1
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Fil d'Ariane */}
      <div className="flex items-center text-sm text-gray-500 mb-8">
        <a href="#" className="hover:text-primary-600">Accueil</a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <a href="#machines" className="hover:text-primary-600">Équipements</a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <a href="#machines" className="hover:text-primary-600">
          {equipmentData.category}
        </a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-gray-900">{equipmentData.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Galerie d'images */}
        <div className="lg:col-span-2">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={equipmentData.images[currentImageIndex]}
              alt={equipmentData.name}
              className="w-full h-[500px] object-cover"
            />
            
            <button
              onClick={prevImage}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full hover:bg-white"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            
            <button
              onClick={nextImage}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full hover:bg-white"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
            {equipmentData.images.map((_: string, index: number) => (

                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`w-2 h-2 rounded-full ${
                    index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-4">
          {equipmentData.images.map((image: string, index: number) => (

              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`relative rounded-lg overflow-hidden ${
                  index === currentImageIndex ? 'ring-2 ring-primary-600' : ''
                }`}
              >
                <img
                  src={image}
                  alt={`Vue ${index + 1}`}
                  className="w-full h-24 object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Informations principales et actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{equipmentData.name}</h1>
                <p className="text-lg text-gray-600">{equipmentData.brand} {equipmentData.model}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={toggleFavorite}
                  className={`p-2 transition-colors ${isFavorite ? 'text-red-500' : 'text-gray-500 hover:text-primary-600'}`}
                  title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Heart className="h-6 w-6" />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
                  title="Partager l'annonce"
                  aria-label="Partager l'annonce"
                >
                  <Share2 className="h-6 w-6" />
                </button>
              </div>
            </div>
            {shareFeedback && (
              <p className="mb-3 text-sm text-green-600">{shareFeedback}</p>
            )}

            <div className="text-3xl font-bold text-primary-600 mb-6">
            {equipmentData.price ? equipmentData.price.toLocaleString() + ' €' : 'Non renseigné'}

            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex items-center text-gray-600">
                <Calendar className="h-5 w-5 mr-2" />
                <span>{equipmentData.year}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <MapPin className="h-5 w-5 mr-2" />
                <span>{equipmentData.seller.location}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Tool className="h-5 w-5 mr-2" />
                <span>{equipmentData.specifications.power.value} {equipmentData.specifications.power.unit}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Scale className="h-5 w-5 mr-2" />
                <span>{equipmentData.specifications.weight.toLocaleString()} kg</span>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => setShowContactForm(true)}
                className="w-full bg-primary-600 text-white px-6 py-3 rounded-md hover:bg-primary-700 transition-colors flex items-center justify-center"
              >
                <Mail className="h-5 w-5 mr-2" />
                Contacter le vendeur
              </button>

              <button className="w-full border border-primary-600 text-primary-600 px-6 py-3 rounded-md hover:bg-primary-50 transition-colors flex items-center justify-center">
                <Phone className="h-5 w-5 mr-2" />
                Afficher le numéro
              </button>

              <button className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center">
                <Download className="h-5 w-5 mr-2" />
                Télécharger la fiche technique
              </button>
            </div>
          </div>

          {/* Information vendeur */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{equipmentData.seller.name}</h3>
                <div className="flex items-center mt-1">
                  <Star className="h-5 w-5 text-yellow-400" />
                  <span className="ml-1 text-gray-600">{equipmentData.seller.rating}/5</span>
                </div>
              </div>
              <img
                src="https://via.placeholder.com/60"
                alt="Logo vendeur"
                className="w-15 h-15 rounded-full"
              />
            </div>
            <button className="w-full border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50">
              Voir tous ses équipements
            </button>
          </div>
        </div>
      </div>

      {/* Description et spécifications détaillées */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Description</h2>
            <div className="prose prose-lg max-w-none">
            {equipmentData.description && equipmentData.description.split('\n').map((paragraph: string, index: number) => (
  <p key={index}>{paragraph}</p>
))}


            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Spécifications techniques</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Dimensions et poids</h3>
                <ul className="space-y-2">
                  <li className="flex justify-between">
                    <span className="text-gray-600">Dimensions</span>
                    <span className="font-medium">{equipmentData.specifications.dimensions}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-600">Poids en ordre de marche</span>
                    <span className="font-medium">{equipmentData.specifications.workingWeight.toLocaleString()} kg</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-600">Capacité opérationnelle</span>
                    <span className="font-medium">{equipmentData.specifications.operatingCapacity.toLocaleString()} kg</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Motorisation</h3>
                <ul className="space-y-2">
                  <li className="flex justify-between">
                    <span className="text-gray-600">Puissance</span>
                    <span className="font-medium">{equipmentData.specifications.power.value} {equipmentData.specifications.power.unit}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Formulaire de contact */}
        <div className={`lg:col-span-1 ${showContactForm ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white rounded-lg shadow-md p-6 sticky top-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Contacter le vendeur</h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message
                </label>
                <textarea
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  defaultValue={`Bonjour,\nJe suis intéressé par votre ${equipmentData.name}.\nPouvez-vous me donner plus d'informations ?\nMerci.`}
                />
              </div>
              <button
                type="submit"
                className="w-full bg-primary-600 text-white px-6 py-3 rounded-md hover:bg-primary-700 transition-colors"
              >
                Envoyer le message
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}