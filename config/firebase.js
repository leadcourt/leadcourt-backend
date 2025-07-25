const admin = require("firebase-admin");
require("dotenv").config();

const initializeFirebaseAdmin = () => {
  try {
    if (admin.apps.length) {
      return admin;
    }

    if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    } else {
      const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS || "../serviceAccountKey.json");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    return admin;
  } catch (error) {
    console.error("Firebase Admin SDK initialization error:", error);
    throw error;
  }
};

const firebaseAdmin = initializeFirebaseAdmin();

module.exports = {
  admin: firebaseAdmin,
  auth: firebaseAdmin.auth(),
};