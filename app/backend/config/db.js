const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[OK] MongoDB Atlas connecté : ${conn.connection.host}`);
  } catch (err) {
    console.error('[ERREUR] Erreur connexion MongoDB :', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
