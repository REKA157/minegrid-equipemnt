import React from 'react';
import { Truck, PenTool as Tools, Shield, Clock, Wrench, BookOpen, HeartHandshake, HardHat, Wallet } from 'lucide-react';

interface ServicesProps {
  service?: string;
}
const serviceGroups: { [key: string]: string[] } = {
  financement: ['financement', 'location-horaire'],
  maintenance: ['maintenance-réparation', 'installation-configuration'],
  formation: ['formation-certification', 'conseil-expertise'],
  support: ['garantie-assurance', 'securite-conformite','transport-livraison']
};

const services = [
  {
    id: 'financement',
    icon: Wallet,
    title: 'Financement',
    description: 'Solutions de financement pour l’acquisition de vos équipements',
    details: [
      'Crédit-bail et leasing',
      'Financement à taux préférentiel',
      'Partenariats bancaires',
      'Accompagnement personnalisé'
    ]
  },
  
  {
    id: 'transport-livraison',
    icon: Truck,
    title: 'Transport & Livraison',
    description: 'Service de transport sécurisé et livraison rapide partout en Afrique',
    details: [
      'Transport international et domestique',
      'Suivi en temps réel',
      'Assurance transport incluse',
      'Documentation douanière complète'
    ]
  },
  {
    id: 'maintenance-réparation',
    icon: Tools,
    title: 'Maintenance & Réparation',
    description: 'Équipe technique qualifiée pour l\'entretien et la réparation de vos équipements',
    details: [
      'Maintenance préventive',
      'Réparations d\'urgence',
      'Diagnostics avancés',
      'Pièces d\'origine garanties'
    ]
  },
  {
    id: 'garantie-assurance',
    icon: Shield,
    title: 'Garantie & Assurance',
    description: 'Protection complète de vos investissements avec nos garanties étendues',
    details: [
      'Garantie constructeur',
      'Extensions de garantie',
      'Assurance tous risques',
      'Support juridique'
    ]
  },
  {
    id: 'location-horaire',
    icon: Clock,
    title: 'Location Horaire',
    description: 'Solutions de location flexibles adaptées à vos besoins temporaires',
    details: [
      'Location courte durée',
      'Location longue durée',
      'Options d\'achat',
      'Maintenance incluse'
    ]
  },
  {
    id: 'installation-configuration',
    icon: Wrench,
    title: 'Installation & Configuration',
    description: 'Service complet d\'installation et de mise en service de vos équipements',
    details: [
      'Installation sur site',
      'Configuration personnalisée',
      'Formation initiale',
      'Tests de performance'
    ]
  },
  {
    id: 'formation-certification',
    icon: BookOpen,
    title: 'Formation & Certification',
    description: 'Programmes de formation pour vos opérateurs et techniciens',
    details: [
      'Formation théorique',
      'Formation pratique',
      'Certification officielle',
      'Mise à niveau régulière'
    ]
  },
  {
    id: 'conseil-expertise',
    icon: HeartHandshake,
    title: 'Conseil & Expertise',
    description: 'Accompagnement personnalisé pour optimiser vos opérations',
    details: [
      'Audit technique',
      'Optimisation des coûts',
      'Études de faisabilité',
      'Recommandations stratégiques'
    ]
  },
  {
    id: 'sécurité-conformité',
    icon: HardHat,
    title: 'Sécurité & Conformité',
    description: 'Services de mise en conformité et audit de sécurité',
    details: [
      'Inspections régulières',
      'Mise aux normes',
      'Documentation technique',
      'Protocoles de sécurité'
    ]
  }
];

export default function Services({ service }: ServicesProps) {
  const [selectedService, setSelectedService] = React.useState<string | null>(null);
  const filteredServices = service && serviceGroups[service]
  ? services.filter((s) => serviceGroups[service].includes(s.id))
  : services;


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Nos Services</h1>
        <p className="text-xl max-w-3xl mx-auto">
          Une gamme complète de services professionnels pour répondre à tous vos besoins en équipements miniers et de construction
        </p>
      </div>
      
      <div className="grid w-full gap-4 sm:gap-6 lg:gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
  {filteredServices.map((srv) => {
    const Icon = srv.icon;
    const isOpen = selectedService === srv.id;
    return (
      <div 
        key={srv.id}
        className="bg-white p-5 sm:p-6 rounded-lg border border-gray-100 shadow-md transition-all duration-300 hover:shadow-lg flex flex-col"
      >
        <Icon className="h-10 w-10 sm:h-12 sm:w-12 mb-3 sm:mb-4 mx-auto" />
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-center leading-tight">{srv.title}</h3>
        <p className="text-center text-sm sm:text-base mb-4">{srv.description}</p>

        <button
          type="button"
          className="mt-auto w-full bg-orange-100 px-4 py-2.5 rounded-md hover:bg-orange-200 transition-colors text-orange-700 text-sm sm:text-base font-medium"
          onClick={() => setSelectedService(isOpen ? null : srv.id)}
          aria-expanded={isOpen}
        >
          {isOpen ? 'Masquer les détails' : 'En savoir plus'}
        </button>

        <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[28rem] sm:max-h-96' : 'max-h-0'}`}>
          <ul className="mt-4 space-y-2 text-sm sm:text-base">
            {srv.details.map((detail, idx) => (
              <li key={idx} className="flex items-start leading-relaxed">
                <div className="w-2 h-2 bg-gray-300 rounded-full mr-2 mt-2"></div>
                {detail}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  })}
</div>


      <div className="mt-16 bg-white rounded-xl p-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Service Sur Mesure</h2>
          <p className="mb-6">
            Vous avez des besoins spécifiques ? Notre équipe d'experts est là pour créer une solution adaptée à vos exigences particulières.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#contact"
              className="inline-block bg-gray-900 text-white px-8 py-3 rounded-md hover:bg-gray-800 transition-colors"
            >
              Nous Contacter
            </a>
            <a
              href="tel:+212XXXXXXXX"
              className="inline-block bg-gray-100 px-8 py-3 rounded-md hover:bg-gray-200 transition-colors"
            >
              Appeler Maintenant
            </a>
          </div>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Pourquoi Nous Choisir ?</h3>
          <ul className="space-y-3">
            <li className="flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              Service garanti 100%
            </li>
            <li className="flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Disponibilité 24/7
            </li>
            <li className="flex items-center">
              <Tools className="h-5 w-5 mr-2" />
              Experts certifiés
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Zone de Couverture</h3>
          <ul className="space-y-3">
            <li className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Afrique de l'Ouest
            </li>
            <li className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Afrique Centrale
            </li>
            <li className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Afrique du Nord
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Certifications</h3>
          <ul className="space-y-3">
            <li className="flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              ISO 9001:2015
            </li>
            <li className="flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              ISO 14001:2015
            </li>
            <li className="flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              OHSAS 18001
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}