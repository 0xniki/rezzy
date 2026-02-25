import client from './client';
import type { RestaurantConfig, RestaurantConfigCreate, RestaurantConfigUpdate } from '../types';

export const configApi = {
  get: () => client.get<RestaurantConfig>('/config').then((r) => r.data),
  create: (data: RestaurantConfigCreate) =>
    client.post<RestaurantConfig>('/config', data).then((r) => r.data),
  update: (data: RestaurantConfigUpdate) =>
    client.patch<RestaurantConfig>('/config', data).then((r) => r.data),
};
