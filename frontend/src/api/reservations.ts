import client from './client';
import type {
  Reservation,
  ReservationCreate,
  ReservationUpdate,
  AvailableOption,
  ReservationStatus,
} from '../types';

export const reservationsApi = {
  list: (params?: {
    start_date?: string;
    end_date?: string;
    status?: ReservationStatus;
  }) => client.get<Reservation[]>('/reservations', { params }).then((r) => r.data),
  get: (id: number) => client.get<Reservation>(`/reservations/${id}`).then((r) => r.data),
  getAvailable: (params: {
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    duration_minutes?: number;
  }) =>
    client
      .get<AvailableOption[]>('/reservations/available', { params })
      .then((r) => r.data),
  create: (data: ReservationCreate) =>
    client.post<Reservation>('/reservations', data).then((r) => r.data),
  update: (id: number, data: ReservationUpdate) =>
    client.patch<Reservation>(`/reservations/${id}`, data).then((r) => r.data),
  cancel: (id: number) =>
    client.post<Reservation>(`/reservations/${id}/cancel`).then((r) => r.data),
};
