import { Building2, Upload, FileText, FolderOpen, Mail, LayoutDashboard, Calendar, Sparkles } from 'lucide-react';

// Raccourcis « services » affichés en haut du tableau de bord entreprise.
// L'ordre doit rester aligné sur SERVICE_LINKS (EnterpriseDashboardShell).
export const commonServices = [
  {
    icon: Building2,
    title: 'Ma vitrine entreprise',
    description: 'Votre page publique : logo, présentation, services et machines',
  },
  {
    icon: Upload,
    title: 'Publier une annonce',
    description: 'Mettre en ligne une machine (formulaire ou import Excel)',
  },
  {
    icon: FileText,
    title: 'Créer un devis',
    description: 'Générer un devis professionnel au format PDF',
  },
  {
    icon: FolderOpen,
    title: 'Mes documents',
    description: 'Stocker factures, contrats et fiches techniques',
  },
  {
    icon: Mail,
    title: 'Messagerie',
    description: 'Vos messages et demandes clients au même endroit',
  },
  {
    icon: LayoutDashboard,
    title: 'Tableau de bord',
    description: 'Vue synthétique : machines, vues, demandes, conversions',
  },
  {
    icon: Calendar,
    title: 'Mon planning',
    description: 'Livraisons, rendez-vous et interventions',
  },
  {
    icon: Sparkles,
    title: 'Assistant IA',
    description: 'Génère fiches machine, réponses clients et devis',
  },
];
