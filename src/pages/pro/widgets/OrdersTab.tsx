import React, { useEffect, useState } from 'react';
import { ClientOrder, createClientOrder, getProClientProfile } from '../../../utils/proApi';
import supabase from '../../../utils/supabaseClient';
import {
  Check,
  Edit,
  Eye,
  FileText,
  Plus,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { toast } from '../../../utils/toast';
export function OrdersTab({ orders, onRefresh }: { orders: ClientOrder[], onRefresh: () => Promise<void> }) {
  // États pour les modals et actions
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [showViewOrderModal, setShowViewOrderModal] = useState(false);
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ClientOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // États pour les filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // États pour les commandes entrantes (offres d'achat)
  const [incomingOrders, setIncomingOrders] = useState<any[]>([]);
  const [showIncomingOrderModal, setShowIncomingOrderModal] = useState(false);
  const [selectedIncomingOrder, setSelectedIncomingOrder] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'internal' | 'incoming'>('incoming');

  // État pour le formulaire de nouvelle commande
  const [newOrderForm, setNewOrderForm] = useState({
    order_type: 'purchase' as 'purchase' | 'rental' | 'maintenance' | 'import',
    total_amount: 0,
    currency: 'MAD',
    expected_delivery: '',
    notes: ''
  });

  // État pour le formulaire d'édition
  const [editOrderForm, setEditOrderForm] = useState({
    order_type: 'purchase' as 'purchase' | 'rental' | 'maintenance' | 'import',
    status: 'pending' as 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled',
    total_amount: 0,
    currency: 'MAD',
    expected_delivery: '',
    actual_delivery: '',
    notes: ''
  });

  // Charger les commandes entrantes au montage
  useEffect(() => {
    loadIncomingOrders();
  }, []);

  const loadIncomingOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Récupérer les offres reçues par le vendeur
      const { data: offers, error } = await supabase
        .from('offers')
        .select(`
          *,
          buyer:profiles!offers_buyer_id_fkey(firstname, lastname, email, phone, company),
          machine:machines(name, brand, model, category, price, images)
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors du chargement des commandes entrantes:', error);
        return;
      }

      setIncomingOrders(offers || []);
    } catch (error) {
      console.error('Erreur lors du chargement des commandes entrantes:', error);
    }
  };

  // Fonctions de gestion des actions
  const handleAddOrder = () => {
    setShowAddOrderModal(true);
  };

  // Fonctions pour les commandes entrantes
  const handleViewIncomingOrder = (order: any) => {
    console.log('Voir commande entrante:', order);
    setSelectedIncomingOrder(order);
    setShowIncomingOrderModal(true);
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'accepted' })
        .eq('id', offerId);

      if (error) {
        console.error('Erreur lors de l\'acceptation:', error);
        toast('Erreur lors de l\'acceptation de l\'offre');
        return;
      }

      console.log('✅ Offre acceptée avec succès');
      toast('Offre acceptée avec succès !');
      loadIncomingOrders(); // Recharger les données
    } catch (error) {
      console.error('Erreur lors de l\'acceptation:', error);
      toast('Erreur lors de l\'acceptation de l\'offre');
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    try {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'rejected' })
        .eq('id', offerId);

      if (error) {
        console.error('Erreur lors du refus:', error);
        toast('Erreur lors du refus de l\'offre');
        return;
      }

      console.log('✅ Offre refusée avec succès');
      toast('Offre refusée avec succès !');
      loadIncomingOrders(); // Recharger les données
    } catch (error) {
      console.error('Erreur lors du refus:', error);
      toast('Erreur lors du refus de l\'offre');
    }
  };

  const handleSendInvoice = async (offerId: string) => {
    // TODO: Implémenter l'envoi de facture
    toast('Fonctionnalité d\'envoi de facture à implémenter');
  };

  const handleMarkShipped = async (offerId: string) => {
    // TODO: Implémenter le marquage comme expédié
    toast('Fonctionnalité de marquage expédié à implémenter');
  };

  const handleViewOrder = (order: ClientOrder) => {
    console.log('Voir commande:', order);
    setSelectedOrder(order);
    setShowViewOrderModal(true);
  };

  const handleEditOrder = (order: ClientOrder) => {
    console.log('Modifier commande:', order);
    setSelectedOrder(order);
    setEditOrderForm({
      order_type: order.order_type,
      status: order.status,
      total_amount: order.total_amount || 0,
      currency: order.currency,
      expected_delivery: order.expected_delivery ? new Date(order.expected_delivery).toISOString().split('T')[0] : '',
      actual_delivery: order.actual_delivery ? new Date(order.actual_delivery).toISOString().split('T')[0] : '',
      notes: order.notes || ''
    });
    setShowEditOrderModal(true);
  };

  const handleDeleteOrder = async (order: ClientOrder) => {
    console.log('Supprimer commande:', order);
    if (confirm(`Êtes-vous sûr de vouloir supprimer la commande ${order.order_number} ?`)) {
      try {
        const { error } = await supabase
          .from('client_orders')
          .delete()
          .eq('id', order.id);

        if (error) {
          console.error('Erreur lors de la suppression:', error);
          toast('Erreur lors de la suppression de la commande');
        } else {
          console.log('✅ Commande supprimée avec succès');
          toast(`Commande ${order.order_number} supprimée avec succès`);
          onRefresh();
        }
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        toast('Erreur lors de la suppression de la commande');
      }
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Récupérer le profil Pro pour obtenir le client_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const proProfile = await getProClientProfile();
      if (!proProfile) throw new Error('Profil Pro non trouvé');

      // Générer un numéro de commande unique
      const orderNumber = `CMD-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;

      // Préparer les données de la commande
      const orderData = {
        client_id: proProfile.id,
        order_number: orderNumber,
        order_type: newOrderForm.order_type,
        status: 'pending' as const,
        total_amount: newOrderForm.total_amount,
        currency: newOrderForm.currency,
        order_date: new Date().toISOString(),
        expected_delivery: newOrderForm.expected_delivery || null,
        notes: newOrderForm.notes || null
      };

      // Créer la commande
      const newOrder = await createClientOrder(orderData);
      
      if (newOrder) {
        console.log('✅ Commande créée:', newOrder);
        setShowAddOrderModal(false);
        setNewOrderForm({
          order_type: 'purchase',
          total_amount: 0,
          currency: 'MAD',
          expected_delivery: '',
          notes: ''
        });
        
        // Recharger les données
        await onRefresh();
        
        toast('Commande créée avec succès !');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création de la commande:', error);
      toast('Erreur lors de la création de la commande');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    try {
      const { error } = await supabase
        .from('client_orders')
        .update({
          order_type: editOrderForm.order_type,
          status: editOrderForm.status,
          total_amount: editOrderForm.total_amount,
          currency: editOrderForm.currency,
          expected_delivery: editOrderForm.expected_delivery || null,
          actual_delivery: editOrderForm.actual_delivery || null,
          notes: editOrderForm.notes || null
        })
        .eq('id', selectedOrder.id);

      if (error) {
        console.error('Erreur lors de la mise à jour:', error);
        toast('Erreur lors de la mise à jour de la commande');
        return;
      }

      console.log('✅ Commande mise à jour avec succès');
      toast(`Commande ${selectedOrder.order_number} mise à jour avec succès`);
      setShowEditOrderModal(false);
      setSelectedOrder(null);
      onRefresh();
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      toast('Erreur lors de la mise à jour de la commande');
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setNewOrderForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEditInputChange = (field: string, value: any) => {
    setEditOrderForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Filtrage des commandes
  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesType = typeFilter === 'all' || order.order_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  // Fonction pour obtenir la couleur du statut
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'shipped': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Fonction pour obtenir l'icône du type
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase': return '🛒';
      case 'rental': return '📋';
      case 'maintenance': return '🔧';
      case 'import': return '📦';
      default: return '📄';
    }
  };

  // Fonction pour obtenir la couleur du statut des offres
  const getOfferStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Fonction pour obtenir le texte du statut des offres
  const getOfferStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente';
      case 'accepted': return 'Acceptée';
      case 'rejected': return 'Refusée';
      case 'expired': return 'Expirée';
      default: return status;
    }
  };

  // Filtrage des commandes entrantes
  const filteredIncomingOrders = incomingOrders.filter(order => {
    const matchesSearch = order.machine?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.buyer?.firstname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.buyer?.lastname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.message?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Commandes</h2>
        <button 
          onClick={handleAddOrder}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle commande
        </button>
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('incoming')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'incoming'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📥 Commandes Entrantes
            {incomingOrders.filter(o => o.status === 'pending').length > 0 && (
              <span className="ml-2 bg-orange-100 text-orange-800 text-xs font-medium px-2 py-1 rounded-full">
                {incomingOrders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('internal')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'internal'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📋 Commandes Internes
          </button>
        </nav>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recherche</label>
            <input
              type="text"
              placeholder={activeTab === 'incoming' ? "Machine, acheteur, message..." : "N° commande, notes..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Tous les statuts</option>
              {activeTab === 'incoming' ? (
                <>
                  <option value="pending">En attente</option>
                  <option value="accepted">Acceptée</option>
                  <option value="rejected">Refusée</option>
                  <option value="expired">Expirée</option>
                </>
              ) : (
                <>
                  <option value="pending">En attente</option>
                  <option value="confirmed">Confirmée</option>
                  <option value="shipped">Expédiée</option>
                  <option value="delivered">Livrée</option>
                  <option value="cancelled">Annulée</option>
                </>
              )}
            </select>
          </div>
          {activeTab === 'internal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="all">Tous les types</option>
                <option value="purchase">Achat</option>
                <option value="rental">Location</option>
                <option value="maintenance">Maintenance</option>
                <option value="import">Import</option>
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setTypeFilter('all');
              }}
              className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Contenu conditionnel selon l'onglet actif */}
      {activeTab === 'incoming' ? (
        /* Tableau des commandes entrantes */
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Machine
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acheteur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Offre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredIncomingOrders.length > 0 ? (
                filteredIncomingOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center">
                        {order.machine?.images?.[0] && (
                          <img 
                            src={order.machine.images[0]} 
                            alt={order.machine.name}
                            className="w-8 h-8 rounded-md mr-3 object-cover"
                          />
                        )}
                        <div>
                          <div className="font-medium">{order.machine?.name || 'Machine inconnue'}</div>
                          <div className="text-gray-500 text-xs">{order.machine?.brand} {order.machine?.model}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{order.buyer?.firstname} {order.buyer?.lastname}</div>
                        <div className="text-gray-500 text-xs">{order.buyer?.company || 'Particulier'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="font-medium">{order.amount?.toLocaleString()} MAD</div>
                      <div className="text-gray-500 text-xs">Prix: {order.machine?.price?.toLocaleString()} MAD</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getOfferStatusColor(order.status)}`}>
                        {getOfferStatusText(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(order.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewIncomingOrder(order)}
                          className="text-orange-600 hover:text-orange-900"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {order.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleAcceptOffer(order.id)}
                              className="text-green-600 hover:text-green-900"
                              title="Accepter"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleRejectOffer(order.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Refuser"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {order.status === 'accepted' && (
                          <>
                            <button 
                              onClick={() => handleSendInvoice(order.id)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Envoyer facture"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleMarkShipped(order.id)}
                              className="text-purple-600 hover:text-purple-900"
                              title="Marquer expédié"
                            >
                              <Truck className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {incomingOrders.length === 0 ? 'Aucune commande entrante trouvée' : 'Aucune commande ne correspond aux filtres'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Tableau des commandes internes */
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  N° Commande
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.order_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <span className="mr-2">{getTypeIcon(order.order_type)}</span>
                        <span className="capitalize">{order.order_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status === 'pending' ? 'En attente' :
                         order.status === 'confirmed' ? 'Confirmée' :
                         order.status === 'shipped' ? 'Expédiée' :
                         order.status === 'delivered' ? 'Livrée' :
                         order.status === 'cancelled' ? 'Annulée' : order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.total_amount ? `${order.total_amount.toLocaleString()} ${order.currency}` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(order.order_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewOrder(order)}
                          className="text-orange-600 hover:text-orange-900"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleEditOrder(order)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Modifier"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteOrder(order)}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {orders.length === 0 ? 'Aucune commande trouvée' : 'Aucune commande ne correspond aux filtres'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de création de commande */}
      {showAddOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Nouvelle commande</h3>
              <button
                onClick={() => setShowAddOrderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type de commande *
                </label>
                <select
                  value={newOrderForm.order_type}
                  onChange={(e) => handleInputChange('order_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="purchase">Achat</option>
                  <option value="rental">Location</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="import">Import</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant (MAD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newOrderForm.total_amount}
                  onChange={(e) => handleInputChange('total_amount', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de livraison prévue
                </label>
                <input
                  type="date"
                  value={newOrderForm.expected_delivery}
                  onChange={(e) => handleInputChange('expected_delivery', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={newOrderForm.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Description de la commande..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddOrderModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Création...' : 'Créer la commande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de détail de commande */}
      {showViewOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Détails de la commande</h3>
              <button
                onClick={() => setShowViewOrderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Informations générales</h4>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Numéro de commande</dt>
                      <dd className="text-sm text-gray-900">{selectedOrder.order_number}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Type</dt>
                      <dd className="text-sm text-gray-900 capitalize">{selectedOrder.order_type}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Statut</dt>
                      <dd className="text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedOrder.status)}`}>
                          {selectedOrder.status === 'pending' ? 'En attente' :
                           selectedOrder.status === 'confirmed' ? 'Confirmée' :
                           selectedOrder.status === 'shipped' ? 'Expédiée' :
                           selectedOrder.status === 'delivered' ? 'Livrée' :
                           selectedOrder.status === 'cancelled' ? 'Annulée' : selectedOrder.status}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Montant</dt>
                      <dd className="text-sm text-gray-900">
                        {selectedOrder.total_amount ? `${selectedOrder.total_amount.toLocaleString()} ${selectedOrder.currency}` : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Dates</h4>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Date de commande</dt>
                      <dd className="text-sm text-gray-900">
                        {new Date(selectedOrder.order_date).toLocaleDateString('fr-FR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Livraison prévue</dt>
                      <dd className="text-sm text-gray-900">
                        {selectedOrder.expected_delivery ? new Date(selectedOrder.expected_delivery).toLocaleDateString('fr-FR') : 'Non définie'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Livraison effective</dt>
                      <dd className="text-sm text-gray-900">
                        {selectedOrder.actual_delivery ? new Date(selectedOrder.actual_delivery).toLocaleDateString('fr-FR') : 'Non livrée'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">Notes</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                    {selectedOrder.notes}
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowViewOrderModal(false);
                    handleEditOrder(selectedOrder);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Modifier
                </button>
                <button
                  onClick={() => setShowViewOrderModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition de commande */}
      {showEditOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Modifier la commande</h3>
              <button
                onClick={() => setShowEditOrderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type de commande
                </label>
                <select
                  value={editOrderForm.order_type}
                  onChange={(e) => handleEditInputChange('order_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="purchase">Achat</option>
                  <option value="rental">Location</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="import">Import</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Statut
                </label>
                <select
                  value={editOrderForm.status}
                  onChange={(e) => handleEditInputChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="pending">En attente</option>
                  <option value="confirmed">Confirmée</option>
                  <option value="shipped">Expédiée</option>
                  <option value="delivered">Livrée</option>
                  <option value="cancelled">Annulée</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant (MAD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editOrderForm.total_amount}
                  onChange={(e) => handleEditInputChange('total_amount', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de livraison prévue
                </label>
                <input
                  type="date"
                  value={editOrderForm.expected_delivery}
                  onChange={(e) => handleEditInputChange('expected_delivery', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de livraison effective
                </label>
                <input
                  type="date"
                  value={editOrderForm.actual_delivery}
                  onChange={(e) => handleEditInputChange('actual_delivery', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={editOrderForm.notes}
                  onChange={(e) => handleEditInputChange('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Notes sur la commande..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditOrderModal(false)}
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

      {/* Modal de détail des commandes entrantes */}
      {showIncomingOrderModal && selectedIncomingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Détails de la commande entrante</h3>
              <button
                onClick={() => setShowIncomingOrderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Informations de la machine */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Machine concernée</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center">
                    {selectedIncomingOrder.machine?.images?.[0] && (
                      <img 
                        src={selectedIncomingOrder.machine.images[0]} 
                        alt={selectedIncomingOrder.machine.name}
                        className="w-16 h-16 rounded-lg mr-4 object-cover"
                      />
                    )}
                    <div>
                      <div className="font-medium text-lg">{selectedIncomingOrder.machine?.name || 'Machine inconnue'}</div>
                      <div className="text-gray-600">{selectedIncomingOrder.machine?.brand} {selectedIncomingOrder.machine?.model}</div>
                      <div className="text-gray-500 text-sm">{selectedIncomingOrder.machine?.category}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {selectedIncomingOrder.machine?.price?.toLocaleString()} MAD
                    </div>
                    <div className="text-gray-500">Prix de vente</div>
                  </div>
                </div>
              </div>

              {/* Informations de l'acheteur */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Informations de l'acheteur</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="font-medium">{selectedIncomingOrder.buyer?.firstname} {selectedIncomingOrder.buyer?.lastname}</div>
                    <div className="text-gray-600">{selectedIncomingOrder.buyer?.company || 'Particulier'}</div>
                    <div className="text-gray-500 text-sm">{selectedIncomingOrder.buyer?.email}</div>
                    <div className="text-gray-500 text-sm">{selectedIncomingOrder.buyer?.phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-orange-600">
                      {selectedIncomingOrder.amount?.toLocaleString()} MAD
                    </div>
                    <div className="text-gray-500">Offre proposée</div>
                    <div className="text-sm text-gray-500">
                      {selectedIncomingOrder.amount > selectedIncomingOrder.machine?.price ? '✅ Au-dessus du prix' : 
                       selectedIncomingOrder.amount < selectedIncomingOrder.machine?.price ? '⚠️ En dessous du prix' : 
                       '💰 Prix égal'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Détails de l'offre */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Détails de l'offre</h4>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Statut</dt>
                      <dd className="text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getOfferStatusColor(selectedIncomingOrder.status)}`}>
                          {getOfferStatusText(selectedIncomingOrder.status)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Date de l'offre</dt>
                      <dd className="text-sm text-gray-900">
                        {new Date(selectedIncomingOrder.created_at).toLocaleDateString('fr-FR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Différence de prix</dt>
                      <dd className="text-sm text-gray-900">
                        {selectedIncomingOrder.amount && selectedIncomingOrder.machine?.price ? 
                          `${(selectedIncomingOrder.amount - selectedIncomingOrder.machine.price).toLocaleString()} MAD` : 
                          'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Message de l'acheteur</h4>
                  {selectedIncomingOrder.message ? (
                    <div className="bg-white border border-gray-200 p-3 rounded-md">
                      <p className="text-sm text-gray-700">{selectedIncomingOrder.message}</p>
                    </div>
                  ) : (
                    <div className="bg-gray-100 p-3 rounded-md">
                      <p className="text-sm text-gray-500 italic">Aucun message</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t pt-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Actions</h4>
                <div className="flex flex-wrap gap-3">
                  {selectedIncomingOrder.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleAcceptOffer(selectedIncomingOrder.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Accepter l'offre
                      </button>
                      <button
                        onClick={() => handleRejectOffer(selectedIncomingOrder.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Refuser l'offre
                      </button>
                    </>
                  )}
                  {selectedIncomingOrder.status === 'accepted' && (
                    <>
                      <button
                        onClick={() => handleSendInvoice(selectedIncomingOrder.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Envoyer facture
                      </button>
                      <button
                        onClick={() => handleMarkShipped(selectedIncomingOrder.id)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center"
                      >
                        <Truck className="h-4 w-4 mr-2" />
                        Marquer expédié
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowIncomingOrderModal(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
