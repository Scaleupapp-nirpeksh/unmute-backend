const admin = require('firebase-admin');
const dotenv = require('dotenv');
const serviceAccount = require('./firebaseServiceAccountKey.json');

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return null;
  }
};

module.exports = { verifyFirebaseToken };
