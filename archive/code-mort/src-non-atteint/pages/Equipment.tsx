import React, { useState } from 'react';
import { Filter, SortAsc, Search, MapPin, Star, ArrowDownAZ, Tag as PriceTag, Calendar, ChevronRight } from 'lucide-react';
import EquipmentCard from '../components/EquipmentCard';
import { categories, iconMap } from '../data/categories';
import type { Equipment as EquipmentType } from '../types';

interface EquipmentProps {
  category?: string | null;
  mode?: 'browse' | 'sell';
}

export default function Equipment({ category, mode = 'browse' }: EquipmentProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(category || null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'price' | 'date' | 'name'>('date');
  const [filterCondition, setFilterCondition] = useState<'all' | 'new' | 'used'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const currentCategory = categories.find(cat => cat.id === selectedCategory);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* En-tête avec navigation des catégories */}
      <div className="mb-8">
        <div className="flex items-center text-sm text-gray-500 mb-4">
          <a href="#" className="hover:text-primary-600">Accueil</a>
          <ChevronRight className="h-4 w-4 mx-2" />
          <span className="text-gray-900">Équipements</span>
          {selectedCategory && (
            <>
              <ChevronRight className="h-4 w-4 mx-2" />
              <span className="text-gray-900">{currentCategory?.name}</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Navigation des catégories */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Catégories</h3>
              <ul className="space-y-2">
                {categories.map(cat => {
                  const Icon = iconMap[cat.icon as keyof typeof iconMap];
                  return (
                    <li key={cat.id}>
                      <button
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full flex items-center px-3 py-2 rounded-md text-left ${
                          selectedCategory === cat.id
                            ? 'bg-primary-50 text-primary-600'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="h-5 w-5 mr-2" />
                        <span>{cat.name}</span>
                        <span className="ml-auto text-sm text-gray-500">{cat.count}</span>
                      </button>
                      
                      {selectedCategory === cat.id && cat.subcategories && (
                        <ul className="ml-6 mt-2 space-y-1">
                          {cat.subcategories.map(sub => (
                            <li key={sub.id}>
                              <button
                                onClick={() => setSelectedSubcategory(sub.id)}
                                className={`w-full flex items-center px-3 py-1.5 rounded-md text-sm ${
                                  selectedSubcategory === sub.id
                                    ? 'text-primary-600 font-medium'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                              >
                                {sub.name}
                                <span className="ml-auto text-sm text-gray-500">{sub.count}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Filtres */}
            <div className="bg-white rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Filtres</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    État
                  </label>
                  <select
                    value={filterCondition}
                    onChange={(e) => setFilterCondition(e.target.value as 'all' | 'new' | 'used')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="all">Tous</option>
                    <option value="new">Neuf</option>
                    <option value="used">Occasion</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Marque
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option>Toutes les marques</option>
                    <option>Caterpillar</option>
                    <option>Volvo</option>
                    <option>Komatsu</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Année
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prix (€)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Liste des équipements */}
          <div className="md:col-span-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  {currentCategory ? currentCategory.name : 'Tous les équipements'}
                </h1>
                
                <div className="flex items-center space-x-4 mt-4 sm:mt-0">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Rechercher..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-md"
                    />
                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'price' | 'date' | 'name')}
                    className="px-4 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="date">Plus récent</option>
                    <option value="price">Prix croissant</option>
                    <option value="name">Nom A-Z</option>
                  </select>
                </div>
              </div>

              {/* Grille des équipements */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Les cartes d'équipement seront mappées ici */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}