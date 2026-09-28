import React from 'react';
import { ChevronRight, Star, Filter, ArrowDownAZ } from 'lucide-react';

interface Machine {
  id: string;
  model: string;
  image: string;
  specs: {
    power: {
      value: number;
      unit: string;
    };
    operatingCapacity: number;
    weight: number;
  };
}

// Données d'exemple - Dans une application réelle, ces données viendraient d'une API ou d'une base de données
const machines: Record<string, Machine[]> = {
  'chargeuses/compactes': [
    {
      id: '216B3',
      model: '216B3',
      image: 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
      specs: {
        power: { value: 38, unit: 'kW' },
        operatingCapacity: 635,
        weight: 2581
      }
    },
    {
      id: '226B3',
      model: '226B3',
      image: 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
      specs: {
        power: { value: 45.5, unit: 'kW' },
        operatingCapacity: 680,
        weight: 2641
      }
    },
    {
      id: '232D3',
      model: '232D3',
      image: 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
      specs: {
        power: { value: 44.9, unit: 'kW' },
        operatingCapacity: 865,
        weight: 2955
      }
    },
    {
      id: '236D3',
      model: '236D3',
      image: 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
      specs: {
        power: { value: 55.4, unit: 'kW' },
        operatingCapacity: 820,
        weight: 2979
      }
    }
  ]
};

const categoryDescriptions: Record<string, string> = {
  'chargeuses/compactes': 'Les chargeuses compactes rigides et les chargeuses à chaînes compactes proposent des améliorations axées sur les besoins des clients, associées à nos toutes dernières fonctionnalités et innovations à la pointe de l\'industrie.'
};

const categoryTitles: Record<string, string> = {
  'chargeuses/compactes': 'CHARGEUSES COMPACTES'
};

interface SubcategoryPageProps {
  subcategoryId: string;
}

export default function SubcategoryPage({ subcategoryId }: SubcategoryPageProps) {
  const subcategoryMachines = machines[subcategoryId] || [];
  const description = categoryDescriptions[subcategoryId] || '';
  const title = categoryTitles[subcategoryId] || subcategoryId;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Fil d'Ariane */}
      <nav className="flex mb-8" aria-label="Fil d'Ariane">
        <ol className="flex items-center space-x-2">
          <li>
            <a href="#" className="text-gray-500 hover:text-primary-600">Accueil</a>
          </li>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <li>
            <a href="#machines" className="text-gray-500 hover:text-primary-600">Machines</a>
          </li>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <li>
            <span className="text-gray-900 font-medium">{title}</span>
          </li>
        </ol>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar avec filtres - Réduite en largeur et déplacée vers la gauche */}
        <div className="lg:w-1/5 lg:-ml-4">
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                <Filter className="h-4 w-4 mr-2" />
                Filtres
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Puissance
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Min kW"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                    />
                    <input
                      type="number"
                      placeholder="Max kW"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacité
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Min kg"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                    />
                    <input
                      type="number"
                      placeholder="Max kg"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    État
                  </label>
                  <select className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md">
                    <option>Tous</option>
                    <option>Neuf</option>
                    <option>Occasion</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Disponibilité
                  </label>
                  <select className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md">
                    <option>Toutes</option>
                    <option>En stock</option>
                    <option>Sur commande</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                <ArrowDownAZ className="h-4 w-4 mr-2" />
                Trier par
              </h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input type="radio" name="sort" className="text-primary-600" />
                  <span className="ml-2 text-sm">Prix croissant</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" name="sort" className="text-primary-600" />
                  <span className="ml-2 text-sm">Prix décroissant</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" name="sort" className="text-primary-600" />
                  <span className="ml-2 text-sm">Puissance</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" name="sort" className="text-primary-600" />
                  <span className="ml-2 text-sm">Capacité</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Contenu principal - Ajusté pour compenser la sidebar plus petite */}
        <div className="lg:w-4/5">
          {/* En-tête */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{title}</h1>
            <p className="text-gray-600">{description}</p>
          </div>

          {/* Barre de recherche */}
          <div className="bg-white rounded-lg shadow-sm mb-6 p-4">
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Rechercher un modèle..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
              <span className="text-sm text-gray-600 self-center">
                {subcategoryMachines.length} résultats
              </span>
            </div>
          </div>

          {/* Grille de produits */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {subcategoryMachines.map((machine) => (
              <div key={machine.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative">
                  <img
                    src={machine.image}
                    alt={`${machine.model}`}
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute top-2 right-2 bg-primary-600 text-white px-2 py-1 rounded text-sm">
                    Nouveau
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{machine.model}</h3>
                    <div className="flex items-center mt-1">
                      <Star className="h-4 w-4 text-yellow-400" />
                      <Star className="h-4 w-4 text-yellow-400" />
                      <Star className="h-4 w-4 text-yellow-400" />
                      <Star className="h-4 w-4 text-yellow-400" />
                      <Star className="h-4 w-4 text-yellow-400" />
                      <span className="ml-1 text-sm text-gray-600">(12 avis)</span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Puissance brute</span>
                      <span className="font-medium">{machine.specs.power.value} {machine.specs.power.unit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Capacité nominale</span>
                      <span className="font-medium">{machine.specs.operatingCapacity} kg</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Poids en ordre de marche</span>
                      <span className="font-medium">{machine.specs.weight} kg</span>
                    </div>
                  </div>

                  <a
                    href={`#machines/${machine.id}`}
                    className="block w-full bg-primary-600 text-white text-center px-4 py-2 rounded-md hover:bg-primary-700 transition-colors"
                  >
                    Explorer
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}