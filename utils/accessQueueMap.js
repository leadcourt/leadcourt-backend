const accessQueueMap = {};

const withAccessQueue = (userId, row_id, fn) => {
  const key = `${userId}_${row_id}`;
  if (!accessQueueMap[key]) accessQueueMap[key] = Promise.resolve();

  accessQueueMap[key] = accessQueueMap[key].then(() => fn());
  return accessQueueMap[key];
};

module.exports = { withAccessQueue };