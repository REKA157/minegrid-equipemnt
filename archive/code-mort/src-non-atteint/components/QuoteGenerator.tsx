import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Download, 
  Save, 
  Edit, 
  Eye,
  Building2,
  User,
  Package
} from 'lucide-react';
import { toast } from '../utils/toast';
interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

interface QuoteData {
  id: string;
  quoteNumber: string;
  date: string;
  validUntil: string;
  companyInfo: {
    name: string;
    address: string;
    phone: string;
    email: string;
    siret: string;
  };
  clientInfo: {
    name: string;
    company: string;
    address: string;
    phone: string;
    email: string;
  };
  items: QuoteItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  notes: string;
  terms: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
}

const defaultQuoteData: QuoteData = {
  id: '',
  quoteNumber: '',
  date: new Date().toISOString().split('T')[0],
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  companyInfo: {
    name: 'Minegrid Équipement',
    address: '123 Rue de l\'Industrie, Bamako, Mali',
    phone: '+223 20 22 33 44',
    email: 'contact@minegrid-equipement.com',
    siret: 'ML12345678901234'
  },
  clientInfo: {
    name: '',
    company: '',
    address: '',
    phone: '',
    email: ''
  },
  items: [],
  subtotal: 0,
  taxRate: 18,
  taxAmount: 0,
  discount: 0,
  total: 0,
  notes: '',
  terms: 'Paiement à 30 jours. Validité du devis : 30 jours.',
  status: 'draft'
};

