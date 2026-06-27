import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import { ShieldCheck, UserCheck } from 'lucide-react';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => authApi.users(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => authApi.approveUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const pendingUsers = users.filter((u) => !u.is_active && u.role !== 'admin');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Approval</h1>
          <p className="text-gray-500 text-sm mt-0.5">Approve staff accounts after signup</p>
        </div>
      </div>

      {error instanceof Error && <Alert variant="error" className="mb-4">{error.message}</Alert>}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-gray-700">
            <ShieldCheck size={18} />
            <span className="font-medium">Accounts</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No users yet</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((user) => {
                const pending = pendingUsers.some((u) => u.id === user.id);
                return (
                  <div key={user.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{user.username}</span>
                        <Badge color={user.role === 'admin' ? 'purple' : 'blue'}>{user.role}</Badge>
                        <Badge color={user.is_active ? 'green' : 'yellow'}>
                          {user.is_active ? 'active' : 'pending'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested {user.created_at ? new Date(user.created_at).toLocaleString() : 'unknown'}
                      </p>
                    </div>
                    {pending && (
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(user.id)}
                        loading={approveMutation.isPending}
                      >
                        <UserCheck size={14} />
                        Approve
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
