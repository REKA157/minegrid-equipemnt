import React, { useEffect, useState } from 'react';
import { ChevronRight, MapPin, Star, Calendar, Scale, PenTool as Tool } from 'lucide-react';
import supabase from '../utils/supabaseClient';
import {
  MACHINE_LIST_COLUMNS,
  PROFILE_PUBLIC_LIST_COLUMNS,
  SELLER_MACHINES_MAX_ROWS,
} from '../constants/machineQueryFields';
import type { Machine } from '../types';
import Price from '../components/Price';
import { useCurrencyStore } from '../stores/currencyStore';

interface SellerMachinesProps {
  sellerId: string;
}

export default function SellerMachines({ sellerId }: SellerMachinesProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { currentCurrency } = useCurrencyStore();

  useEffect(() => {
    const fetchSellerMachines = async () => {
      try {
        console.log("🔍 Récupération des machines pour le vendeur:", sellerId);
        
        // Récupérer les informations du vendeur
        const { data: sellerData, error: sellerError } = await supabase
          .from('profiles')
          .select(PROFILE_PUBLIC_LIST_COLUMNS)
          .eq('id', sellerId)
          .single();

        if (sellerError) {
          console.error('Erreur chargement vendeur:', sellerError);
          return;
        }

        console.log("👤 Informations du vendeur récupérées:", sellerData);

        if (sellerData) {
          setSellerInfo({
            id: sellerData.id,
            name: `${sellerData.firstname || ''} ${sellerData.lastname || ''}`.trim(),
            rating: 4.5,
            location: (sellerData as { location?: string }).location || 'Localisation non spécifiée'
          });

          // Récupérer les machines du vendeur. La colonne réelle est 'sellerid'
          // (et/ou 'seller_id') — PAS 'sellerId' (PostgREST est sensible à la casse,
          // l'ancien filtre visait une colonne inexistante -> 0 machine).
          const { data: machinesData, error: machinesError } = await supabase
            .from('machines')
            .select(MACHINE_LIST_COLUMNS)
            .or(`sellerid.eq.${sellerId},seller_id.eq.${sellerId}`)
            .order('created_at', { ascending: false })
            .limit(SELLER_MACHINES_MAX_ROWS);

          if (machinesError) {
            console.error('Erreur chargement machines:', machinesError);
          } else {
            console.log("📊 Machines récupérées:", machinesData);
            console.log("📊 Nombre de machines:", machinesData?.length || 0);
            setMachines(machinesData || []);
          }
        }
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setLoading(false);
      }
    };

    if (sellerId) {
      fetchSellerMachines();
    }
  }, [sellerId]);

  if (loading) {
    return (
      <div className="text-center py-24 text-gray-500 text-lg font-semibold">
        Chargement des machines...
      </div>
    );
  }

  if (!sellerInfo) {
    return (
      <div className="text-center py-24 text-gray-500 text-lg font-semibold">
        Vendeur non trouvé
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Fil d'Ariane */}
      <div className="flex items-center text-sm text-gray-500 mb-8">
        <a href="#" className="hover:text-primary-600">Accueil</a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <a href="#machines" className="hover:text-primary-600">Machines</a>
        <ChevronRight className="h-4 w-4 mx-2" />
        <span className="text-gray-900">{sellerInfo.name}</span>
      </div>

      {/* En-tête du vendeur */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {sellerInfo.name}
            </h1>
            <div className="flex items-center text-gray-500">
              <MapPin className="h-4 w-4 mr-1" />
              <span>{sellerInfo.location}</span>
            </div>
            {/* Bloc « note X/5 » retiré : la valeur était codée en dur (4,5) pour
                TOUS les vendeurs (fausse note). À rebrancher sur une vraie source
                (avis / trust_score) le jour où elle existera. */}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary-600">
              {machines.length}
            </div>
            <div className="text-sm text-gray-500">
              machine{machines.length > 1 ? 's' : ''} disponible{machines.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Liste des machines */}
      {machines.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg mb-4">
            Aucune machine disponible pour le moment
          </div>
          <p className="text-gray-400">
            Ce vendeur n'a pas encore publié d'annonces
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Annonces de {sellerInfo.name}</h3>
            <div className="text-sm text-gray-500">
              {machines.length} machine{machines.length > 1 ? 's' : ''} disponible{machines.length > 1 ? 's' : ''}
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {machines.map((machine) => (
                  <tr key={machine.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{machine.name}</div>
                      <div className="text-sm text-gray-500">{machine.brand}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <Price amount={machine.price || 0} />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{machine.category}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <a href={`#machines/${machine.id}`} className="text-primary-600 hover:text-primary-900">
                        Voir
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 