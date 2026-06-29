import client from './client';
import type { DailyEventsContext } from '../types';

export const eventsApi = {
  dailyContext: (date: string) =>
    client
      .get<DailyEventsContext>('/events/daily-context', { params: { date } })
      .then((r) => r.data),
  weeklyContext: (start: string, end: string) =>
    client
      .get<DailyEventsContext[]>('/events/weekly-context', { params: { start, end } })
      .then((r) => r.data),
};
