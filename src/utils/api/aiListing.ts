import { askAssistant } from './aiAssistant';

// Génère un VRAI titre + une VRAIE description d'annonce via l'IA connectée de
// la société (fonction serveur ai-proxy). Aucune caractéristique inventée : on
// ne fournit que les infos saisies. Remplace le collage de specs « survendu IA ».

export interface ListingInput {
  brand?: string;
  model?: string;
  year?: number | string;
  price?: number | string;
  category?: string;
  condition?: string;
  /** Caractéristiques déjà connues (texte libre), ex. « Poids 21 t · 122 kW ». */
  specs?: string;
}

export interface ListingCopy {
  ok: boolean;
  title?: string;
  description?: string;
  error?: string;
}

export async function generateListingCopy(m: ListingInput): Promise<ListingCopy> {
  const infos = [
    m.brand && `- Marque : ${m.brand}`,
    m.model && `- Modèle : ${m.model}`,
    m.year && `- Année : ${m.year}`,
    m.category && `- Catégorie : ${m.category}`,
    m.condition && `- État : ${m.condition}`,
    m.price && `- Prix : ${m.price}`,
    m.specs && `- Caractéristiques : ${m.specs}`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt =
    `Rédige une annonce de vente pour cet engin de chantier/minier, à partir UNIQUEMENT des infos ci-dessous ` +
    `(n'invente aucune caractéristique). Réponds EXACTEMENT dans ce format :\n` +
    `TITRE: <titre court et vendeur, max 70 caractères>\n` +
    `DESCRIPTION:\n<3 à 5 phrases en français, claires et professionnelles, qui mettent l'engin en valeur pour un acheteur pro>\n\n` +
    `Infos :\n${infos}`;

  const res = await askAssistant([
    {
      role: 'system',
      content:
        "Tu es un expert de la rédaction d'annonces d'engins de chantier et miniers. Style clair, professionnel, honnête. N'invente jamais de caractéristique non fournie.",
    },
    { role: 'user', content: prompt },
  ]);

  if (!res.ok) return { ok: false, error: res.error || 'Génération impossible.' };

  const text = (res.reply || '').trim();
  const titleMatch = text.match(/TITRE\s*:\s*(.+)/i);
  const title = titleMatch?.[1]?.trim();
  const afterDesc = text.split(/DESCRIPTION\s*:/i)[1];
  const description = (afterDesc ?? text).trim();

  return { ok: true, title, description };
}
