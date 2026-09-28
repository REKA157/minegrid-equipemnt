import React from 'react';
import { Wallet, Calculator, Shield, ChevronRight } from 'lucide-react';

export default function Financing() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Fil d'Ariane */}
      <nav className="flex mb-8" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2">
          <li>
            <a href="#" className="text-gray-500 hover:text-primary-600">Accueil</a>
          </li>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <li>
            <a href="#services" className="text-gray-500 hover:text-primary-600">Services</a>
          </li>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <li>
            <span className="text-gray-900">Financement & Assurance</span>
          </li>
        </ol>
      </nav>

      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Solutions de Financement & Assurance</h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Des solutions financières adaptées pour l'acquisition et la protection de vos équipements
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-white rounded-lg shadow-md p-6">
          <Wallet className="h-12 w-12 text-primary-600 mb-4" />
          <h3 className="text-xl font-semibold mb-2">Crédit-bail</h3>
          <p className="text-gray-600 mb-4">
            Solution de financement flexible permettant l'utilisation du matériel avec option d'achat
          </p>
          <ul className="space-y-2 text-gray-600">
            <li>• Préservez votre trésorerie</li>
            <li>• Optimisation fiscale</li>
            <li>• Renouvellement facilité</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <Calculator className="h-12 w-12 text-primary-600 mb-4" />
          <h3 className="text-xl font-semibold mb-2">Location longue durée</h3>
          <p className="text-gray-600 mb-4">
            Location d'équipements sur une période définie avec services inclus
          </p>
          <ul className="space-y-2 text-gray-600">
            <li>• Loyers fixes</li>
            <li>• Maintenance incluse</li>
            <li>• Sans engagement long terme</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <Shield className="h-12 w-12 text-primary-600 mb-4" />
          <h3 className="text-xl font-semibold mb-2">Assurance tous risques</h3>
          <p className="text-gray-600 mb-4">
            Protection complète de vos équipements contre tous les risques
          </p>
          <ul className="space-y-2 text-gray-600">
            <li>• Couverture complète</li>
            <li>• Assistance 24/7</li>
            <li>• Garantie vol et casse</li>
          </ul>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-8 mb-12">
        <h2 className="text-2xl font-bold mb-6">Processus de financement</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-600 font-bold">1</span>
            </div>
            <h3 className="font-semibold mb-2">Demande</h3>
            <p className="text-gray-600">Soumettez votre demande de financement en ligne</p>
          </div>
          <div className="text-center">
            <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-600 font-bold">2</span>
            </div>
            <h3 className="font-semibold mb-2">Étude</h3>
            <p className="text-gray-600">Analyse rapide de votre dossier</p>
          </div>
          <div className="text-center">
            <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-600 font-bold">3</span>
            </div>
            <h3 className="font-semibold mb-2">Proposition</h3>
            <p className="text-gray-600">Offre personnalisée sous 48h</p>
          </div>
          <div className="text-center">
            <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-600 font-bold">4</span>
            </div>
            <h3 className="font-semibold mb-2">Finalisation</h3>
            <p className="text-gray-600">Signature et déblocage rapide des fonds</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold mb-6">Demande de financement</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              Email professionnel
            </label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de financement
            </label>
            <select className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500">
              <option>Crédit-bail</option>
              <option>Location longue durée</option>
              <option>Assurance</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Montant souhaité
            </label>
            <input
              type="number"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            ></textarea>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full bg-primary-600 text-white px-6 py-3 rounded-md hover:bg-primary-700 transition-colors"
            >
              Envoyer la demande
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}