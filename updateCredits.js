require('dotenv').config();
const mongoose = require('mongoose');
const Credits = require('./models/Credits');

const MONGO_URI = process.env.MONGODB_URI;

async function migrateCredits() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const creditsDocs = await Credits.find({});
    let updatedCount = 0;

    for (const doc of creditsDocs) {
      const isActivePlan =
        doc.activePlan &&
        doc.activePlan !== 'FREE' &&
        doc.activePlan !== null;

      const updateData = {
        starterRemainingDays: 0,
        proRemainingDays: 0
      };

      if (isActivePlan) {
        const lastUpdated = doc.lastUpdated || new Date();
        updateData.expiresAt = new Date(lastUpdated.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else {
        updateData.expiresAt = null;
      }

      await Credits.updateOne({ _id: doc._id }, { $set: updateData });
      updatedCount++;
    }

    console.log(`Migration complete: ${updatedCount} documents updated.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrateCredits();
