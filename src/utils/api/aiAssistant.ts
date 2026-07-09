import supabase from '../supabaseClient';

// Appelle la fonction serveur `ai-proxy` qui utilise la clé IA de la société
// (lue côté serveur) pour faire répondre l'assistant. La clé n'est jamais
// manipulée côté navigateur.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AiProxyResult {
  ok: boolean;
  reply?: string;
  provider?: string;
  error?: string;
  code?: string;
}

async function callAiProxy(body: Record<string, unknown>): Promise<AiProxyResult> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', { body });

  if (error) {
    // La fonction renvoie un statut non-2xx sur erreur : on récupère le message
    // dans le corps de la réponse quand c'est possible.
    let msg = error.message || 'Erreur de l’assistant IA.';
    let code: string | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const b = await ctx.json();
        if (b?.error) msg = b.error;
        code = b?.code;
      }
    } catch {
      /* corps illisible : on garde le message générique */
    }
    return { ok: false, error: msg, code };
  }

  if (data?.error) return { ok: false, error: data.error, code: data.code };
  return { ok: true, reply: data?.reply, provider: data?.provider };
}

/** Test de connexion : petit appel réel au fournisseur configuré. */
export async function testAiConnection(): Promise<AiProxyResult> {
  return callAiProxy({ action: 'ping' });
}

/** Envoie une conversation et récupère la réponse de l'assistant. */
export async function askAssistant(messages: ChatMessage[]): Promise<AiProxyResult> {
  return callAiProxy({ action: 'chat', messages });
}

/** Rédige un brouillon de réponse à un message client (via l'IA connectée). */
export async function draftClientReply(msg: {
  message: string;
  senderName?: string;
  type?: string;
}): Promise<{ ok: boolean; reply?: string; error?: string; code?: string }> {
  const prompt =
    "Rédige une réponse professionnelle et chaleureuse, en français, au message d'un client ci-dessous, " +
    "de la part d'un vendeur d'engins de chantier/miniers sur MineGrid. Sois concret et courtois, et propose " +
    "une suite (appel, visite, devis). Donne UNIQUEMENT le texte de la réponse, sans préambule.\n\n" +
    (msg.senderName ? `Client : ${msg.senderName}\n` : '') +
    (msg.type ? `Type de demande : ${msg.type}\n` : '') +
    `Message reçu :\n"""${msg.message}"""`;
  return askAssistant([{ role: 'user', content: prompt }]);
}
