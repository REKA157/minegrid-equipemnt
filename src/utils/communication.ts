import { useCallback } from 'react';

type MessageType = 'SMS' | 'EMAIL' | 'TEAM' | 'NOTIFICATION';

export function useCommunicationService() {
  const sendMessage = useCallback(async (type: MessageType, recipient: string, content: string) => {
    void type; void recipient; void content; // ne JAMAIS logger destinataire/contenu (PII)
    try {
      // Simulation d'envoi (aucun canal réel branché en prod).
      await new Promise(resolve => setTimeout(resolve, 300));
      return { success: true, messageId: Date.now().toString() };
    } catch (error) {
      console.error('Communication error:', error);
      throw error;
    }
  }, []);

  const sendBulkMessage = useCallback(async (type: MessageType, recipients: string[], content: string) => {
    try {
      console.log(`Sending bulk ${type} to ${recipients.length} recipients:`, content);
      
      // Simulation d'envoi en masse
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return { 
        success: true, 
        sent: recipients.length,
        messageIds: recipients.map(() => Date.now().toString())
      };
    } catch (error) {
      console.error('Bulk communication error:', error);
      throw error;
    }
  }, []);

  return { sendMessage, sendBulkMessage };
} 