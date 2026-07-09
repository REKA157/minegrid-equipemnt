import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  Clock, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  Truck, 
  Wrench, 
  Users,
  Edit,
  Trash2,
  CheckCircle,
  X
} from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { PLANNING_EVENTS_COLUMNS } from '../constants/apiQueryFields';
import { toast } from '../utils/toast';
import BackToDashboardButton from '../components/common/BackToDashboardButton';
interface PlanningEvent {
  id?: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  type: 'rendez-vous' | 'livraison' | 'intervention' | 'maintenance';
  status: 'planifié' | 'en cours' | 'terminé' | 'annulé';
  priority: 'basse' | 'normale' | 'haute' | 'urgente';
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  location: string;
  assignedTo: string;
  notes: string;
  user_id?: string;
  created_at?: string;
}

export default function PlanningPro() {
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PlanningEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filter, setFilter] = useState<'all' | 'rendez-vous' | 'livraison' | 'intervention' | 'maintenance'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('planning_events')
        .select(PLANNING_EVENTS_COLUMNS)
        .eq('user_id', user.id)
        .order('startDate', { ascending: true });

      if (error) {
        console.error('Erreur chargement événements:', error);
        return;
      }

      setEvents(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveEvent = async (event: PlanningEvent) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast('Vous devez être connecté');
        return;
      }

      const eventToSave = {
        ...event,
        user_id: user.id,
        created_at: new Date().toISOString()
      };

      let result;
      if (event.id) {
        result = await supabase
          .from('planning_events')
          .update(eventToSave)
          .eq('id', event.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from('planning_events')
          .insert(eventToSave)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Erreur sauvegarde événement:', result.error);
        toast('Erreur lors de la sauvegarde');
        return;
      }

      await loadEvents();
      setShowForm(false);
      setEditingEvent(null);
      toast('Événement sauvegardé avec succès !');
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la sauvegarde');
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) return;

    try {
      const { error } = await supabase
        .from('planning_events')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erreur suppression:', error);
        toast('Erreur lors de la suppression');
        return;
      }

      await loadEvents();
      toast('Événement supprimé avec succès !');
    } catch (error) {
      console.error('Erreur:', error);
      toast('Erreur lors de la suppression');
    }
  };

  const updateEventStatus = async (id: string, status: PlanningEvent['status']) => {
    try {
      const { error } = await supabase
        .from('planning_events')
        .update({ status })
        .eq('id', id);

      if (error) {
        console.error('Erreur mise à jour statut:', error);
        return;
      }

      await loadEvents();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const getTypeIcon = (type: PlanningEvent['type']) => {
    switch (type) {
      case 'rendez-vous': return <User className="h-4 w-4" />;
      case 'livraison': return <Truck className="h-4 w-4" />;
      case 'intervention': return <Wrench className="h-4 w-4" />;
      case 'maintenance': return <Wrench className="h-4 w-4" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: PlanningEvent['type']) => {
    switch (type) {
      case 'rendez-vous': return 'bg-blue-100 text-blue-800';
      case 'livraison': return 'bg-green-100 text-green-800';
      case 'intervention': return 'bg-orange-100 text-orange-800';
      case 'maintenance': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: PlanningEvent['priority']) => {
    switch (priority) {
      case 'basse': return 'bg-gray-100 text-gray-800';
      case 'normale': return 'bg-blue-100 text-blue-800';
      case 'haute': return 'bg-orange-100 text-orange-800';
      case 'urgente': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: PlanningEvent['status']) => {
    switch (status) {
      case 'planifié': return 'bg-yellow-100 text-yellow-800';
      case 'en cours': return 'bg-blue-100 text-blue-800';
      case 'terminé': return 'bg-green-100 text-green-800';
      case 'annulé': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredEvents = events.filter(event => 
    filter === 'all' || event.type === filter
  );

  const EventForm = ({ event, onSave, onCancel }: { 
    event: PlanningEvent; 
    onSave: (event: PlanningEvent) => void; 
    onCancel: () => void; 
  }) => {
    const [formData, setFormData] = useState<PlanningEvent>(event);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSave(formData);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {event.id ? 'Modifier l\'événement' : 'Nouvel événement'}
              </h2>
              <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Titre *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as PlanningEvent['type'] }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  >
                    <option value="rendez-vous">Rendez-vous</option>
                    <option value="livraison">Livraison</option>
                    <option value="intervention">Intervention</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de début *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.startDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de fin *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.endDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priorité
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as PlanningEvent['priority'] }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Statut
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as PlanningEvent['status'] }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="planifié">Planifié</option>
                    <option value="en cours">En cours</option>
                    <option value="terminé">Terminé</option>
                    <option value="annulé">Annulé</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du client
                  </label>
                  <input
                    type="text"
                    value={formData.clientName}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={formData.clientPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientPhone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.clientEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assigné à
                  </label>
                  <input
                    type="text"
                    value={formData.assignedTo}
                    onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lieu
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

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
                Mon planning
              </h1>
            </div>
            <button
              onClick={() => {
                setEditingEvent({
                  title: '',
                  description: '',
                  startDate: new Date().toISOString().slice(0, 16),
                  endDate: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
                  type: 'rendez-vous',
                  status: 'planifié',
                  priority: 'normale',
                  clientName: '',
                  clientPhone: '',
                  clientEmail: '',
                  location: '',
                  assignedTo: '',
                  notes: ''
                });
                setShowForm(true);
              }}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouvel événement
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtres */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all' 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilter('rendez-vous')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'rendez-vous' 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Rendez-vous
            </button>
            <button
              onClick={() => setFilter('livraison')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'livraison' 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Livraisons
            </button>
            <button
              onClick={() => setFilter('intervention')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'intervention' 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Interventions
            </button>
            <button
              onClick={() => setFilter('maintenance')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'maintenance' 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Maintenance
            </button>
          </div>
        </div>

        {/* Liste des événements */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Événements ({filteredEvents.length})
            </h2>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">Chargement...</p>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Aucun événement trouvé</p>
                <p className="text-sm">Créez votre premier événement pour commencer</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEvents.map((event) => (
                  <div key={event.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className={`p-1 rounded ${getTypeColor(event.type)}`}>
                            {getTypeIcon(event.type)}
                          </div>
                          <h3 className="font-semibold text-gray-900">{event.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(event.priority)}`}>
                            {event.priority}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                            {event.status}
                          </span>
                        </div>
                        
                        <p className="text-gray-600 text-sm mb-3">{event.description}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center text-gray-600">
                            <Clock className="h-4 w-4 mr-2" />
                            <span>
                              {new Date(event.startDate).toLocaleDateString('fr-FR')} - {new Date(event.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {event.location && (
                            <div className="flex items-center text-gray-600">
                              <MapPin className="h-4 w-4 mr-2" />
                              <span>{event.location}</span>
                            </div>
                          )}
                          {event.clientName && (
                            <div className="flex items-center text-gray-600">
                              <User className="h-4 w-4 mr-2" />
                              <span>{event.clientName}</span>
                            </div>
                          )}
                          {event.assignedTo && (
                            <div className="flex items-center text-gray-600">
                              <Users className="h-4 w-4 mr-2" />
                              <span>{event.assignedTo}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingEvent(event);
                            setShowForm(true);
                          }}
                          className="p-2 text-orange-600 hover:text-orange-800"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id!)}
                          className="p-2 text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        {event.status === 'planifié' && (
                          <button
                            onClick={() => updateEventStatus(event.id!, 'en cours')}
                            className="p-2 text-green-600 hover:text-green-800"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && editingEvent && (
        <EventForm
          event={editingEvent}
          onSave={saveEvent}
          onCancel={() => {
            setShowForm(false);
            setEditingEvent(null);
          }}
        />
      )}
    </div>
  );
} 