import client from './client';
import type { Table, TableCreate, TableUpdate } from '../types';

export const tablesApi = {
  list: (activeOnly = true) =>
    client.get<Table[]>('/tables', { params: { active_only: activeOnly } }).then((r) => r.data),
  get: (id: number) => client.get<Table>(`/tables/${id}`).then((r) => r.data),
  create: (data: TableCreate) => client.post<Table>('/tables', data).then((r) => r.data),
  update: (id: number, data: TableUpdate) =>
    client.patch<Table>(`/tables/${id}`, data).then((r) => r.data),
  delete: (id: number) => client.delete(`/tables/${id}`).then((r) => r.data),
  rearrangeChairs: (adjustments: { table_id: number; chair_delta: number }[]) =>
    client.post('/tables/rearrange-chairs', { table_adjustments: adjustments }).then((r) => r.data),
};
