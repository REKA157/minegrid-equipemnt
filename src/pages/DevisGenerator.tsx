import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Download, 
  Save, 
  Eye, 
  FileText,
  DollarSign,
  Calendar,
  User,
  Building2,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { toast } from '../utils/toast';
import BackToDashboardButton from '../components/common/BackToDashboardButton';
interface DevisItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface DevisData {
  id?: string;
  devisNumber: string;
  date: string;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  items: DevisItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string;
  validUntil: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
}

export default function DevisGenerator() {
  const [devis, setDevis] = useState<DevisData>({
    devisNumber: generateDevisNumber(),
    date: new Date().toISOString().split('T')[0],
    clientName: '',
    clientCompany: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    items: [],
    subtotal: 0,
    taxRate: 20,
    taxAmount: 0,
    total: 0,
    notes: '',
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'draft'
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function generateDevisNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DEV-${year}${month}-${random}`;
  }

  const addItem = () => {
    const newItem: DevisItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setDevis(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const removeItem = (id: string) => {
    setDevis(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const updateItem = (id: string, field: keyof DevisItem, value: any) => {
    setDevis(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unitPrice') {
            updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
          }
          return updatedItem;
        }
        return item;
      })
    }));
  };

  const calculateTotals = () => {
    const subtotal = devis.items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = subtotal * (devis.taxRate / 100);
    const total = subtotal + taxAmount;
    
    setDevis(prev => ({
      ...prev,
      subtotal,
      taxAmount,
      total
    }));
  };

  useEffect(() => {
    calculateTotals();
  }, [devis.items, devis.taxRate]);

  const saveDevis = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast('Vous devez être connecté pour sauvegarder un devis');
        return;
      }

      const devisToSave = {
        ...devis,
        user_id: user.id,
        created_at: new Date().toISOString()
      };

      let result;
      if (devis.id) {
        result = await supabase
          .from('devis')
          .update(devisToSave)
          .eq('id', devis.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from('devis')
          .insert(devisToSave)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Erreur sauvegarde devis:', result.error);
        toast('Erreur lors de la sauvegarde');
        return;
      }

      setDevis(prev => ({ ...prev, id: result.data.id }));
      toast('Devis sauvegardé avec succès !');
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = () => {
    // Vrai export sans dépendance : on ouvre une fenêtre d'impression ne contenant
    // QUE le devis. Le navigateur propose « Enregistrer en PDF » (ou impression).
    const esc = (s: unknown) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = devis.items.map((it) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #ddd">${esc(it.description)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${esc(it.quantity)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${esc(it.unitPrice)}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${esc(it.total)}</td>
      </tr>`).join('');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <title>Devis ${esc(devis.devisNumber)}</title></head>
      <body style="font-family:Arial,sans-serif;color:#111;padding:24px;max-width:800px;margin:auto">
        <h1 style="color:#ea580c;margin:0 0 4px">Devis ${esc(devis.devisNumber)}</h1>
        <div style="color:#666;margin-bottom:16px">Date : ${esc(devis.date)} · Valable jusqu'au ${esc(devis.validUntil)}</div>
        <div style="margin-bottom:16px">
          <strong>Client :</strong> ${esc(devis.clientName)} ${esc(devis.clientCompany)}<br>
          ${esc(devis.clientEmail)} ${esc(devis.clientPhone)}<br>${esc(devis.clientAddress)}
        </div>
        <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">Description</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Qté</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">P.U.</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Total</th>
          </tr></thead><tbody>${rows}</tbody>
        </table>
        <div style="text-align:right;line-height:1.6">
          Sous-total : ${esc(devis.subtotal)}<br>
          TVA (${esc(devis.taxRate)}%) : ${esc(devis.taxAmount)}<br>
          <strong style="font-size:18px">Total : ${esc(devis.total)}</strong>
        </div>
        ${devis.notes ? `<div style="margin-top:16px"><strong>Notes :</strong><br>${esc(devis.notes)}</div>` : ''}
        <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      toast("Autorisez les fenêtres pop-up pour exporter le devis en PDF.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const DevisPreview = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Devis #{devis.devisNumber}</h2>
              <p className="text-gray-600">Date: {new Date(devis.date).toLocaleDateString('fr-FR')}</p>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              className="text-orange-400 hover:text-orange-600"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Informations client</h3>
              <div className="space-y-1 text-sm">
                <p><strong>Nom:</strong> {devis.clientName}</p>
                <p><strong>Entreprise:</strong> {devis.clientCompany}</p>
                <p><strong>Email:</strong> {devis.clientEmail}</p>
                <p><strong>Téléphone:</strong> {devis.clientPhone}</p>
                <p><strong>Adresse:</strong> {devis.clientAddress}</p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Détails du devis</h3>
              <div className="space-y-1 text-sm">
                <p><strong>Numéro:</strong> {devis.devisNumber}</p>
                <p><strong>Date:</strong> {new Date(devis.date).toLocaleDateString('fr-FR')}</p>
                <p><strong>Valide jusqu'au:</strong> {new Date(devis.validUntil).toLocaleDateString('fr-FR')}</p>
                <p><strong>Statut:</strong> <span className="capitalize">{devis.status}</span></p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Articles</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Description</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-900">Quantité</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-900">Prix unitaire</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-900">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {devis.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-2 text-sm">{item.description}</td>
                      <td className="px-4 py-2 text-sm text-right">{item.quantity}</td>
                      <td className="px-4 py-2 text-sm text-right">{item.unitPrice.toLocaleString('fr-FR')} €</td>
                      <td className="px-4 py-2 text-sm text-right font-medium">{item.total.toLocaleString('fr-FR')} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <div className="w-64 space-y-2">
              <div className="flex justify-between">
                <span>Sous-total:</span>
                <span>{devis.subtotal.toLocaleString('fr-FR')} €</span>
              </div>
              <div className="flex justify-between">
                <span>TVA ({devis.taxRate}%):</span>
                <span>{devis.taxAmount.toLocaleString('fr-FR')} €</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>{devis.total.toLocaleString('fr-FR')} €</span>
              </div>
            </div>
          </div>

          {devis.notes && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{devis.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

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
                Créer un devis
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowPreview(true)}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
              >
                <Eye className="h-4 w-4 mr-2" />
                Aperçu
              </button>
              <button
                onClick={saveDevis}
                disabled={saving}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              <button
                onClick={generatePDF}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Télécharger PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Informations du devis */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations du devis</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de devis
                  </label>
                  <input
                    type="text"
                    value={devis.devisNumber}
                    onChange={(e) => setDevis(prev => ({ ...prev, devisNumber: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={devis.date}
                    onChange={(e) => setDevis(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valide jusqu'au
                  </label>
                  <input
                    type="date"
                    value={devis.validUntil}
                    onChange={(e) => setDevis(prev => ({ ...prev, validUntil: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Taux de TVA (%)
                  </label>
                  <input
                    type="number"
                    value={devis.taxRate}
                    onChange={(e) => setDevis(prev => ({ ...prev, taxRate: parseFloat(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Informations client */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations client</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      value={devis.clientName}
                      onChange={(e) => setDevis(prev => ({ ...prev, clientName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Entreprise
                    </label>
                    <input
                      type="text"
                      value={devis.clientCompany}
                      onChange={(e) => setDevis(prev => ({ ...prev, clientCompany: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={devis.clientEmail}
                      onChange={(e) => setDevis(prev => ({ ...prev, clientEmail: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={devis.clientPhone}
                      onChange={(e) => setDevis(prev => ({ ...prev, clientPhone: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse
                  </label>
                  <textarea
                    value={devis.clientAddress}
                    onChange={(e) => setDevis(prev => ({ ...prev, clientAddress: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <textarea
                value={devis.notes}
                onChange={(e) => setDevis(prev => ({ ...prev, notes: e.target.value }))}
                rows={4}
                placeholder="Ajoutez des notes ou conditions spéciales..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Articles */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Articles</h2>
                <button
                  onClick={addItem}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un article
                </button>
              </div>

              <div className="space-y-4">
                {devis.items.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-gray-900">Article #{item.id.slice(-4)}</h3>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-orange-800 hover:text-orange-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Quantité
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value))}
                          min="1"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Prix unitaire (€)
                        </label>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value))}
                          min="0"
                          step="0.01"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Total (€)
                        </label>
                        <input
                          type="text"
                          value={item.total.toLocaleString('fr-FR')}
                          readOnly
                          className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {devis.items.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Aucun article ajouté</p>
                  <p className="text-sm">Cliquez sur "Ajouter un article" pour commencer</p>
                </div>
              )}
            </div>

            {/* Résumé */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Résumé</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sous-total:</span>
                  <span className="font-medium">{devis.subtotal.toLocaleString('fr-FR')} €</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">TVA ({devis.taxRate}%):</span>
                  <span className="font-medium">{devis.taxAmount.toLocaleString('fr-FR')} €</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-orange-600">{devis.total.toLocaleString('fr-FR')} €</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPreview && <DevisPreview />}
    </div>
  );
} 