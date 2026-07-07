const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Bibliothèque complète de hashtags OPTINET
const HASHTAG_LIBRARY = {
  brand: {
    label: '🏷️ Marque OPTINET',
    tags: ['#OPTINET', '#OptiNetSARLU', '#SolutionsTech', '#OPTIPUB', '#PublishEverywhere']
  },
  geo_togo: {
    label: '📍 Togo — Villes',
    tags: ['#Togo', '#Sokodé', '#Kara', '#Lomé', '#Atakpamé', '#Dapaong', '#Tsévié', '#Notsé']
  },
  geo_africa: {
    label: '🌍 Afrique de l\'Ouest',
    tags: ['#AfriqueDeLOuest', '#WestAfrica', '#Africa', '#Afrique', '#CEDEAO', '#UEMOA']
  },
  telecom: {
    label: '📡 Télécoms & Internet',
    tags: ['#FibreOptique', '#InternetTogo', '#ConnexionRapide', '#WiFi', '#HautDébit',
           '#4G', '#5G', '#Réseau', '#Telecom', '#ISP', '#FAI']
  },
  tech: {
    label: '💻 Technologie & Digital',
    tags: ['#TechAfrique', '#NumériqueTogo', '#Digitalisation', '#Innovation', '#IT',
           '#Informatique', '#AfricaTech', '#TransitionNumérique', '#DigitalAfrica']
  },
  commercial: {
    label: '📡 Offres Commerciales',
    tags: ['#Promo', '#OffreSpéciale', '#BonPlan', '#InternetPasChèr',
           '#AbonnementInternet', '#FCFA', '#Commerce', '#Offre']
  },
  emploi: {
    label: '💼 Emploi & Recrutement',
    tags: ['#EmploiTogo', '#Recrutement', '#JobTogo', '#Carrière',
           '#TechnicienRéseau', '#IngénieurTelecom', '#JobAfrique']
  },
  business: {
    label: '🏢 Business & Entreprise',
    tags: ['#PMETogo', '#Startup', '#EntrepriseTogo', '#BusinessAfrique',
           '#Entrepreneuriat', '#SARLU', '#InvestirTogo']
  },
  community: {
    label: '🎉 Communauté Togo',
    tags: ['#TogoForward', '#FierDuTogo', '#TogoBusiness', '#CommunautéTogo',
           '#MadeInTogo', '#TogoInnovation', '#PrideTogo']
  },
};

// Formules prêtes par catégorie de publication
const READY_FORMULAS = {
  offre: {
    label: '📡 Offre Internet',
    description: 'Portée maximale pour les offres commerciales',
    tags: '#OPTINET #FibreOptique #InternetTogo #ConnexionRapide #Togo #Sokodé #TechAfrique #BonPlan #OffreSpéciale #SolutionsTech'
  },
  actu: {
    label: '📰 Actualité OPTINET',
    description: 'Nouvelles et annonces de l\'entreprise',
    tags: '#OPTINET #SolutionsTech #Togo #NumériqueTogo #TechAfrique #Sokodé #Innovation'
  },
  emploi: {
    label: '💼 Recrutement',
    description: 'Offres d\'emploi — portée maximum sur LinkedIn & Facebook',
    tags: '#OPTINET #EmploiTogo #Recrutement #JobTogo #TechnicienRéseau #Togo #Telecom #SolutionsTech #Carrière'
  },
  event: {
    label: '🎉 Événement / Communauté',
    description: 'Événements, fêtes, communauté togolaise',
    tags: '#OPTINET #Togo #TogoForward #FierDuTogo #MadeInTogo #CommunautéTogo #TogoBusiness #Innovation'
  },
  tech: {
    label: '🔧 Info Technique',
    description: 'Maintenance, mise à jour réseau',
    tags: '#OPTINET #FibreOptique #Réseau #Telecom #Innovation #SolutionsTech #Togo #Maintenance'
  },
  promo: {
    label: '🎁 Promotion Spéciale',
    description: 'Réductions, offres limitées',
    tags: '#OPTINET #Promo #BonPlan #InternetPasChèr #OffreSpéciale #Togo #FCFA #Commerce'
  },
  comm: {
    label: '🌍 Portée Max Afrique',
    description: 'Visibilité maximale sur toute l\'Afrique de l\'Ouest',
    tags: '#OPTINET #Togo #Africa #AfriqueDeLOuest #AfricaTech #NumériqueTogo #Digitalisation #TransitionNumérique #WestAfrica'
  },
};

// GET /api/hashtags — toute la bibliothèque
router.get('/', protect, (req, res) => {
  res.json({ success: true, library: HASHTAG_LIBRARY, formulas: READY_FORMULAS });
});

// GET /api/hashtags/suggest?category=offre — suggestions par catégorie
router.get('/suggest', protect, (req, res) => {
  const { category = 'offre' } = req.query;
  const formula = READY_FORMULAS[category] || READY_FORMULAS.offre;
  const suggested = formula.tags.split(' ');

  // Ajouter des tags de la marque toujours présents
  const brandTags = HASHTAG_LIBRARY.brand.tags;
  const merged = [...new Set([...suggested, ...brandTags])];

  res.json({ success: true, category, suggested: merged, formula });
});

// GET /api/hashtags/trending — hashtags tendance (simulation)
router.get('/trending', protect, (req, res) => {
  const trending = [
    { tag: '#OPTINET', reach: 4200, trend: 'up' },
    { tag: '#FibreOptique', reach: 3800, trend: 'up' },
    { tag: '#InternetTogo', reach: 3100, trend: 'up' },
    { tag: '#TechAfrique', reach: 2700, trend: 'stable' },
    { tag: '#NumériqueTogo', reach: 2200, trend: 'up' },
    { tag: '#TogoForward', reach: 1900, trend: 'up' },
    { tag: '#MadeInTogo', reach: 1700, trend: 'stable' },
    { tag: '#EmploiTogo', reach: 1500, trend: 'up' },
  ];
  res.json({ success: true, trending });
});

module.exports = router;
