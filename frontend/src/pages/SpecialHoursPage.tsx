import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { specialHoursApi } from '../api/hours';
import { Card, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import Toggle from '../components/ui/Toggle';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { formatDate, formatTime, todayString } from '../lib/utils';
import type { SpecialHoursCreate } from '../types';

export default function SpecialHoursPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const today = todayString();
  const nextYear = `${new Date().getFullYear() + 1}-12-31`;

  const { data: special = [], isLoading } = useQuery({
    queryKey: ['specialHours'],
    queryFn: () => specialHoursApi.list(today, nextYear),
  });

  const deleteMutation = useMutation({
    mutationFn: (date: string) => specialHoursApi.delete(date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specialHours'] }),
    onError: (e: Error) => setError(e.message),
  });

  const sorted = [...special].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Special Hours</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Override regular hours for holidays or special events
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Add Special Hours
        </Button>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <Card>
        {isLoading ? (
          <CardBody>
            <div className="py-8 text-center text-gray-400">Loading…</div>
          </CardBody>
        ) : sorted.length === 0 ? (
          <CardBody>
            <div className="py-12 text-center text-gray-400">
              <CalendarClock size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No upcoming special hours</p>
            </div>
          </CardBody>
        ) : (
          <div className="divide-y divide-gray-100">
            {sorted.map((sh) => (
              <div key={sh.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900">{formatDate(sh.date)}</span>
                    {sh.is_closed ? (
                      <Badge color="red">Closed</Badge>
                    ) : (
                      <Badge color="green">Open</Badge>
                    )}
                  </div>
                  {!sh.is_closed && (
                    <span className="text-sm text-gray-500">
                      {formatTime(sh.open_time)} – {formatTime(sh.close_time)}
                    </span>
                  )}
                  {sh.reason && (
                    <span className="text-sm text-gray-400 ml-2 italic">"{sh.reason}"</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(sh.date)}
                  loading={deleteMutation.isPending}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CreateSpecialHoursModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}

function CreateSpecialHoursModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SpecialHoursCreate>({
    date: todayString(),
    is_closed: false,
    open_time: '11:00',
    close_time: '22:00',
    reason: '',
  });
  const [error, setError] = useState('');
  const set = (p: Partial<SpecialHoursCreate>) => setForm((f) => ({ ...f, ...p }));

  const mutation = useMutation({
    mutationFn: () =>
      specialHoursApi.create({
        ...form,
        open_time: form.is_closed ? null : form.open_time,
        close_time: form.is_closed ? null : form.close_time,
        reason: form.reason || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['specialHours'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add Special Hours">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          mutation.mutate();
        }}
        className="flex flex-col gap-4"
      >
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => set({ date: e.target.value })}
          required
        />
        <Input
          label="Reason (optional)"
          placeholder="e.g. Christmas Day, Private Event"
          value={form.reason ?? ''}
          onChange={(e) => set({ reason: e.target.value })}
        />
        <Toggle
          checked={form.is_closed ?? false}
          onChange={(v) => set({ is_closed: v })}
          label="Closed this day"
        />
        {!form.is_closed && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Open Time</label>
              <input
                type="time"
                value={form.open_time ?? ''}
                onChange={(e) => set({ open_time: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Close Time</label>
              <input
                type="time"
                value={form.close_time ?? ''}
                onChange={(e) => set({ close_time: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
