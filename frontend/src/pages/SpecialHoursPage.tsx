import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { specialHoursApi } from '../api/hours';
import { reservationsApi } from '../api/reservations';
import { Card, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Alert from '../components/ui/Alert';
import Toggle from '../components/ui/Toggle';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { formatDate, formatTime, todayString } from '../lib/utils';
import type { Reservation, SpecialHoursCreate } from '../types';
import { useAuth } from '../context/useAuth';

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function halfHourTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const time = minutesToTime(minutes);
    options.push({ value: time, label: formatTime(time) });
  }
  return options;
}

const SPECIAL_HOUR_TIME_OPTIONS = halfHourTimeOptions();

function reservationTimeRange(reservation: Reservation): string {
  const startMinutes = timeToMinutes(reservation.reservation_time);
  return `${formatTime(reservation.reservation_time)}-${formatTime(
    minutesToTime(startMinutes + reservation.duration_minutes)
  )}`;
}

function impactedReservations(
  form: SpecialHoursCreate,
  reservations: Reservation[]
): Reservation[] {
  const activeReservations = reservations.filter((r) =>
    r.status === 'confirmed' || r.status === 'seated'
  );

  if (form.is_closed) return activeReservations;
  if (!form.open_time || !form.close_time) return [];

  const openMinutes = timeToMinutes(form.open_time);
  const closeMinutes = timeToMinutes(form.close_time);

  return activeReservations.filter((reservation) => {
    const startMinutes = timeToMinutes(reservation.reservation_time);
    const endMinutes = startMinutes + reservation.duration_minutes;
    return startMinutes < openMinutes || endMinutes > closeMinutes;
  });
}

export default function SpecialHoursPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
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
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Special Hours</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Override regular hours for holidays or special events
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)} className="w-full sm:w-auto">
            <Plus size={16} />
            Add Special Hours
          </Button>
        )}
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
              <div key={sh.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
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
                    <span className="block break-words text-sm italic text-gray-400 sm:ml-2 sm:inline">"{sh.reason}"</span>
                  )}
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(sh.date)}
                    loading={deleteMutation.isPending}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {isAdmin && (
        <CreateSpecialHoursModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
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
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const set = (p: Partial<SpecialHoursCreate>) => {
    setForm((f) => ({ ...f, ...p }));
    setShowConflictWarning(false);
  };

  const { data: reservations = [], isLoading: loadingReservations } = useQuery({
    queryKey: ['reservations', 'specialHoursConflict', form.date],
    queryFn: () => reservationsApi.list({ start_date: form.date, end_date: form.date }),
    enabled: open && Boolean(form.date),
  });

  const conflicts = useMemo(
    () => impactedReservations(form, reservations),
    [form, reservations]
  );

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
          if (!showConflictWarning && conflicts.length > 0) {
            setShowConflictWarning(true);
            return;
          }
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Open Time"
              value={form.open_time ?? ''}
              options={SPECIAL_HOUR_TIME_OPTIONS}
              onChange={(e) => set({ open_time: e.target.value })}
            />
            <Select
              label="Close Time"
              value={form.close_time ?? ''}
              options={SPECIAL_HOUR_TIME_OPTIONS}
              onChange={(e) => set({ close_time: e.target.value })}
            />
          </div>
        )}
        {showConflictWarning && conflicts.length > 0 && (
          <Alert variant="warning" title="Existing reservations affected">
            <p>
              These special hours conflict with {conflicts.length} active reservation
              {conflicts.length === 1 ? '' : 's'}. You can still save, but the team may
              need to contact guests or adjust tables.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {conflicts.slice(0, 5).map((reservation) => (
                <li key={reservation.id}>
                  {reservationTimeRange(reservation)} · {reservation.guest_name} ·{' '}
                  {reservation.party_size} guests
                </li>
              ))}
              {conflicts.length > 5 && (
                <li>+{conflicts.length - 5} more reservations</li>
              )}
            </ul>
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={loadingReservations}
            className="w-full sm:w-auto"
          >
            {showConflictWarning && conflicts.length > 0 ? 'Save Anyway' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
