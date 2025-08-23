const Credits = require('../models/Credits');
const dayjs = require('dayjs');

function addDaysToDate(date, days) {
  return dayjs(date).add(days, 'day').toDate();
}

function getRemainingDays(expiresAt) {
  if (!expiresAt) return 0;
  const now = dayjs();
  const expiry = dayjs(expiresAt);
  return Math.max(0, expiry.diff(now, 'day'));
}

async function handlePlanPurchase(userId, newPlan, creditsToAdd, durationDays) {
  const user = await Credits.findOne({ userId });
  user.credits += creditsToAdd;

  const now = new Date();
  const currentPlan = user.activePlan;
  const currentExpiry = user.expiresAt;
  const currentRemainingDays = getRemainingDays(currentExpiry);

  // 1. Buying Business
  if (newPlan === 'BUSINESS') {
    if (currentPlan && currentPlan !== 'BUSINESS') {
      if (currentPlan === 'STARTER') {
        user.starterRemainingDays += currentRemainingDays;
      } else if (currentPlan === 'PRO') {
        user.proRemainingDays += currentRemainingDays;
      }
    }
    if (currentPlan === 'BUSINESS') {
      user.expiresAt = addDaysToDate(currentExpiry, durationDays);
    } else {
      user.activePlan = 'BUSINESS';
      user.expiresAt = addDaysToDate(now, durationDays);
    }
  }

  // 2. Buying Pro
  else if (newPlan === 'PRO') {
    if (currentPlan === 'BUSINESS') {
      user.proRemainingDays += durationDays;
    } else if (currentPlan === 'PRO') {
      user.expiresAt = addDaysToDate(currentExpiry, durationDays);
    } else if (currentPlan === 'STARTER') {
      user.starterRemainingDays += currentRemainingDays;
      user.activePlan = 'PRO';
      user.expiresAt = addDaysToDate(now, durationDays);
    } else {
      user.activePlan = 'PRO';
      user.expiresAt = addDaysToDate(now, durationDays);
    }
  }

  // 3. Buying Starter
  else if (newPlan === 'STARTER') {
    if (currentPlan === 'BUSINESS') {
      user.starterRemainingDays += durationDays;
    } else if (currentPlan === 'PRO') {
      user.starterRemainingDays += durationDays;
    } else if (currentPlan === 'STARTER') {
      user.expiresAt = addDaysToDate(currentExpiry, durationDays);
    } else {
      user.activePlan = 'STARTER';
      user.expiresAt = addDaysToDate(now, durationDays);
    }
  }

  return user.save();
}

async function handlePlanExpiry(userId) {
  const user = await Credits.findOne({ userId });
  if (!user || !user.expiresAt) return;

  const now = new Date();
  if (now < user.expiresAt) return;

  if (user.proRemainingDays > 0) {
    user.activePlan = 'PRO';
    user.expiresAt = addDaysToDate(now, user.proRemainingDays);
    user.proRemainingDays = 0;
  } else if (user.starterRemainingDays > 0) {
    user.activePlan = 'STARTER';
    user.expiresAt = addDaysToDate(now, user.starterRemainingDays);
    user.starterRemainingDays = 0;
  } else {
    user.activePlan = 'FREE';
    user.expiresAt = null;
  }

  return user.save();
}

module.exports = {
  handlePlanPurchase,
  handlePlanExpiry
};
