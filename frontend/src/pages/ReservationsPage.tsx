import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reservationsApi } from '../api/reservations';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Alert from '../components/ui/Alert';
import { Plus, Search, CalendarDays, Users, Phone, ChevronLeft, ChevronRight, Armchair, LayoutGrid, AlertCircle } from 'lucide-react';
import { formatTime, formatDate, todayString } from '../lib/utils';
import type { Reservation, ReservationCreate, ReservationStatus, AvailableOption } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if a confirmed reservation starts within the next 60 minutes of `now` */
function isUpcomingSoon(r: Reservation, now: Date): boolean {
  if (r.status !== 'confirmed') return false;
  const resStart = new Date(`${r.reservation_date}T${r.reservation_time}`);
  const diffMs = resStart.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= 60 * 60 * 1000;
}

/** Generate every 15-minute slot for a 24-hour day as "HH:MM" strings */
function timeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}
const TIME_SLOTS = timeSlots();

/** Format "HH:MM" → "12:00 AM / PM" for display */
function formatSlot(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const PHONE_PATTERN = /^(\d{10}|\d{3}-\d{3}-\d{4})$/;

function parsePartySize(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
}

function validatePartyAndPhone(partySize: number | null, phoneNumber: string): string | null {
  const phone = phoneNumber.trim();
  if (partySize === null) return 'Party size must be at least 1';
  if (partySize >= 4 && !phone) return 'Phone number is required for parties of 4 or more';
  if (phone && !PHONE_PATTERN.test(phone)) {
    return 'Phone number must be 10 digits or formatted as 123-456-7890';
  }
  return null;
}

const STATUS_COLORS: Record<ReservationStatus, 'green' | 'blue' | 'gray' | 'red' | 'orange' | 'purple' | 'yellow'> = {
  confirmed: 'blue',
  seated: 'green',
  completed: 'gray',
  cancelled: 'red',
  no_show: 'orange',
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPastReservationSlot(date: string, time: string): boolean {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${normalizedTime}`) <= new Date();
}

function initialReservationSlot(defaultDate: string) {
  const today = todayString();
  const date = defaultDate < today ? today : defaultDate;
  const preferredTime = '19:00';

  if (!isPastReservationSlot(date, preferredTime)) {
    return { date, time: preferredTime };
  }

  const futureSlot = TIME_SLOTS.find((slot) => !isPastReservationSlot(date, slot));
  if (futureSlot) {
    return { date, time: futureSlot };
  }

  return { date: toISO(addDays(new Date(), 1)), time: '00:00' };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [showCreate, setShowCreate] = useState(false);
  const [editRes, setEditRes] = useState<Reservation | null>(null);

  // Ticks every 30 s so the 1-hour badge appears without a page reload
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const startDate = toISO(weekStart);
  const endDate = toISO(addDays(weekStart, 6));

  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', startDate, endDate],
    queryFn: () => reservationsApi.list({ start_date: startDate, end_date: endDate }),
    refetchInterval: 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => reservationsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  });

  const dayRes = reservations
    .filter((r) => r.reservation_date === selectedDate)
    .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = toISO(d);
    const count = reservations.filter(
      (r) => r.reservation_date === iso && r.status !== 'cancelled'
    ).length;
    return { date: d, iso, count };
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage bookings and guest assignments</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          New Reservation
        </Button>
      </div>

      {/* Week selector */}
      <Card className="mb-6">
        <div className="px-4 py-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft size={16} />
          </Button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {weekDays.map(({ date, iso, count }) => {
              const isSelected = iso === selectedDate;
              const isToday = iso === todayString();
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  className={`flex flex-col items-center rounded-xl py-2 px-1 text-xs transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="font-medium">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span
                    className={`text-base font-bold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full ${
                      isToday && !isSelected ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] mt-0.5 font-medium ${
                        isSelected ? 'text-blue-200' : 'text-blue-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </Card>

      {/* Day's reservations */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">
            {formatDate(selectedDate)}
          </h2>
        </CardHeader>
        <CardBody className="p-0">
          {dayRes.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <CalendarDays size={36} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No reservations for this day</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {dayRes.map((r) => {
                const tableLabel =
                  r.tables.length === 0
                    ? 'No table'
                    : r.tables.length === 1
                    ? `Table ${r.tables[0].table_number}`
                    : `Tables ${r.tables.map((t) => t.table_number).join(' + ')}`;
                const soon = isUpcomingSoon(r, now);

                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                      soon ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex flex-col items-center w-16 shrink-0">
                      <span className="text-sm font-bold text-gray-900">{formatTime(r.reservation_time)}</span>
                      <span className="text-xs text-gray-400">{r.duration_minutes}m</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {soon && (
                          <span title="Starting within 1 hour — place reserve sign">
                            <AlertCircle size={16} className="text-red-500 shrink-0 animate-pulse" />
                          </span>
                        )}
                        <span className="font-medium text-gray-900">{r.guest_name}</span>
                        <Badge color={STATUS_COLORS[r.status]}>{r.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {r.party_size} guests
                        </span>
                        <span className="flex items-center gap-1">
                          <LayoutGrid size={12} />
                          {tableLabel}
                        </span>
                        {r.phone_number && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} />
                            {r.phone_number}
                          </span>
                        )}
                        {r.notes && (
                          <span className="truncate max-w-xs italic">"{r.notes}"</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setEditRes(r)}>
                        Edit
                      </Button>
                      {r.status === 'confirmed' || r.status === 'seated' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate(r.id)}
                          loading={cancelMutation.isPending}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {showCreate && (
        <CreateReservationModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          defaultDate={selectedDate}
        />
      )}
      {editRes && (
        <EditReservationModal
          reservation={editRes}
          onClose={() => setEditRes(null)}
        />
      )}
    </div>
  );
}

// ─── Time select ──────────────────────────────────────────────────────────────

function TimeSelect({
  label,
  value,
  onChange,
  selectedDate,
  disallowPast = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  selectedDate?: string;
  disallowPast?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
      >
        {TIME_SLOTS.map((t) => (
          <option
            key={t}
            value={t}
            disabled={disallowPast && selectedDate ? isPastReservationSlot(selectedDate, t) : false}
          >
            {formatSlot(t)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
}

type CreateReservationForm = Omit<ReservationCreate, 'party_size' | 'phone_number' | 'notes'> & {
  party_size: string;
  phone_number: string;
  notes: string;
};

function CreateReservationModal({ open, onClose, defaultDate }: CreateModalProps) {
  const qc = useQueryClient();
  const initialSlot = initialReservationSlot(defaultDate);
  const [form, setForm] = useState<CreateReservationForm>({
    guest_name: '',
    party_size: '2',
    reservation_date: initialSlot.date,
    reservation_time: initialSlot.time,
    duration_minutes: 90,
    phone_number: '',
    notes: '',
    table_ids: [],
  });
  const [error, setError] = useState('');
  const [availableOptions, setAvailableOptions] = useState<AvailableOption[]>([]);
  const [searchedAvail, setSearchedAvail] = useState(false);
  const [selectedOption, setSelectedOption] = useState<AvailableOption | null>(null);

  const resetAvailability = () => {
    setSearchedAvail(false);
    setAvailableOptions([]);
    setSelectedOption(null);
  };

  const set = (patch: Partial<CreateReservationForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    resetAvailability();
  };

  const searchMutation = useMutation({
    mutationFn: (partySize: number) =>
      reservationsApi.getAvailable({
        reservation_date: form.reservation_date,
        reservation_time: form.reservation_time,
        party_size: partySize,
        duration_minutes: form.duration_minutes,
      }),
    onSuccess: (data) => {
      setAvailableOptions(data);
      setSearchedAvail(true);
      setSelectedOption(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const createMutation = useMutation({
    mutationFn: (payload: ReservationCreate) => reservationsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSelectOption = (option: AvailableOption) => {
    setSelectedOption(option);
    setForm((f) => ({ ...f, table_ids: option.table_ids }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const partySize = parsePartySize(form.party_size);
    const validationError = validatePartyAndPhone(partySize, form.phone_number);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (partySize === null) return;
    if (isPastReservationSlot(form.reservation_date, form.reservation_time)) {
      setError('Reservations must be for a future date and time');
      return;
    }
    if (form.table_ids.length === 0) {
      setError('Please search for availability and select a table assignment');
      return;
    }
    createMutation.mutate({
      ...form,
      party_size: partySize,
      phone_number: form.phone_number.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  const handleFindAvailable = () => {
    setError('');
    const partySize = parsePartySize(form.party_size);
    if (partySize === null) {
      setError('Party size must be at least 1');
      return;
    }
    if (isPastReservationSlot(form.reservation_date, form.reservation_time)) {
      setError('Reservations must be for a future date and time');
      return;
    }
    searchMutation.mutate(partySize);
  };

  const selectedSlotIsPast = isPastReservationSlot(form.reservation_date, form.reservation_time);

  return (
    <Modal open={open} onClose={onClose} title="New Reservation" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Guest Name"
            value={form.guest_name}
            onChange={(e) => set({ guest_name: e.target.value })}
            required
          />
          <Input
            label="Party Size"
            type="number"
            min="1"
            value={form.party_size}
            onChange={(e) => set({ party_size: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Date"
            type="date"
            min={todayString()}
            value={form.reservation_date}
            onChange={(e) => set({ reservation_date: e.target.value })}
            required
          />
          <TimeSelect
            label="Time"
            value={form.reservation_time}
            selectedDate={form.reservation_date}
            disallowPast
            onChange={(v) => set({ reservation_time: v })}
          />
          <Input
            label="Duration (min)"
            type="number"
            min="30"
            step="15"
            value={form.duration_minutes}
            onChange={(e) => set({ duration_minutes: parseInt(e.target.value) || 90 })}
          />
        </div>

        <Input
          label="Phone Number"
          type="tel"
          value={form.phone_number ?? ''}
          onChange={(e) => set({ phone_number: e.target.value })}
          hint="Required for parties of 4+. Use 1234567890 or 123-456-7890."
        />

        <Input
          label="Notes"
          value={form.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Dietary restrictions, special requests..."
        />

        {/* Availability search */}
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Table Assignment</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFindAvailable}
              loading={searchMutation.isPending}
              disabled={selectedSlotIsPast}
            >
              <Search size={14} />
              Find Available
            </Button>
          </div>

          {searchedAvail && availableOptions.length === 0 && (
            <Alert variant="warning">No tables available for this time slot</Alert>
          )}
          {selectedSlotIsPast && (
            <Alert variant="warning">Choose a future date and time before finding tables</Alert>
          )}

          {availableOptions.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {availableOptions.map((opt) => {
                const isSelected =
                  selectedOption !== null &&
                  JSON.stringify(selectedOption.table_ids) === JSON.stringify(opt.table_ids);
                const isCombo = opt.type === 'combo';
                const label = opt.table_numbers.join(' + ');

                return (
                  <button
                    key={opt.table_ids.join('-')}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`border rounded-xl p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {isCombo ? (
                        <LayoutGrid size={13} className="text-purple-500 shrink-0" />
                      ) : (
                        <Armchair size={13} className="text-blue-500 shrink-0" />
                      )}
                      <span className="font-medium text-gray-900 text-sm">
                        {isCombo ? `Tables ${label}` : `Table ${label}`}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {opt.capacity} seats{isCombo ? ' combined' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedOption && (
            <p className="text-xs text-blue-600 mt-2 font-medium">
              ✓ Selected:{' '}
              {selectedOption.type === 'combo'
                ? `Tables ${selectedOption.table_numbers.join(' + ')}`
                : `Table ${selectedOption.table_numbers[0]}`}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createMutation.isPending} disabled={selectedSlotIsPast}>
            Create Reservation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditReservationModal({
  reservation,
  onClose,
}: {
  reservation: Reservation;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    guest_name: reservation.guest_name,
    party_size: String(reservation.party_size),
    phone_number: reservation.phone_number ?? '',
    notes: reservation.notes ?? '',
    reservation_date: reservation.reservation_date,
    reservation_time: reservation.reservation_time,
    duration_minutes: reservation.duration_minutes,
    status: reservation.status as ReservationStatus,
  });
  const [error, setError] = useState('');
  const [availableOptions, setAvailableOptions] = useState<AvailableOption[]>([]);
  const [searchedAvail, setSearchedAvail] = useState(false);
  const [selectedOption, setSelectedOption] = useState<AvailableOption | null>(null);

  const resetAvailability = () => {
    setSearchedAvail(false);
    setAvailableOptions([]);
    setSelectedOption(null);
  };

  const set = (patch: Partial<typeof form>, resetsTables = false) => {
    setForm((f) => ({ ...f, ...patch }));
    if (resetsTables) resetAvailability();
  };

  const searchMutation = useMutation({
    mutationFn: (partySize: number) =>
      reservationsApi.getAvailable({
        reservation_date: form.reservation_date,
        reservation_time: form.reservation_time,
        party_size: partySize,
        duration_minutes: form.duration_minutes,
        exclude_reservation_id: reservation.id,
      }),
    onSuccess: (data) => {
      setAvailableOptions(data);
      setSearchedAvail(true);
      setSelectedOption(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const mutation = useMutation({
    mutationFn: (partySize: number) =>
      reservationsApi.update(reservation.id, {
        ...form,
        party_size: partySize,
        phone_number: form.phone_number.trim() || null,
        notes: form.notes.trim() || null,
        ...(selectedOption ? { table_ids: selectedOption.table_ids } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const statusOptions = [
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'seated', label: 'Seated' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'no_show', label: 'No Show' },
  ];

  const tableLabel =
    reservation.tables.length === 0
      ? 'No table assigned'
      : reservation.tables.length === 1
      ? `Table ${reservation.tables[0].table_number}`
      : `Tables ${reservation.tables.map((t) => t.table_number).join(' + ')}`;

  const handleFindAvailable = () => {
    setError('');
    const partySize = parsePartySize(form.party_size);
    if (partySize === null) {
      setError('Party size must be at least 1');
      return;
    }
    if (isPastReservationSlot(form.reservation_date, form.reservation_time)) {
      setError('Reservations must be for a future date and time');
      return;
    }
    searchMutation.mutate(partySize);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const partySize = parsePartySize(form.party_size);
    const validationError = validatePartyAndPhone(partySize, form.phone_number);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (partySize === null) return;
    mutation.mutate(partySize);
  };

  return (
    <Modal open onClose={onClose} title="Edit Reservation" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Guest Name"
            value={form.guest_name}
            onChange={(e) => set({ guest_name: e.target.value })}
            required
          />
          <Input
            label="Party Size"
            type="number"
            min="1"
            value={form.party_size}
            onChange={(e) => set({ party_size: e.target.value }, true)}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Date"
            type="date"
            value={form.reservation_date}
            onChange={(e) => set({ reservation_date: e.target.value }, true)}
          />
          <TimeSelect
            label="Time"
            value={form.reservation_time}
            onChange={(v) => set({ reservation_time: v }, true)}
          />
          <Input
            label="Duration (min)"
            type="number"
            min="30"
            step="15"
            value={form.duration_minutes}
            onChange={(e) => set({ duration_minutes: parseInt(e.target.value) || 90 }, true)}
          />
        </div>

        <Input
          label="Phone Number"
          type="tel"
          value={form.phone_number}
          onChange={(e) => set({ phone_number: e.target.value })}
          hint="Required for parties of 4+. Use 1234567890 or 123-456-7890."
        />

        <Input
          label="Notes"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />

        <Select
          label="Status"
          options={statusOptions}
          value={form.status}
          onChange={(e) => set({ status: e.target.value as ReservationStatus })}
        />

        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <LayoutGrid size={14} className="shrink-0" />
              <span>Current: {tableLabel}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFindAvailable}
              loading={searchMutation.isPending}
            >
              <Search size={14} />
              Find Tables
            </Button>
          </div>

          {searchedAvail && availableOptions.length === 0 && (
            <Alert variant="warning">No tables available for this time slot</Alert>
          )}

          {availableOptions.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {availableOptions.map((opt) => {
                const isSelected =
                  selectedOption !== null &&
                  JSON.stringify(selectedOption.table_ids) === JSON.stringify(opt.table_ids);
                const isCombo = opt.type === 'combo';
                const label = opt.table_numbers.join(' + ');

                return (
                  <button
                    key={opt.table_ids.join('-')}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className={`border rounded-xl p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {isCombo ? (
                        <LayoutGrid size={13} className="text-purple-500 shrink-0" />
                      ) : (
                        <Armchair size={13} className="text-blue-500 shrink-0" />
                      )}
                      <span className="font-medium text-gray-900 text-sm">
                        {isCombo ? `Tables ${label}` : `Table ${label}`}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {opt.capacity} seats{isCombo ? ' combined' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedOption && (
            <p className="text-xs text-blue-600 mt-2 font-medium">
              New assignment:{' '}
              {selectedOption.type === 'combo'
                ? `Tables ${selectedOption.table_numbers.join(' + ')}`
                : `Table ${selectedOption.table_numbers[0]}`}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
