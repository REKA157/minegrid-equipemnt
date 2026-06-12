import React, { useState } from 'react';
import { usePermissions } from '../../../utils/permissions';
import supabase from '../../../utils/supabaseClient';
import {
  Archive,
  Eye,
  MessageSquare,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from '../../../utils/toast';
export function MessagesTab({ messages, onRefresh }: { messages: any[], onRefresh: () => Promise<void> }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showViewMessageModal, setShowViewMessageModal] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  

  
  // Vérifier les permissions
  const { permissions } = usePermissions();

  const handleViewMessage = (message: any) => {
    setSelectedMessage(message);
    setShowViewMessageModal(true);
  };

  const handleReplyToMessage = (message: any) => {
    setSelectedMessage(message);
    setShowReplyModal(true);
    setReplyText('');
  };

  const handleArchiveMessageModal = (message: any) => {
    setSelectedMessage(message);
    setShowArchiveModal(true);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedMessage) return;

    try {
      // Obtenir l'utilisateur actuel
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Utilisateur non connecté');
      }

      // 1. Sauvegarder la réponse dans la base de données
      const { data: replyData, error: replyError } = await supabase
        .from('messages')
        .insert({
          sender_email: user.email,
          sender_name: user.user_metadata?.full_name || 'Utilisateur',
          recipient_email: selectedMessage.sender_email,
          subject: `Réponse - ${selectedMessage.subject || 'Demande d\'information'}`,
          message: replyText,
          parent_message_id: selectedMessage.id,
          status: 'new'
        })
        .select()
        .single();

      if (replyError) throw replyError;

      // 2. Envoyer l'email de réponse via la fonction Edge (même mécanisme que MachineDetail)
      const { data: emailData, error: emailError } = await supabase.functions.invoke('send-contact-email', {
        body: {
          to: selectedMessage.sender_email,
          from: 'contact@minegrid-equipment.com',
          subject: `Réponse - ${selectedMessage.subject || 'Demande d\'information'}`,
          html: `
            <h2>Réponse à votre demande</h2>
            <p><strong>Message original :</strong></p>
            <p>${selectedMessage.message}</p>
            <hr>
            <p><strong>Notre réponse :</strong></p>
            <p>${replyText.replace(/\n/g, '<br>')}</p>
            <hr>
            <p>Cordialement,<br>L'équipe Minegrid Équipement</p>
          `,
          verifiedReplyToOriginalMessageId: selectedMessage.id,
          messageId: replyData.id
        }
      });

      // 3. Créer une notification interne pour l'utilisateur destinataire
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_email: selectedMessage.sender_email,
          title: 'Nouvelle réponse reçue',
          message: `Vous avez reçu une réponse à votre message "${selectedMessage.subject || 'Demande d\'information'}"`,
          type: 'message_reply',
          data: {
            original_message_id: selectedMessage.id,
            reply_message_id: replyData.id,
            sender_email: user.email,
            sender_name: user.user_metadata?.full_name || 'Utilisateur'
          },
          read: false
        });

      // 4. Mettre à jour le statut du message original
      const { error: updateError } = await supabase
        .from('messages')
        .update({ status: 'replied' })
        .eq('id', selectedMessage.id);

      // 5. Mettre à jour le statut de la réponse
      if (replyData.id) {
        const { error: replyUpdateError } = await supabase
          .from('messages')
          .update({ 
            status: emailError ? 'failed' : 'sent',
            sent_at: emailError ? null : new Date().toISOString(),
            error_message: emailError ? emailError.message : null
          })
          .eq('id', replyData.id);
      }

      if (replyError) throw replyError;
      if (emailError) console.error('Erreur email:', emailError);
      if (notificationError) console.error('Erreur notification:', notificationError);
      if (updateError) console.error('Erreur mise à jour:', updateError);

      // Succès
      setReplyText('');
      setSelectedMessage(null);
      await onRefresh();
      
      // Afficher notification de succès
      if (emailError) {
        toast('Réponse sauvegardée mais erreur d\'envoi email. Le destinataire recevra une notification interne.');
      } else {
        toast('Réponse envoyée avec succès !');
      }

    } catch (error) {
      console.error('Erreur lors de l\'envoi de la réponse:', error);
      toast('Erreur lors de l\'envoi de la réponse');
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('id', messageId);

      if (error) {
        console.error('Erreur marquage lu:', error);
      } else {
        await onRefresh();
      }
    } catch (error) {
      console.error('Erreur marquage lu:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) return;

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Erreur suppression message:', error);
      } else {
        await onRefresh();
      }
    } catch (error) {
      console.error('Erreur suppression message:', error);
    }
  };

  const handleArchiveMessage = async (messageId: string) => {
    try {
      setArchiveLoading(true);
      const { error } = await supabase
        .from('messages')
        .update({ status: 'archived' })
        .eq('id', messageId);

      if (error) {
        console.error('Erreur archivage message:', error);
      } else {
        await onRefresh();
        setShowArchiveModal(false);
      }
    } catch (error) {
      console.error('Erreur archivage message:', error);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleArchiveSelectedMessages = async () => {
    const selectedMessages = filteredMessages.filter(msg => msg.selected);
    if (selectedMessages.length === 0) return;

    try {
      setArchiveLoading(true);
      const messageIds = selectedMessages.map(msg => msg.id);
      
      const { error } = await supabase
        .from('messages')
        .update({ status: 'archived' })
        .in('id', messageIds);

      if (error) {
        console.error('Erreur archivage messages:', error);
      } else {
        await onRefresh();
      }
    } catch (error) {
      console.error('Erreur archivage messages:', error);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleDeleteSelectedMessages = async () => {
    const selectedMessages = filteredMessages.filter(msg => msg.selected);
    if (selectedMessages.length === 0) return;

    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${selectedMessages.length} message(s) ?`)) return;

    try {
      const messageIds = selectedMessages.map(msg => msg.id);
      
      const { error } = await supabase
        .from('messages')
        .delete()
        .in('id', messageIds);

      if (error) {
        console.error('Erreur suppression messages:', error);
      } else {
        await onRefresh();
      }
    } catch (error) {
      console.error('Erreur suppression messages:', error);
    }
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'read': return 'bg-gray-100 text-gray-800';
      case 'replied': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-orange-100 text-orange-800';
      case 'archived': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'new': return 'Nouveau';
      case 'read': return 'Lu';
      case 'replied': return 'Répondu';
      case 'sent': return 'Envoyé';
      case 'archived': return 'Archivé';
      default: return 'Inconnu';
    }
  };

  const filteredMessages = messages.filter(message => {
    const matchesSearch = 
      message.sender_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.sender_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.machine?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || message.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Messages</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un message..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="new">Nouveaux</option>
            <option value="read">Lus</option>
            <option value="replied">Répondus</option>
            <option value="sent">Envoyés</option>
            <option value="archived">Archivés</option>
          </select>
        </div>
        

      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      <input
                      type="checkbox"
                      onChange={(e) => {
                        // Fonctionnalité de sélection multiple non implémentée pour l'instant
                        console.log('Sélection multiple:', e.target.checked);
                      }}
                      className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                    />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expéditeur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Équipement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Message
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
              {filteredMessages.map((message) => (
                <tr key={message.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(e) => {
                        // Fonctionnalité de sélection individuelle non implémentée pour l'instant
                        console.log('Sélection message:', message.id, e.target.checked);
                      }}
                      className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {message.sender_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {message.sender_email}
                      </div>
                      {message.sender_phone && (
                        <div className="text-sm text-gray-500">
                          {message.sender_phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {message.machine ? (
                      <div className="flex items-center">
                        {message.machine.images && message.machine.images[0] && (
                          <img
                            src={message.machine.images[0]}
                            alt={message.machine.name}
                            className="h-8 w-8 rounded object-cover mr-3"
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {message.machine.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {message.machine.brand} {message.machine.model}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Équipement supprimé</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {message.message}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(message.status)}`}>
                      {getStatusText(message.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(message.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-0.5 flex-wrap">
                      {/* Onglet Voir */}
                      <button
                        onClick={() => handleViewMessage(message)}
                        className="p-0.5 text-xs bg-orange-100 text-orange-700 rounded border border-orange-200 hover:bg-orange-200 transition-colors min-w-0"
                        title="Voir le message"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                      
                      {/* Onglet Répondre */}
                      <button
                        onClick={() => handleReplyToMessage(message)}
                        className="p-0.5 text-xs bg-orange-100 text-orange-700 rounded border border-orange-200 hover:bg-orange-200 transition-colors min-w-0"
                        title="Répondre au message"
                      >
                        <MessageSquare className="h-3 w-3" />
                      </button>
                      
                      {/* Onglet Archiver */}
                      <button
                        onClick={() => handleArchiveMessageModal(message)}
                        className="p-0.5 text-xs bg-orange-100 text-orange-700 rounded border border-orange-200 hover:bg-orange-200 transition-colors min-w-0"
                        title="Archiver le message"
                      >
                        <Archive className="h-3 w-3" />
                      </button>
                      
                      {/* Onglet Supprimer */}
                      <button
                        onClick={() => handleDeleteMessage(message.id)}
                        className="p-0.5 text-xs bg-orange-100 text-orange-700 rounded border border-orange-200 hover:bg-orange-200 transition-colors min-w-0"
                        title="Supprimer le message"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de visualisation du message */}
      {showViewMessageModal && selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Détails du message</h2>
              <button
                onClick={() => setShowViewMessageModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  De : {selectedMessage.sender_name}
                </h3>
                <p className="text-sm text-gray-600 mb-1">
                  Email : {selectedMessage.sender_email}
                </p>
                {selectedMessage.sender_phone && (
                  <p className="text-sm text-gray-600 mb-1">
                    Téléphone : {selectedMessage.sender_phone}
                  </p>
                )}
                <p className="text-sm text-gray-600">
                  Date : {new Date(selectedMessage.created_at).toLocaleString()}
                </p>
              </div>

              {selectedMessage.machine && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Équipement concerné</h4>
                  <div className="flex items-center">
                    {selectedMessage.machine.images && selectedMessage.machine.images[0] && (
                      <img
                        src={selectedMessage.machine.images[0]}
                        alt={selectedMessage.machine.name}
                        className="h-12 w-12 rounded object-cover mr-3"
                      />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{selectedMessage.machine.name}</p>
                      <p className="text-sm text-gray-600">
                        {selectedMessage.machine.brand} {selectedMessage.machine.model}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-2">Message</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-900 whitespace-pre-wrap">{selectedMessage.message}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 p-6 border-t">
              <button
                onClick={() => setShowViewMessageModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Fermer
              </button>
              {(permissions?.isAdmin || permissions?.isManager || permissions?.isTechnician) && (
                <button
                  onClick={() => {
                    setShowViewMessageModal(false);
                    handleReplyToMessage(selectedMessage);
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Répondre
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de réponse */}
      {showReplyModal && selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Répondre au message</h2>
              <button
                onClick={() => setShowReplyModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSendReply} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Répondre à : {selectedMessage.sender_name}
                </label>
                <p className="text-sm text-gray-600 mb-4">
                  Message original : {selectedMessage.message.substring(0, 100)}...
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Votre réponse *
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={6}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Tapez votre réponse..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowReplyModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={replyLoading || !replyText.trim()}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {replyLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Envoi...
                    </>
                  ) : (
                    'Envoyer la réponse'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal d'archivage */}
      {showArchiveModal && selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Archiver le message</h2>
              <button
                onClick={() => setShowArchiveModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center">
                <Archive className="h-8 w-8 text-orange-600 mr-3" />
                <div>
                  <h3 className="font-medium text-gray-900">Confirmer l'archivage</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Êtes-vous sûr de vouloir archiver ce message ? Il sera déplacé dans les archives.
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-900 font-medium">Message :</p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedMessage.message.substring(0, 150)}...
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowArchiveModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleArchiveMessage(selectedMessage.id)}
                  disabled={archiveLoading}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {archiveLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Archivage...
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4 mr-2" />
                      Archiver
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
