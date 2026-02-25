import client from './client';
import type {
  OperatingHours,
  OperatingHoursCreate,
  OperatingHoursUpdate,
  SpecialHours,
  SpecialHoursCreate,
  SpecialHoursUpdate,
} from '../types';

export const operatingHoursApi = {
  list: () => client.get<OperatingHours[]>('/hours/operating').then((r) => r.data),
  getDay: (day: number) =>
    client.get<OperatingHours>(`/hours/operating/${day}`).then((r) => r.data),
  create: (data: OperatingHoursCreate) =>
    client.post<OperatingHours>('/hours/operating', data).then((r) => r.data),
  bulkCreate: (data: OperatingHoursCreate[]) =>
    client.post<OperatingHours[]>('/hours/operating/bulk', data).then((r) => r.data),
  update: (day: number, data: OperatingHoursUpdate) =>
    client.patch<OperatingHours>(`/hours/operating/${day}`, data).then((r) => r.data),
};

export const specialHoursApi = {
  list: (startDate?: string, endDate?: string) =>
    client
      .get<SpecialHours[]>('/hours/special', {
        params: { start_date: startDate, end_date: endDate },
      })
      .then((r) => r.data),
  getDate: (date: string) =>
    client.get<SpecialHours>(`/hours/special/${date}`).then((r) => r.data),
  create: (data: SpecialHoursCreate) =>
    client.post<SpecialHours>('/hours/special', data).then((r) => r.data),
  update: (date: string, data: SpecialHoursUpdate) =>
    client.patch<SpecialHours>(`/hours/special/${date}`, data).then((r) => r.data),
  delete: (date: string) => client.delete(`/hours/special/${date}`).then((r) => r.data),
};
