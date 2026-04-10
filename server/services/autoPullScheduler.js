const cron = require('node-cron');

const DEFAULT_AUTO_PULL_SCHEDULE = {
  type: 'weekly',
  dayOfWeek: 1,
  time: '09:00',
  intervalHours: 24,
};

let currentSchedule = { ...DEFAULT_AUTO_PULL_SCHEDULE };
let scheduledJob = null;
let runHandler = async () => {};
let lastScheduledTriggerAt = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeTime = (time) => {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '09:00';
  const hours = clamp(Number(match[1]), 0, 23);
  const minutes = clamp(Number(match[2]), 0, 59);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeAutoPullSchedule = (rawSchedule) => {
  const candidate = typeof rawSchedule === 'string'
    ? (() => {
      try {
        return JSON.parse(rawSchedule);
      } catch {
        return {};
      }
    })()
    : (rawSchedule || {});

  const type = ['daily', 'weekly', 'interval'].includes(candidate.type)
    ? candidate.type
    : DEFAULT_AUTO_PULL_SCHEDULE.type;

  return {
    type,
    dayOfWeek: clamp(Number(candidate.dayOfWeek ?? DEFAULT_AUTO_PULL_SCHEDULE.dayOfWeek), 0, 6),
    time: normalizeTime(candidate.time || DEFAULT_AUTO_PULL_SCHEDULE.time),
    intervalHours: clamp(Number(candidate.intervalHours ?? DEFAULT_AUTO_PULL_SCHEDULE.intervalHours), 1, 168),
  };
};

const toCronExpression = (schedule) => {
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (schedule.type === 'daily') return `${minute} ${hour} * * *`;
  if (schedule.type === 'weekly') return `${minute} ${hour} * * ${schedule.dayOfWeek}`;
  return '0 * * * *';
};

const parseIsoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const computeNextRunAt = ({ schedule = currentSchedule, lastAutoPull }) => {
  const now = new Date();

  if (schedule.type === 'interval') {
    const lastRun = parseIsoOrNull(lastAutoPull) || parseIsoOrNull(lastScheduledTriggerAt);
    const base = lastRun || now;
    return new Date(base.getTime() + (schedule.intervalHours * 60 * 60 * 1000)).toISOString();
  }

  const [hours, minutes] = schedule.time.split(':').map(Number);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);

  if (schedule.type === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  const currentDay = now.getDay();
  const targetDay = schedule.dayOfWeek;
  let dayOffset = targetDay - currentDay;
  if (dayOffset < 0) dayOffset += 7;
  if (dayOffset === 0 && next <= now) dayOffset = 7;
  next.setDate(next.getDate() + dayOffset);
  return next.toISOString();
};

const shouldRunIntervalSchedule = (schedule) => {
  if (schedule.type !== 'interval') return true;
  if (!lastScheduledTriggerAt) return true;
  const last = new Date(lastScheduledTriggerAt);
  if (Number.isNaN(last.getTime())) return true;
  return Date.now() - last.getTime() >= schedule.intervalHours * 60 * 60 * 1000;
};

const startSchedule = () => {
  if (scheduledJob) scheduledJob.stop();
  const cronExpression = toCronExpression(currentSchedule);
  scheduledJob = cron.schedule(cronExpression, async () => {
    if (!shouldRunIntervalSchedule(currentSchedule)) return;
    lastScheduledTriggerAt = new Date().toISOString();
    await runHandler();
  });
};

const setAutoPullRunner = (handler) => {
  runHandler = typeof handler === 'function' ? handler : async () => {};
};

const setAutoPullSchedule = (schedule) => {
  currentSchedule = normalizeAutoPullSchedule(schedule);
  startSchedule();
  return currentSchedule;
};

const getAutoPullScheduleState = ({ lastAutoPull } = {}) => ({
  schedule: currentSchedule,
  nextRunAt: computeNextRunAt({ schedule: currentSchedule, lastAutoPull }),
});

module.exports = {
  DEFAULT_AUTO_PULL_SCHEDULE,
  normalizeAutoPullSchedule,
  setAutoPullRunner,
  setAutoPullSchedule,
  getAutoPullScheduleState,
};
