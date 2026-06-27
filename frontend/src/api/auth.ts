import client from './client';
import type { User } from '../types';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authApi = {
  login: (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);

    return client
      .post<LoginResponse>('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .then((r) => r.data);
  },
  signup: (data: { username: string; password: string }) =>
    client.post<User>('/auth/signup', data).then((r) => r.data),
  me: () => client.get<User>('/auth/me').then((r) => r.data),
  users: (status?: 'pending' | 'active') =>
    client.get<User[]>('/auth/users', { params: status ? { status_filter: status } : undefined }).then((r) => r.data),
  approveUser: (id: number) =>
    client.post<{ user: User }>(`/auth/users/${id}/approve`).then((r) => r.data.user),
};
