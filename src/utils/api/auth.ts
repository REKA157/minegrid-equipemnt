import type { RegisterData } from './types';
import supabase from '../supabaseClient';
import { recordSessionLogout } from './sessions';
import { purgeLocalUserData } from '../scopedStorage';

// -------------------- AUTH --------------------

export async function registerUser(data: RegisterData) {
  const { email, password, ...metadata } = data;

  const { data: response, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  });

  if (error) {
    // Normalise l'erreur pour qu'on puisse l'afficher proprement côté UI.
    console.error('Supabase signUp error:', error);
    throw new Error(error.message || 'Erreur inscription Supabase');
  }
  return response;
}

export async function loginUser(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Normalise l'erreur pour qu'on puisse l'afficher proprement côté UI.
    console.error('Supabase signInWithPassword error:', error);
    throw new Error(error.message || 'Erreur connexion Supabase');
  }
  return data;
}

export async function logoutUser() {
  // Enregistre la déconnexion AVANT signOut (après, auth.uid() est null).
  await recordSessionLogout();
  await supabase.auth.signOut();
  // MG-M04 — Purge des données applicatives locales. Sans elle, le compte
  // suivant sur le même navigateur relit les PII, devis et rôles du précédent.
  // Appelée APRÈS signOut : le SDK gère ses propres clés `sb-*`, que la purge
  // laisse volontairement intactes.
  purgeLocalUserData();
}

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session || !session.user) throw new Error("Session manquante !");
  return session.user;
}
