const queues = new Map();

function withUserDbQueue(userId, taskFn) {
  if (!queues.has(userId)) queues.set(userId, Promise.resolve());

  const queue = queues.get(userId);
  const newTask = queue
    .then(() => taskFn())
    .catch(err => {
      console.error(`Queue error for user ${userId}:`, err);
    });

  queues.set(userId, newTask);
  return newTask;
}

module.exports = { withUserDbQueue };
