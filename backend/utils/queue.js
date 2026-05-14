const queue = [];
let processing = false;
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 2000;

async function processQueue(getContentById, pool) {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE);
    for (const task of batch) {
      const { userId, movieId, type } = task;
      if (!movieId || !type) {
        console.error('Invalid queue task – missing movieId or type:', task);
        continue;
      }
      try {
        const content = await getContentById(pool, movieId, type);
        if (!content) {
          console.error(`Failed to fetch content ${type}:${movieId}`);
          continue;
        }
        await pool.query(
          'INSERT INTO watchlist (user_id, movie_id, type) VALUES ($1,$2,$3) ON CONFLICT (user_id, movie_id, type) DO NOTHING',
          [userId, movieId, type]
        );
      } catch (err) {
        console.error('Queue processing error:', err.message);
      }
    }
    if (queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  processing = false;
}

function enqueue(task, getContentById, pool) {
  if (!task.movieId || !task.type) {
    console.error('Refusing to enqueue invalid task:', task);
    return;
  }
  queue.push(task);
  processQueue(getContentById, pool);
}

module.exports = { enqueue };