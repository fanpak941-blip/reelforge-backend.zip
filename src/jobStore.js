// Simple in-memory job tracker.
// Good enough for a single Railway instance. If you later scale to multiple
// server instances, this should be swapped for Redis or a database.

const jobs = new Map();

function createJob(jobId) {
  jobs.set(jobId, {
    jobId,
    state: 'queued', // queued -> processing -> completed | failed
    progress: { stage: 'queued', percent: 0 },
    result: null,
    failedReason: null,
    createdAt: Date.now(),
  });
  return jobs.get(jobId);
}

function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, updates);
  jobs.set(jobId, job);
  return job;
}

function setProgress(jobId, stage, percent) {
  return updateJob(jobId, { state: 'processing', progress: { stage, percent } });
}

function completeJob(jobId, result) {
  return updateJob(jobId, {
    state: 'completed',
    progress: { stage: 'completed', percent: 100 },
    result,
  });
}

function failJob(jobId, reason) {
  return updateJob(jobId, { state: 'failed', failedReason: reason });
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

// Clean up old jobs after 2 hours to avoid memory growth
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < twoHoursAgo) jobs.delete(id);
  }
}, 30 * 60 * 1000);

module.exports = { createJob, updateJob, setProgress, completeJob, failJob, getJob };