export default function QuoteGenerator() {
  const [quoteData, setQuoteData] = useState<QuoteData>(defaultQuoteData);
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedQuotes, setSavedQuotes] = useState<QuoteData[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('savedQuotes');
    if (saved) {
      setSavedQuotes(JSON.parse(saved));
    }
    generateQuoteNumber();
  }, []);

  const generateQuoteNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const quoteNumber = `DEV-${year}${month}${day}-${random}`;
    
    setQuoteData(prev => ({
      ...prev,
      id: Date.now().toString(),
      quoteNumber
    }));
  };

  const calculateTotals = (items: QuoteItem[]) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = (subtotal - quoteData.discount) * (quoteData.taxRate / 100);
    const total = subtotal - quoteData.discount + taxAmount;
    
    setQuoteData(prev => ({
      ...prev,
      items,
      subtotal,
      taxAmount,
      total
    }));
  };

  const addItem = () => {
    const newItem: QuoteItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      total: 0
    };
    
    const updatedItems = [...quoteData.items, newItem];
    calculateTotals(updatedItems);
  };

  const updateItem = (id: string, field: keyof QuoteItem, value: any) => {
    const updatedItems = quoteData.items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        updatedItem.total = (updatedItem.quantity * updatedItem.unitPrice) * (1 - updatedItem.discount / 100);
        return updatedItem;
      }
      return item;
    });
    
    calculateTotals(updatedItems);
  };

  const removeItem = (id: string) => {
    const updatedItems = quoteData.items.filter(item => item.id !== id);
    calculateTotals(updatedItems);
  };

  const updateQuoteField = (field: keyof QuoteData, value: any) => {
    setQuoteData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'taxRate' || field === 'discount') {
        const taxAmount = (updated.subtotal - updated.discount) * (updated.taxRate / 100);
        const total = updated.subtotal - updated.discount + taxAmount;
        return { ...updated, taxAmount, total };
      }
      return updated;
    });
  };

  const saveQuote = () => {
    const updatedQuotes = savedQuotes.filter(q => q.id !== quoteData.id);
    const newSavedQuotes = [...updatedQuotes, quoteData];
    setSavedQuotes(newSavedQuotes);
    localStorage.setItem('savedQuotes', JSON.stringify(newSavedQuotes));
    setIsEditing(false);
    toast('Devis sauvegardé avec succès !');
  };

  const loadQuote = (quote: QuoteData) => {
    setQuoteData(quote);
    setIsEditing(false);
    setShowPreview(false);
  };

  const deleteQuote = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce devis ?')) {
      const updatedQuotes = savedQuotes.filter(q => q.id !== id);
      setSavedQuotes(updatedQuotes);
      localStorage.setItem('savedQuotes', JSON.stringify(updatedQuotes));
    }
  };

  const generatePDF = () => {
    toast('📄 Génération du PDF en cours...\n\nFonctionnalité qui permettra de télécharger le devis au format PDF professionnel.');
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Brouillon' },
      sent: { color: 'bg-blue-100 text-blue-800', label: 'Envoyé' },
      accepted: { color: 'bg-green-100 text-green-800', label: 'Accepté' },
      rejected: { color: 'bg-red-100 text-red-800', label: 'Refusé' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-8 w-8 text-orange-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Générateur de Devis PDF</h1>
                <p className="text-gray-600">Créez des devis professionnels pour vos clients</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Mode édition' : 'Aperçu'}
              </button>
              <button
                onClick={generatePDF}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="h-4 w-4 mr-2" />
                Télécharger PDF
              </button>
            </div>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar - Devis sauvegardés */}
          <div className="w-80 border-r border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Devis sauvegardés</h3>
              <button
                onClick={() => {
                  setQuoteData(defaultQuoteData);
                  generateQuoteNumber();
                  setIsEditing(true);
                  setShowPreview(false);
                }}
                className="flex items-center px-3 py-1 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Nouveau
              </button>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {savedQuotes.map((quote) => (
                <div
                  key={quote.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    quoteData.id === quote.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'
                  }`}
                  onClick={() => loadQuote(quote)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-gray-900">{quote.quoteNumber}</span>
                    {getStatusBadge(quote.status)}
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{quote.clientInfo.company || quote.clientInfo.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{quote.date}</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          loadQuote(quote);
                          setIsEditing(true);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuote(quote.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {savedQuotes.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Aucun devis sauvegardé</p>
                  <p className="text-xs">Créez votre premier devis</p>
                </div>
              )}
            </div>
          </div>

          {/* Contenu principal */}
          <div className="flex-1 p-6">
            {showPreview ? (
              <QuotePreview quoteData={quoteData} />
            ) : (
              <QuoteForm
                quoteData={quoteData}
                isEditing={isEditing}
                onUpdateQuote={updateQuoteField}
                onUpdateItem={updateItem}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                onSave={saveQuote}
                onEdit={() => setIsEditing(true)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant de formulaire de devis
function QuoteForm({
  quoteData,
  isEditing,
  onUpdateQuote,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onSave,
  onEdit
}: {
  quoteData: QuoteData;
  isEditing: boolean;
  onUpdateQuote: (field: keyof QuoteData, value: any) => void;
  onUpdateItem: (id: string, field: keyof QuoteItem, value: any) => void;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onSave: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Informations de base */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-orange-600" />
            Informations entreprise
          </h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
              <input
                type="text"
                value={quoteData.companyInfo.name}
                onChange={(e) => onUpdateQuote('companyInfo', { ...quoteData.companyInfo, name: e.target.value })}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <textarea
                value={quoteData.companyInfo.address}
                onChange={(e) => onUpdateQuote('companyInfo', { ...quoteData.companyInfo, address: e.target.value })}
                disabled={!isEditing}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={quoteData.companyInfo.phone}
                  onChange={(e) => onUpdateQuote('companyInfo', { ...quoteData.companyInfo, phone: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={quoteData.companyInfo.email}
                  onChange={(e) => onUpdateQuote('companyInfo', { ...quoteData.companyInfo, email: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <User className="h-5 w-5 mr-2 text-orange-600" />
            Informations client
          </h3>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du client</label>
                <input
                  type="text"
                  value={quoteData.clientInfo.name}
                  onChange={(e) => onUpdateQuote('clientInfo', { ...quoteData.clientInfo, name: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise</label>
                <input
                  type="text"
                  value={quoteData.clientInfo.company}
                  onChange={(e) => onUpdateQuote('clientInfo', { ...quoteData.clientInfo, company: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <textarea
                value={quoteData.clientInfo.address}
                onChange={(e) => onUpdateQuote('clientInfo', { ...quoteData.clientInfo, address: e.target.value })}
                disabled={!isEditing}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={quoteData.clientInfo.phone}
                  onChange={(e) => onUpdateQuote('clientInfo', { ...quoteData.clientInfo, phone: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={quoteData.clientInfo.email}
                  onChange={(e) => onUpdateQuote('clientInfo', { ...quoteData.clientInfo, email: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Informations du devis */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de devis</label>
          <input
            type="text"
            value={quoteData.quoteNumber}
            onChange={(e) => onUpdateQuote('quoteNumber', e.target.value)}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={quoteData.date}
            onChange={(e) => onUpdateQuote('date', e.target.value)}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Validité</label>
          <input
            type="date"
            value={quoteData.validUntil}
            onChange={(e) => onUpdateQuote('validUntil', e.target.value)}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
          <select
            value={quoteData.status}
            onChange={(e) => onUpdateQuote('status', e.target.value)}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
          >
            <option value="draft">Brouillon</option>
            <option value="sent">Envoyé</option>
            <option value="accepted">Accepté</option>
            <option value="rejected">Refusé</option>
          </select>
        </div>
      </div>

      {/* Articles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Package className="h-5 w-5 mr-2 text-orange-600" />
            Articles
          </h3>
          {isEditing && (
            <button
              onClick={onAddItem}
              className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un article
            </button>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-12 gap-4 mb-3 text-sm font-medium text-gray-700">
            <div className="col-span-5">Description</div>
            <div className="col-span-2">Quantité</div>
            <div className="col-span-2">Prix unitaire</div>
            <div className="col-span-2">Remise (%)</div>
            <div className="col-span-1">Total</div>
          </div>

          <div className="space-y-3">
            {quoteData.items.map((item) => (
              <div key={item.id} className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-5">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => onUpdateItem(item.id, 'description', e.target.value)}
                    disabled={!isEditing}
                    placeholder="Description de l'article"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                    disabled={!isEditing}
                    min="0"
                    step="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => onUpdateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    disabled={!isEditing}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={item.discount}
                    onChange={(e) => onUpdateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                    disabled={!isEditing}
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-1 flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {item.total.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}
                  </span>
                  {isEditing && (
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="ml-2 p-1 text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {quoteData.items.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>Aucun article ajouté</p>
                {isEditing && (
                  <button
                    onClick={onAddItem}
                    className="mt-2 text-orange-600 hover:text-orange-700 text-sm"
                  >
                    Ajouter le premier article
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
          <textarea
            value={quoteData.notes}
            onChange={(e) => onUpdateQuote('notes', e.target.value)}
            disabled={!isEditing}
            rows={4}
            placeholder="Notes additionnelles..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Conditions</h3>
          <textarea
            value={quoteData.terms}
            onChange={(e) => onUpdateQuote('terms', e.target.value)}
            disabled={!isEditing}
            rows={4}
            placeholder="Conditions de vente..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
          />
        </div>
      </div>

      {/* Calculs */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Sous-total :</span>
              <span className="font-medium">{quoteData.subtotal.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remise :</span>
              <span className="font-medium text-red-600">-{quoteData.discount.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">TVA ({quoteData.taxRate}%) :</span>
              <span className="font-medium">{quoteData.taxAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</span>
            </div>
            <div className="border-t border-gray-300 pt-3">
              <div className="flex justify-between">
                <span className="text-lg font-semibold text-gray-900">Total :</span>
                <span className="text-lg font-bold text-orange-600">
                  {quoteData.total.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taux de TVA (%)</label>
              <input
                type="number"
                value={quoteData.taxRate}
                onChange={(e) => onUpdateQuote('taxRate', parseFloat(e.target.value) || 0)}
                disabled={!isEditing}
                min="0"
                max="100"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Remise globale</label>
              <input
                type="number"
                value={quoteData.discount}
                onChange={(e) => onUpdateQuote('discount', parseFloat(e.target.value) || 0)}
                disabled={!isEditing}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          {!isEditing ? (
            <button
              onClick={onEdit}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </button>
          ) : (
            <button
              onClick={onSave}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Composant d'aperçu du devis
function QuotePreview({ quoteData }: { quoteData: QuoteData }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 max-w-4xl mx-auto">
      {/* En-tête */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{quoteData.companyInfo.name}</h1>
          <div className="space-y-1 text-gray-600">
            <p>{quoteData.companyInfo.address}</p>
            <p>Tél: {quoteData.companyInfo.phone}</p>
            <p>Email: {quoteData.companyInfo.email}</p>
            <p>SIRET: {quoteData.companyInfo.siret}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-orange-600 mb-2">DEVIS</h2>
          <div className="space-y-1 text-gray-600">
            <p><strong>N° {quoteData.quoteNumber}</strong></p>
            <p>Date: {new Date(quoteData.date).toLocaleDateString('fr-FR')}</p>
            <p>Validité: {new Date(quoteData.validUntil).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
      </div>

      {/* Informations client */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Client</h3>
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="font-medium text-gray-900">{quoteData.clientInfo.company || quoteData.clientInfo.name}</p>
          <div className="space-y-1 text-gray-600 mt-2">
            <p>{quoteData.clientInfo.address}</p>
            <p>Tél: {quoteData.clientInfo.phone}</p>
            <p>Email: {quoteData.clientInfo.email}</p>
          </div>
        </div>
      </div>

      {/* Articles */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Articles</h3>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Qté</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Prix unit.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Remise</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {quoteData.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {item.unitPrice.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.discount}%</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    {item.total.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totaux */}
      <div className="flex justify-end mb-8">
        <div className="w-80 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Sous-total :</span>
            <span className="font-medium">{quoteData.subtotal.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Remise :</span>
            <span className="font-medium text-red-600">-{quoteData.discount.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">TVA ({quoteData.taxRate}%) :</span>
            <span className="font-medium">{quoteData.taxAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}</span>
          </div>
          <div className="border-t border-gray-300 pt-3">
            <div className="flex justify-between">
              <span className="text-xl font-semibold text-gray-900">Total :</span>
              <span className="text-xl font-bold text-orange-600">
                {quoteData.total.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes et conditions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {quoteData.notes && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Notes</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 whitespace-pre-wrap">{quoteData.notes}</p>
            </div>
          </div>
        )}
        
        {quoteData.terms && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Conditions</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 whitespace-pre-wrap">{quoteData.terms}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
