import React, { useState } from 'react';
import { Star, Zap, Shield, Copy, CreditCard, Info } from 'lucide-react';
import { BoostOptions } from '../types';
import supabase from '../utils/supabaseClient';
import { submitContactMessage } from '../utils/api/contact';
import { toast } from '../utils/toast';

interface PremiumServicesProps {
  machineId: string;
  machineName: string;
  currentPrice: number;
  isOwner: boolean;
  className?: string;
}

const boostOptions: BoostOptions[] = [
  {
    id: 'boost-7',
    name: 'Boost 7 jours',
    description: 'Mise en avant pendant 7 jours',
    price: 29,
    duration: 7,
    features: [
      'Position prioritaire dans les résultats',
      'Badge "Boosté" visible',
      '+50% de visibilité',
      'Notifications push aux acheteurs'
    ]
  },
  {
    id: 'boost-30',
    name: 'Boost 30 jours',
    description: 'Mise en avant pendant 30 jours',
    price: 89,
    duration: 30,
    features: [
      'Position prioritaire dans les résultats',
      'Badge "Boosté" visible',
      '+100% de visibilité',
      'Notifications push aux acheteurs',
      'Emailing ciblé'
    ]
  },
  {
    id: 'highlight',
    name: 'Mise en avant Premium',
    description: 'Position en tête de liste',
    price: 149,
    duration: 14,
    features: [
      'Position en première page',
      'Badge "Mis en avant" doré',
      '+200% de visibilité',
      'Campagne emailing',
      'Support prioritaire'
    ]
  }
];

