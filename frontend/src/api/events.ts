import client from './client';
import type { DailyEventsContext } from '../types';

export const eventsApi = {
  dailyContext: (date: string) =>
    client
      .get<DailyEventsContext>('/events/daily-context', { params: { date } })
      .then((r) => r.data),
};
