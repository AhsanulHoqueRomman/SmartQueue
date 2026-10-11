export const initialSchedule = () => Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, is_working_day: day_of_week < 5, start_time: '09:00:00', end_time: '17:00:00', breaks: [] }));
export const weekdayForDate = date => (new Date(`${date}T12:00:00+06:00`).getUTCDay() + 6) % 7;