export default function PremiumServices({ 
  machineId, 
  machineName, 
  currentPrice, 
  isOwner,
  className = "" 
}: PremiumServicesProps) {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showCertificationForm, setShowCertificationForm] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleBoostPurchase = async (boostId: string) => {
    const option = boostOptions.find((o) => o.id === boostId);
    if (!option) return;
    setBusyAction(boostId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Utilisateur non connecté');

      await submitContactMessage({
        name:
          (user.user_metadata?.full_name as string | undefined) ||
          [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') ||
          'Utilisateur Minegrid',
        email: user.email,
        company: (user.user_metadata?.company as string | undefined) || null,
        subject: `Demande de boost premium (${option.name})`,
        service: 'premium_boost',
        message: [
          `Machine ID: ${machineId}`,
          `Machine: ${machineName}`,
          `Service: ${option.name}`,
          `Prix annonce: ${currentPrice} EUR`,
          `Prix boost: ${option.price} EUR`,
        ].join('\n'),
      });

      toast('Demande de boost envoyée. Notre équipe vous contactera rapidement.');
      window.location.hash = '#priority-support';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      toast(`Impossible d'envoyer la demande de boost: ${message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCertificationRequest = async () => {
    setBusyAction('certification');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Utilisateur non connecté');

      await submitContactMessage({
        name:
          (user.user_metadata?.full_name as string | undefined) ||
          [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') ||
          'Utilisateur Minegrid',
        email: user.email,
        company: (user.user_metadata?.company as string | undefined) || null,
        subject: 'Demande de certification machine',
        service: 'premium_certification',
        message: `Machine ID: ${machineId}\nMachine: ${machineName}\nPrix annonce: ${currentPrice} EUR`,
      });

      toast('Demande de certification envoyée. Un expert vous contactera sous 24h.');
      setShowCertificationForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      toast(`Impossible d'envoyer la demande: ${message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyMachine = async () => {
    setBusyAction('copy');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const { data: source, error: sourceError } = await supabase
        .from('machines')
        .select('*')
        .eq('id', machineId)
        .single();
      if (sourceError || !source) throw sourceError || new Error('Machine introuvable');

      const duplicate = {
        ...source,
        id: undefined,
        created_at: undefined,
        updated_at: undefined,
        deleted_at: undefined,
        name: `${source.name || machineName} (copie)`,
        sellerid: user.id,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('machines')
        .insert(duplicate)
        .select('id')
        .single();
      if (insertError || !inserted) throw insertError || new Error('Duplication impossible');

      toast('Annonce copiée avec succès.');
      window.location.hash = `#machines/${inserted.id}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      toast(`Impossible de copier l'annonce: ${message}`);
    } finally {
      setBusyAction(null);
    }
  };

  if (!isOwner) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="flex items-center mb-4">
          <Star className="h-6 w-6 text-yellow-600 mr-2" />
          <h3 className="text-lg font-semibold">Services Premium</h3>
        </div>
        <p className="text-gray-500 text-sm">
          Connectez-vous pour accéder aux services premium
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Star className="h-6 w-6 text-yellow-600 mr-2" />
          <h3 className="text-lg font-semibold">Services Premium</h3>
        </div>
        <div className="text-sm text-gray-500">
          Machine: {machineName}
        </div>
      </div>

      {/* Options de boost */}
      <div className="mb-8">
        <h4 className="text-md font-medium text-gray-700 mb-4 flex items-center">
          <Zap className="h-4 w-4 mr-2 text-yellow-600" />
          Booster votre annonce
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {boostOptions.map((option) => (
            <div
              key={option.id}
                              className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                selectedService === option.id
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedService(option.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h5 className="font-semibold text-gray-900">{option.name}</h5>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
                <div className="text-lg font-bold text-orange-600">
                  {option.price}€
                </div>
              </div>
              
              <ul className="text-xs text-gray-600 space-y-1 mb-3">
                {option.features.map((feature, index) => (
                  <li key={index} className="flex items-center">
                    <div className="w-1 h-1 bg-green-500 rounded-full mr-2"></div>
                    {feature}
                  </li>
                ))}
              </ul>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleBoostPurchase(option.id);
                }}
                disabled={busyAction === option.id}
                className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors text-sm"
              >
                <CreditCard className="h-4 w-4 inline mr-1" />
                {busyAction === option.id ? 'Traitement...' : 'Acheter'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Certification */}
      <div className="mb-8">
        <h4 className="text-md font-medium text-gray-700 mb-4 flex items-center">
          <Shield className="h-4 w-4 mr-2 text-green-600" />
          Certification "Machine Contrôlée"
        </h4>
        
        <div className="bg-green-50 rounded-lg p-4 mb-4">
          <div className="flex items-start">
            <Shield className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
            <div>
              <h5 className="font-semibold text-green-900 mb-1">
                Badge de confiance
              </h5>
              <p className="text-sm text-green-700 mb-3">
                Un expert partenaire inspecte votre machine et délivre un certificat de conformité. 
                +20% de conversion en moyenne.
              </p>
              <div className="text-sm text-green-600">
                <strong>Prix:</strong> 199€ • <strong>Délai:</strong> 3-5 jours
              </div>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => setShowCertificationForm(true)}
          disabled={busyAction === 'certification'}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 transition-colors"
        >
          <Shield className="h-4 w-4 inline mr-2" />
          {busyAction === 'certification' ? 'Envoi...' : 'Demander une certification'}
        </button>
      </div>

      {/* Copier annonce */}
      <div className="mb-6">
        <h4 className="text-md font-medium text-gray-700 mb-4 flex items-center">
          <Copy className="h-4 w-4 mr-2 text-purple-600" />
          Gestion rapide
        </h4>
        
        <button
          onClick={() => void handleCopyMachine()}
          disabled={busyAction === 'copy'}
          className="w-full bg-purple-600 text-white py-3 px-4 rounded-md hover:bg-purple-700 transition-colors"
        >
          <Copy className="h-4 w-4 inline mr-2" />
          {busyAction === 'copy' ? 'Copie en cours...' : 'Copier cette annonce'}
        </button>
      </div>

      {/* Note d'information */}
      <div className="p-3 bg-blue-50 rounded-lg">
        <div className="flex items-start">
          <Info className="h-4 w-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Services premium</p>
            <p className="text-xs mt-1">
              Ces services améliorent la visibilité et la crédibilité de votre annonce, 
              augmentant vos chances de vente.
            </p>
          </div>
        </div>
      </div>

      {/* Modal certification (simplifié) */}
      {showCertificationForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Demande de certification</h3>
            <p className="text-sm text-gray-600 mb-4">
              Un expert partenaire vous contactera sous 24h pour organiser l'inspection.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCertificationForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleCertificationRequest()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 