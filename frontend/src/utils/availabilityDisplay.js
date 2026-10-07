export function matchesWorkingWindow(data, preference) {
  if (preference === 'ANY') return true;
  if (!data.start_time || !data.end_time) return false;
  const minutes = value => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
  const range = { MORNING: [480, 720], AFTERNOON: [720, 1020], EVENING: [1020, 1260] }[preference];
  if (!range) return false;
  return minutes(data.start_time) < range[1] && minutes(data.end_time) > range[0];
}
