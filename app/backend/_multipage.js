require('dotenv').config();
const mongoose = require('mongoose');
const SocialAccount = require('./models/SocialAccount');
const fb = require('./services/facebook');

const PAGES = [
  { id: '1012702025264820', name: 'OptiNet Sarl-U' },
  { id: '101232529341977',  name: 'abrahamnabine1' },
  { id: '104621487697882',  name: 'Light House of Lome' },
];
// Pages qui n'ont PAS encore l'annonce (OptiNet l'a déjà)
const MISSING = ['101232529341977', '104621487697882'];

const DIR = 'C:\\Users\\abrah\\Desktop\\IMAGE PC PUB\\';
const images = [
  'WhatsApp Image 2026-07-03 at 13.37.04.jpeg',
  'WhatsApp Image 2026-07-03 at 13.37.06.jpeg',
  'WhatsApp Image 2026-07-03 at 13.37.05.jpeg',
  'WhatsApp Image 2026-07-03 at 13.37.04 (1).jpeg',
  'WhatsApp Image 2026-07-03 at 13.37.06 (1).jpeg',
].map(f => ({ filePath: DIR + f }));

const caption = [
  '🌐 Hp probook x360 440 G1 Core i5 — Écran 14" Full HD Ultra slim et très performant',
  '',
  '7th Generation',
  'Processeur Intel core i5',
  'CPU 2.50GHz ~2.71GHz',
  'SSD 256gb M2',
  'RAM 8gb DDR4',
  'Bluetooth ✨ Type-C ✨ HDMI ✨ USB ✨',
  'Batterie 🔋 excellente autonomie 4heures',
  'Prix: 210 000 FCFA',
  '',
  '📞 +228 90 74 84 65 | optinetsarl@gmail.com',
  '',
  '📢 Rejoignez notre canal WhatsApp : https://whatsapp.com/channel/0029VbClEHFC1Fu7LWjyO11M',
  '💬 Commandez sur WhatsApp : https://wa.me/22890748465',
  '',
  '#OPTINET #HP #Probook #Ordinateur #Lome #Togo',
].join('\n');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const acc = await SocialAccount.findOne({ platform: 'facebook' });
    const token = acc.accessToken;

    // 1) Enregistrer les 3 pages cibles
    acc.metadata = { ...(acc.metadata || {}), pages: PAGES };
    acc.markModified('metadata');
    await acc.save();
    console.log('3 pages enregistrees en base:', PAGES.map(p => p.name).join(', '), '✅');

    // 2) Publier sur les 2 pages manquantes
    for (const pageId of MISSING) {
      const name = PAGES.find(p => p.id === pageId).name;
      try {
        const r = await fb.publishMultiPhoto({ pageId, token, message: caption, images });
        console.log(`\n[${name}] ✅ publie -> ${r.permalink}`);
      } catch (e) {
        console.log(`\n[${name}] ❌ ${e.message}`);
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('ERREUR:', err.message);
    process.exit(1);
  }
})();
