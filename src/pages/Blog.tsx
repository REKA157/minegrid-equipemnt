import React, { useMemo } from 'react';
import { Calendar, User, ArrowRight, ArrowLeft } from 'lucide-react';

const ALLOWED_TAGS = new Set(['p','br','b','strong','em','i','ul','ol','li','h1','h2','h3','h4','a','span','div','blockquote']);
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
      return ALLOWED_TAGS.has(tag.toLowerCase()) ? match : '';
    })
    .replace(/\s(on\w+|style)\s*=\s*(['"]).*?\2/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*(javascript:|data:).*?\2/gi, '')
    .replace(/<a\b(?![^>]*\brel=)[^>]*>/gi, (anchorTag) => {
      if (/target\s*=\s*(['"])_blank\1/i.test(anchorTag)) {
        return anchorTag.replace(/>$/, ' rel="noopener noreferrer">');
      }
      return anchorTag;
    });
}

interface BlogProps {
  postId?: string;
}

const blogPosts = [
  {
    id: 1,
    title: "Mine de Goulamina : Une technologie qui transforme l'Afrique",
    excerpt: "Comment une mine malienne devient le symbole de l'innovation minière africaine.",
    content: `
      <p>Dans les plaines du sud du Mali, un projet unique attire l'attention : la mine de lithium de Goulamina.</p>
  
      <p>Ce n’est pas seulement la richesse de ses réserves qui impressionne, mais la manière dont elles sont exploitées. Ici, la technologie est au cœur de chaque décision.</p>
  
      <p>Les camions de transport roulent sans conducteur. Leurs trajectoires sont calculées en temps réel par des logiciels embarqués. Les foreuses, elles, ajustent automatiquement leur pression et leur angle selon la densité de la roche.</p>
  
      <p>En hauteur, des drones autonomes cartographient les volumes extraits, identifient les zones à risque et transmettent des données aux ingénieurs à distance. Grâce à cette supervision aérienne, la mine est gérée avec une précision inédite.</p>
  
      <p>Autre innovation majeure : l’électrification progressive du parc roulant. Les véhicules électriques et hybrides limitent les émissions de gaz, les nuisances sonores et réduisent la dépendance au diesel.</p>
  
      <p>Pourquoi cette mine est-elle si importante ? Parce qu’elle prouve que l’innovation minière peut prendre racine en Afrique. Parce qu’elle devient une référence technique pour d’autres projets au Niger, en RDC ou encore au Maroc.</p>
  
      <p>Goulamina n’est pas une exception. C’est un point de départ. Une démonstration que l’Afrique peut non seulement suivre, mais aussi définir les standards d’une industrie minière plus durable, plus intelligente et plus performante.</p>
    `,
    image: "https://www.lycopodium.com/static/eb91e6e7cdd551f0b461c633ebbd8309/d8255/Goulamina-drone-July-2024-approved-min.jpg",
    date: "2025-05-07",
    author: "Oumar Sidibé",
    category: "Technologie"
  },
  
  {
    id: 2,
    title: "Guide d’Entretien des Équipements de Construction",
    excerpt: "Les clés concrètes pour prolonger la durée de vie de vos machines sur chantier.",
    content: `
      <p>Un équipement bien entretenu, c’est un investissement qui dure. Dans le secteur du BTP, la maintenance n’est pas une option : c’est une stratégie de rentabilité.</p>
  
      <p>Qu’il s’agisse d’une pelle hydraulique, d’un chargeur ou d’un compacteur, chaque machine a ses points faibles. Une fuite d’huile ignorée, un filtre colmaté ou un graissage retardé peuvent coûter des milliers d’euros.</p>
  
      <p><strong>1. L’entretien préventif : votre meilleure assurance</strong></p>
      <p>Planifier les vidanges, remplacer les filtres à intervalles réguliers, contrôler les niveaux... Ces gestes simples prolongent la durée de vie des composants critiques (moteur, vérins, transmission).</p>
  
      <p>Les constructeurs recommandent en moyenne une révision toutes les 250 à 500 heures d’utilisation selon le modèle. Ne pas respecter ces intervalles, c’est risquer l’immobilisation.</p>
  
      <p><strong>2. La lubrification, clé du bon fonctionnement</strong></p>
      <p>La majorité des pannes sur les axes mécaniques viennent d’un manque de graisse ou d’une mauvaise graisse. Il faut adapter le type de lubrifiant à la température, à l’humidité et à l’intensité d’usage.</p>
  
      <p>Un opérateur formé saura détecter un bruit anormal ou une surchauffe à temps. C’est le premier capteur de maintenance.</p>
  
      <p><strong>3. Nettoyer, c’est préserver</strong></p>
      <p>Une machine encrassée, c’est une machine qui souffre. La boue accumulée peut déformer les flexibles, bloquer les vérins, ou obstruer les prises d’air moteur. Un simple lavage régulier peut éviter des casses lourdes.</p>
  
      <p><strong>4. Le carnet d’entretien numérique</strong></p>
      <p>De plus en plus de chantiers adoptent des solutions connectées : capteurs embarqués, alertes SMS, historique de maintenance. Des plateformes comme Fleetguard, CMMS ou JDLink permettent de suivre les entretiens à distance et en temps réel.</p>
  
      <p><strong>5. Exemple concret : une entreprise au Maroc</strong></p>
      <p>L’entreprise Al Maaden Construction a augmenté de 28 % la durée de vie de ses pelles Caterpillar en appliquant un protocole strict : contrôle visuel quotidien, carnet numérique, graissage manuel tous les 2 jours.</p>
  
      <p>Résultat : moins de pannes, une meilleure valeur à la revente, et des équipes plus responsabilisées.</p>
  
      <p><strong>En résumé</strong></p>
      <p>L’entretien, ce n’est pas de la mécanique, c’est de la stratégie. Chaque heure passée à entretenir en fait gagner dix sur le terrain.</p>
    `,
    image: "/image/Lentretien-de-premier-niveau-du-bouteur.jpg", // Tu peux remplacer par ton image
    date: "2025-05-07",
    author: "Ahmde Koné",
    category: "Maintenance"
  },

  {
    id: 6,
    title: "Tendances du Marché Immobilier en Afrique",
    excerpt: "Le Maroc face à ses ambitions immobilières en vue de la Coupe du Monde 2030.",
    content: `
      <p>Le marché immobilier africain est en pleine mutation. Parmi les pays en tête de cette transformation : le Maroc.</p>
  
      <p>Avec l'organisation conjointe de la Coupe du Monde 2030, le Royaume se retrouve sous les projecteurs. Infrastructures, hôtellerie, logements intermédiaires : tout devient stratégique.</p>
  
      <p><strong>1. Une demande en forte croissance</strong></p>
      <p>Dans les grandes villes comme Casablanca, Rabat et Marrakech, la pression foncière s’intensifie. Les investisseurs, locaux comme étrangers, anticipent une montée en valeur des zones bien desservies.</p>
  
      <p>Le tourisme événementiel, soutenu par la dynamique sportive, pousse les promoteurs à accélérer la construction d'appart-hôtels, de résidences touristiques et de complexes multifonctionnels.</p>
  
      <p><strong>2. Des infrastructures comme catalyseur</strong></p>
      <p>La construction de nouvelles gares LGV, routes et stades va remodeler certaines villes. Des quartiers entiers deviennent “banques de valeur” foncière, notamment autour du Grand Stade de Casablanca ou du hub Tanger-Tétouan.</p>
  
      <p><strong>3. Le cas concret de Mansouria</strong></p>
      <p>À Mansouria, petite ville côtière entre Casablanca et Mohammedia, l'arrivée du Grand Stade Hassan II a transformé le paysage. Autour du stade, de nombreux projets résidentiels émergent, comme ceux du promoteur Nour Al Mostakbal.</p>
  
      <p>Cette zone jusque-là secondaire attire désormais des familles, des investisseurs locatifs, et même des promoteurs touristiques. Le prix du mètre carré a déjà progressé de 12 à 18 % en moins de deux ans.</p>
  
      <p><strong>4. Le défi du logement abordable</strong></p>
      <p>Mais la course au rendement laisse de côté les classes moyennes et les jeunes actifs. À Fès ou à Agadir, les programmes économiques se heurtent à la hausse des coûts de construction et au manque de foncier disponible.</p>
  
      <p><strong>5. Une opportunité pour l’innovation</strong></p>
      <p>Des startups marocaines comme MyHome ou SettiPro misent sur la digitalisation de l’achat locatif, la gestion locative intelligente et la modélisation 3D pour séduire une nouvelle génération d’acheteurs urbains connectés.</p>
  
      <p><strong>Conclusion</strong></p>
      <p>À l’approche de 2030, le Maroc est en train de réécrire les règles du marché immobilier. Pour les acteurs locaux comme pour les investisseurs étrangers, c’est le bon moment pour s’implanter ou se réinventer.</p>
    `,
    image: "/image/MANSOURIA.png",
    date: "2025-04-07",
    author: "Rachida Ziani",
    category: "Marché"
  }
  
];

export default function Blog({ postId }: BlogProps) {
  if (postId) {
    const post = blogPosts.find(p => p.id === parseInt(postId));
    if (!post) return <div>Article non trouvé</div>;

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <a href="#blog" className="inline-flex items-center text-primary-600 hover:text-primary-700 mb-8">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux articles
        </a>
        
        <article>
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-64 object-cover rounded-lg mb-8"
          />
          
          <div className="flex items-center text-sm text-gray-500 mb-4">
            <Calendar className="h-4 w-4 mr-2" />
            {new Date(post.date).toLocaleDateString('fr-FR')}
            <User className="h-4 w-4 ml-4 mr-2" />
            {post.author}
            <span className="ml-4 bg-primary-100 text-primary-800 px-3 py-1 rounded-full">
              {post.category}
            </span>
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-6">{post.title}</h1>
          <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />

        </article>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Blog Minegrid</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Actualités, conseils d'experts et analyses du secteur des équipements miniers et de construction.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {blogPosts.map((post) => (
          <article key={post.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
            <div className="relative h-48">
              <img
                src={post.image}
                alt={post.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4 bg-primary-600 text-white px-3 py-1 rounded-full text-sm">
                {post.category}
              </div>
            </div>
            
            <div className="p-6">
              <div className="flex items-center text-sm text-gray-500 mb-4">
                <Calendar className="h-4 w-4 mr-2" />
                {new Date(post.date).toLocaleDateString('fr-FR')}
                <User className="h-4 w-4 ml-4 mr-2" />
                {post.author}
              </div>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                {post.title}
              </h2>
              
              <p className="text-gray-600 mb-4">
                {post.excerpt}
              </p>
              
              <a
                href={`#blog/${post.id}`}
                className="inline-flex items-center text-primary-600 hover:text-primary-700"
              >
                Lire la suite
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}