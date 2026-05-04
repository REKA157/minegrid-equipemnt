import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

export interface ContactMessagePayload {
  name: string;
  email: string;
  company?: string | null;
  subject: string;
  message: string;
  service?: string | null;
}

export interface SubmittedContactMessage extends ContactMessagePayload {
  id: string;
  created_at: string;
}

/**
 * Insère un message de contact dans la table `contact_messages` de Supabase.
 *
 * Attendu côté base :
 *   create table contact_messages (
 *     id          uuid primary key default gen_random_uuid(),
 *     name        text not null,
 *     email       text not null,
 *     company     text,
 *     subject     text not null,
 *     message     text not null,
 *     service     text,
 *     created_at  timestamptz default now()
 *   );
 *   -- + policy "anon can insert"
 *
 * Pas de fallback : si l'insert échoue, on throw pour que le composant
 * puisse afficher une erreur franche à l'utilisateur (pas de "faux succès").
 */
export async function submitContactMessage(
  payload: ContactMessagePayload,
): Promise<SubmittedContactMessage> {
  const cleaned: ContactMessagePayload = {
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    company: payload.company?.trim() || null,
    subject: payload.subject.trim(),
    message: payload.message.trim(),
    service: payload.service?.trim() || null,
  };

  await supabaseCall(
    () => supabase.from('contact_messages').insert(cleaned),
    { label: 'submitContactMessage' },
  );

  // On evite .select() apres insert pour ne pas exiger une policy SELECT
  // cote anon/public. Le front n'a besoin que d'un accusé de reception.
  return {
    ...cleaned,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
}
