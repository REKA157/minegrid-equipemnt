import React, { useState } from 'react';
import { createMaintenanceIntervention } from '../../../utils/enterpriseApi';
import {
  Check,
  Edit,
  Play,
  Trash2,
} from 'lucide-react';

export const PreventiveMaintenanceWidget = ({ data }: { data: any }) => {
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    equipment_id: '',
    description: '',
    intervention_date: '',
    priority: 'Moyenne',
    estimated_duration: '',
    technician_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  console.log('[DEBUG] PreventiveMaintenanceWidget - Données reçues:', data);
  console.log('[DEBUG] PreventiveMaintenanceWidget - État showModal:', showModal);

  // Test simple pour voir si le composant se rend
  if (!data) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded-lg">
        <div className="text-red-600 font-medium">Erreur : Aucune donnée reçue</div>
        <div className="text-sm text-red-500 mt-1">Le widget n'a pas reçu de données</div>
        <button
          className="mt-2 px-3 py-1 bg-orange-600 text-white rounded text-sm"
          onClick={() => console.log('Test bouton cliqué')}
        >
          Test Bouton
        </button>
      </div>
    );
  }

  if (!data.interventions) {
    return (
      <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-lg">
        <div className="text-yellow-600 font-medium">Aucune intervention trouvée</div>
        <div className="text-sm text-yellow-500 mt-1">Vérifiez la connexion à la base de données</div>
        <button
          className="mt-2 px-3 py-1 bg-orange-600 text-white rounded text-sm"
          onClick={() => console.log('Test bouton cliqué')}
        >
          Test Bouton
        </button>
      </div>
    );
  }

  const { interventions, stats } = data;

  // Filtrer les interventions selon les critères
  const filteredInterventions = interventions.filter((intervention: any) => {
    const matchesPriority = selectedPriority === 'all' || intervention.priority === selectedPriority;
    const matchesStatus = selectedStatus === 'all' || intervention.status === selectedStatus;
    const matchesTimeframe = selectedTimeframe === 'all' ||
      (selectedTimeframe === 'today' && intervention.isToday) ||
      (selectedTimeframe === 'week' && intervention.isThisWeek) ||
      (selectedTimeframe === 'overdue' && intervention.isOverdue);
    const matchesSearch = intervention.equipmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         intervention.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         intervention.technicianName.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesPriority && matchesStatus && matchesTimeframe && matchesSearch;
  });

  const getPriorityBadge = (priority: string) => {
    const colorClasses = {
      'Haute': 'bg-red-100 text-red-800 border-red-200',
      'Moyenne': 'bg-orange-100 text-orange-800 border-orange-200',
      'Basse': 'bg-green-100 text-green-800 border-green-200'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses[priority as keyof typeof colorClasses]}`}>
        {priority}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const colorClasses = {
      'En attente': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'En cours': 'bg-blue-100 text-blue-800 border-blue-200',
      'Terminé': 'bg-green-100 text-green-800 border-green-200',
      'Annulé': 'bg-gray-100 text-gray-800 border-gray-200'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses[status as keyof typeof colorClasses]}`}>
        {status}
      </span>
    );
  };

  const getUrgencyIndicator = (urgency: string) => {
    const indicators = {
      overdue: '🔴',
      urgent: '🟠',
      high: '🟡',
      medium: '🟢',
      normal: '⚪'
    };

    return (
      <span className="text-lg" title={`Urgence: ${urgency}`}>
        {indicators[urgency as keyof typeof indicators]}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `En retard (${Math.abs(diffDays)}j)`;
    } else if (diffDays === 0) {
      return 'Aujourd\'hui';
    } else if (diffDays === 1) {
      return 'Demain';
    } else {
      return `Dans ${diffDays} jours`;
    }
  };

  // Gestion du formulaire
  const handleOpenModal = () => {
    setForm({
      equipment_id: '',
      description: '',
      intervention_date: '',
      priority: 'Moyenne',
      estimated_duration: '',
      technician_id: ''
    });
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };
  const handleCloseModal = () => {
    setShowModal(false);
    setError(null);
    setSuccess(null);
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (!form.equipment_id || !form.description || !form.intervention_date) {
        setError('Veuillez remplir tous les champs obligatoires.');
        setLoading(false);
        return;
      }
      await createMaintenanceIntervention({
        equipment_id: form.equipment_id,
        description: form.description,
        intervention_date: form.intervention_date,
        priority: form.priority as any,
        estimated_duration: form.estimated_duration ? Number(form.estimated_duration) : undefined,
        technician_id: form.technician_id || undefined
      });
      setSuccess('Intervention créée avec succès !');
      setTimeout(() => {
        setShowModal(false);
        window.location.reload(); // Pour rafraîchir la liste (à améliorer plus tard)
      }, 1000);
    } catch (err: any) {
      setError('Erreur lors de la création : ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Statistiques globales */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{stats.today}</div>
          <div className="text-xs text-gray-600">Aujourd'hui</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{stats.thisWeek}</div>
          <div className="text-xs text-gray-600">Cette semaine</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          <div className="text-xs text-gray-600">En retard</div>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Toutes priorités</option>
            <option value="Haute">Haute</option>
            <option value="Moyenne">Moyenne</option>
            <option value="Basse">Basse</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Tous statuts</option>
            <option value="En attente">En attente</option>
            <option value="En cours">En cours</option>
            <option value="Terminé">Terminé</option>
            <option value="Annulé">Annulé</option>
          </select>

          <select
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Toutes périodes</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="overdue">En retard</option>
          </select>
        </div>

        <input
          type="text"
          placeholder="Rechercher une intervention..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Liste des interventions */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredInterventions.map((intervention: any, index: number) => (
          <div key={intervention.id || index} className={`p-3 border rounded-lg transition-colors ${
            intervention.isOverdue ? 'border-red-200 bg-red-50' :
            intervention.isToday ? 'border-orange-200 bg-orange-50' :
            'border-gray-200 hover:bg-gray-50'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {getUrgencyIndicator(intervention.urgency)}
                  <h4 className="font-medium text-sm text-gray-900 truncate">
                    {intervention.equipmentName}
                  </h4>
                  {getPriorityBadge(intervention.priority)}
                  {getStatusBadge(intervention.status)}
                </div>

                <div className="text-xs text-gray-600 space-y-1">
                  <div>{intervention.description}</div>
                  <div className="flex items-center gap-4">
                    <span>👨🔧 {intervention.technicianName}</span>
                    <span>📅 {formatDate(intervention.intervention_date)}</span>
                    {intervention.estimated_duration && (
                      <span>⏱️ {intervention.estimated_duration}h</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions rapides */}
              <div className="flex flex-col gap-1 ml-3">
                {intervention.status === 'En attente' && (
                  <>
                    <button className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Démarrer">
                      <Play className="h-4 w-4" />
                    </button>
                    <button className="p-1 text-green-600 hover:bg-green-100 rounded" title="Terminer">
                      <Check className="h-4 w-4" />
                    </button>
                  </>
                )}
                {intervention.status === 'En cours' && (
                  <button className="p-1 text-green-600 hover:bg-green-100 rounded" title="Terminer">
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="Modifier">
                  <Edit className="h-4 w-4" />
                </button>
                <button className="p-1 text-red-600 hover:bg-red-100 rounded" title="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Message si aucun résultat */}
      {filteredInterventions.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          <div className="text-sm">Aucune intervention trouvée</div>
        </div>
      )}

      {/* Actions globales */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
        <button className="text-sm text-orange-600 hover:text-orange-700 font-medium">
          Voir toutes les interventions
        </button>
        <button
          className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          onClick={handleOpenModal}
        >
          + Nouvelle intervention
        </button>
      </div>

      {/* Modale de création d'intervention */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
              <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-700"
              onClick={handleCloseModal}
              >
              ✕
              </button>
            <h3 className="text-lg font-semibold mb-4">Nouvelle intervention</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Équipement *</label>
                <select
                  name="equipment_id"
                  value={form.equipment_id}
                  onChange={handleChange}
                  className="w-full border rounded px-2 py-1"
                  required
                >
                  <option value="">Sélectionner...</option>
                  {/* À remplacer par la vraie liste d'équipements */}
                  <option value="1">Pelle hydraulique CAT 320</option>
                  <option value="2">Chargeur frontal JCB 3CX</option>
                  <option value="3">Bulldozer CAT D6</option>
                </select>
            </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description *</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="w-full border rounded px-2 py-1"
                  required
                />
                  </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date d'intervention *</label>
                <input
                  type="date"
                  name="intervention_date"
                  value={form.intervention_date}
                  onChange={handleChange}
                  className="w-full border rounded px-2 py-1"
                  required
                />
                  </div>
              <div>
                <label className="block text-sm font-medium mb-1">Priorité</label>
                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="w-full border rounded px-2 py-1"
                >
                  <option value="Haute">Haute</option>
                  <option value="Moyenne">Moyenne</option>
                  <option value="Basse">Basse</option>
                </select>
                      </div>
                      <div>
                <label className="block text-sm font-medium mb-1">Durée estimée (heures)</label>
                <input
                  type="number"
                  name="estimated_duration"
                  value={form.estimated_duration}
                  onChange={handleChange}
                  className="w-full border rounded px-2 py-1"
                  min="1"
                />
                      </div>
                    <div>
                <label className="block text-sm font-medium mb-1">Technicien assigné</label>
                <select
                  name="technician_id"
                  value={form.technician_id}
                  onChange={handleChange}
                  className="w-full border rounded px-2 py-1"
                >
                  <option value="">Non assigné</option>
                  {/* À remplacer par la vraie liste de techniciens */}
                  <option value="1">Mohammed Alami</option>
                  <option value="2">Ahmed Benali</option>
                  <option value="3">Karim El Fassi</option>
                </select>
            </div>
              {error && <div className="text-red-600 text-sm">{error}</div>}
              {success && <div className="text-green-600 text-sm">{success}</div>}
              <button
                type="submit"
                className="w-full bg-orange-600 text-white py-2 rounded hover:bg-orange-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Création...' : 'Créer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
