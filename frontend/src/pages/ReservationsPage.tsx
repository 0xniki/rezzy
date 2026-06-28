import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reservationsApi } from '../api/reservations';
import { operatingHoursApi, specialHoursApi } from '../api/hours';
import { eventsApi } from '../api/events';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Alert from '../components/ui/Alert';
import { Plus, Search, CalendarDays, Users, Phone, ChevronLeft, ChevronRight, Armchair, LayoutGrid, AlertCircle, CloudSun, CalendarClock, MapPin, Clock, ExternalLink, CloudRain, Wind } from 'lucide-react';
import { formatTime, formatDate, todayString } from '../lib/utils';
import type {
  Reservation,
  ReservationCreate,
  ReservationUpdate,
  ReservationStatus,
  AvailableOption,
  OperatingHours,
  SpecialHours,
  DailyEventsContext,
} from '../types';

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
const RESERVATION_CUTOFF_MINUTES = 30;

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

function parseDateString(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function backendDayOfWeek(date: string): number {
  return (parseDateString(date).getDay() + 6) % 7;
}

function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function findEffectiveHours(
  date: string,
  operatingHours: OperatingHours[],
  specialHours: SpecialHours[]
): { open_time: string | null; close_time: string | null; is_closed: boolean } | null {
  const special = specialHours.find((h) => h.date === date);
  if (special) return special;

  return operatingHours.find((h) => h.day_of_week === backendDayOfWeek(date)) ?? null;
}

function bookableTimeSlots(
  date: string,
  operatingHours: OperatingHours[],
  specialHours: SpecialHours[]
): string[] {
  const hours = findEffectiveHours(date, operatingHours, specialHours);
  if (!hours || hours.is_closed || !hours.open_time || !hours.close_time) return [];

  const openMinutes = timeToMinutes(hours.open_time);
  const cutoffMinutes = timeToMinutes(hours.close_time) - RESERVATION_CUTOFF_MINUTES;

  return TIME_SLOTS.filter((slot) => {
    const slotMinutes = timeToMinutes(slot);
    return (
      slotMinutes >= openMinutes &&
      slotMinutes <= cutoffMinutes &&
      !isPastReservationSlot(date, slot)
    );
  });
}

function useBookableTimeSlots(date: string) {
  const { data: operatingHours = [], isLoading: loadingOperatingHours } = useQuery({
    queryKey: ['operatingHours'],
    queryFn: operatingHoursApi.list,
  });
  const { data: specialHours = [], isLoading: loadingSpecialHours } = useQuery({
    queryKey: ['specialHours', date],
    queryFn: () => specialHoursApi.list(date, date),
  });

  return {
    options: bookableTimeSlots(date, operatingHours, specialHours),
    isLoading: loadingOperatingHours || loadingSpecialHours,
  };
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

function defaultSelectedDateForWeek(weekStart: Date): string {
  const start = toISO(weekStart);
  const end = toISO(addDays(weekStart, 6));
  const today = todayString();
  return today >= start && today <= end ? today : start;
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
  const [activeTab, setActiveTab] = useState<'reservations' | 'events'>('reservations');
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

  const goToWeek = (nextWeekStart: Date) => {
    setWeekStart(nextWeekStart);
    setSelectedDate(defaultSelectedDateForWeek(nextWeekStart));
  };

  const jumpToDate = (date: string) => {
    if (!date) return;
    setSelectedDate(date);
    setWeekStart(getWeekStart(parseDateString(date)));
  };

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
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage bookings and guest assignments</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="w-full sm:w-auto">
          <Plus size={16} />
          New Reservation
        </Button>
      </div>

      {/* Week selector */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {formatDate(startDate)} - {formatDate(endDate)}
            </p>
          </div>
          <label className="flex w-full flex-col gap-1 text-sm font-medium text-gray-700 sm:w-52">
            Date
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => jumpToDate(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 px-2 py-3 sm:px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToWeek(addDays(weekStart, -7))}
          >
            <ChevronLeft size={16} />
          </Button>
          <div key={startDate} className="grid flex-1 grid-cols-7 gap-1 overflow-x-auto animate-rezzy-fade-slide">
            {weekDays.map(({ date, iso, count }) => {
              const isSelected = iso === selectedDate;
              const isToday = iso === todayString();
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  className={`flex min-w-10 flex-col items-center rounded-xl px-1 py-2 text-xs transition-colors sm:min-w-0 ${
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
            onClick={() => goToWeek(addDays(weekStart, 7))}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </Card>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('reservations')}
          className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
            activeTab === 'reservations'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <CalendarDays size={16} />
          Reservations
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
            activeTab === 'events'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <CloudSun size={16} />
          Events
        </button>
      </div>

      {activeTab === 'reservations' ? (
        <ReservationsDayCard
          selectedDate={selectedDate}
          dayRes={dayRes}
          now={now}
          onEdit={setEditRes}
          onCancel={(id) => cancelMutation.mutate(id)}
          cancelling={cancelMutation.isPending}
        />
      ) : (
        <EventsDayCard selectedDate={selectedDate} />
      )}

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

function ReservationsDayCard({
  selectedDate,
  dayRes,
  now,
  onEdit,
  onCancel,
  cancelling,
}: {
  selectedDate: string;
  dayRes: Reservation[];
  now: Date;
  onEdit: (reservation: Reservation) => void;
  onCancel: (id: number) => void;
  cancelling: boolean;
}) {
  return (
    <Card key={selectedDate} className="animate-rezzy-fade-slide">
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
                  className={`flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-6 ${
                    soon ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-3 sm:w-16 sm:shrink-0 sm:flex-col sm:items-center">
                    <span className="text-sm font-bold text-gray-900">{formatTime(r.reservation_time)}</span>
                    <span className="text-xs text-gray-400">{r.duration_minutes}m</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      {soon && (
                        <span title="Starting within 1 hour — place reserve sign">
                          <AlertCircle size={16} className="text-red-500 shrink-0 animate-pulse" />
                        </span>
                      )}
                      <span className="font-medium text-gray-900">{r.guest_name}</span>
                      <Badge color={STATUS_COLORS[r.status]}>{r.status}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
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
                        <span className="max-w-full truncate italic sm:max-w-xs">"{r.notes}"</span>
                      )}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(r)}>
                      Edit
                    </Button>
                    {r.status === 'confirmed' || r.status === 'seated' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancel(r.id)}
                        loading={cancelling}
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
  );
}

function EventsDayCard({ selectedDate }: { selectedDate: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dailyEventsContext', selectedDate],
    queryFn: () => eventsApi.dailyContext(selectedDate),
    refetchInterval: 15 * 60_000,
  });

  return (
    <Card key={`events-${selectedDate}`} className="animate-rezzy-fade-slide">
      <CardHeader>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-gray-900">{formatDate(selectedDate)}</h2>
          {data?.window_start && data?.window_end && (
            <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
              <Clock size={13} />
              {formatIsoTime(data.window_start)} - {formatIsoTime(data.window_end)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {isLoading && (
          <div className="py-10 text-center text-sm text-gray-400">Loading weather and nearby events...</div>
        )}
        {error && <Alert variant="error">Could not load weather and event context.</Alert>}
        {data && <EventsDayContent data={data} />}
      </CardBody>
    </Card>
  );
}

function EventsDayContent({ data }: { data: DailyEventsContext }) {
  if (data.is_closed) {
    return (
      <div className="py-10 text-center text-gray-400">
        <CalendarClock size={36} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Closed for this day</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-gray-700">
            <CloudSun size={18} />
            <h3 className="text-sm font-semibold">Hourly Weather</h3>
          </div>
          {data.weather_location && (
            <span className="flex min-w-0 items-center gap-1 truncate text-xs text-gray-500">
              <MapPin size={12} />
              {data.weather_location}
            </span>
          )}
        </div>
        {data.weather.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            No hourly weather for the operating window
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {data.weather.map((hour) => (
              <div key={hour.time} className="grid grid-cols-[5.5rem_1fr] gap-3 px-3 py-3 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
                <span className="text-sm font-semibold text-gray-900">{formatIsoTime(hour.time)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-700">{hour.condition ?? 'Weather'}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <CloudRain size={12} />
                      {hour.precipitation_probability ?? 0}%
                    </span>
                    {hour.wind_speed_mph !== null && (
                      <span className="flex items-center gap-1">
                        <Wind size={12} />
                        {Math.round(hour.wind_speed_mph)} mph
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-900 sm:text-right">
                  {hour.temperature_f !== null ? `${Math.round(hour.temperature_f)}°F` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-gray-700">
          <CalendarClock size={18} />
          <h3 className="text-sm font-semibold">Nearby Events</h3>
        </div>
        {data.events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            No venue events during the operating window
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {data.events.map((event) => (
              <div key={`${event.source}-${event.starts_at}-${event.name}`} className="px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{event.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatIsoTime(event.starts_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {event.venue ?? event.source}
                      </span>
                    </div>
                  </div>
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${event.name}`}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
                <Badge color={event.source === 'Enmarket Arena' ? 'purple' : 'blue'} className="mt-2">
                  {event.source}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.errors.length > 0 && (
        <div className="lg:col-span-2">
          <Alert variant="warning">{data.errors.join(' ')}</Alert>
        </div>
      )}
    </div>
  );
}

function formatIsoTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Time select ──────────────────────────────────────────────────────────────

function TimeSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  preserveInvalidValue = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  preserveInvalidValue?: boolean;
}) {
  const normalizedValue = normalizeTime(value);
  const renderedOptions =
    preserveInvalidValue && normalizedValue && !options.includes(normalizedValue)
      ? [normalizedValue, ...options]
      : options;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        value={renderedOptions.includes(normalizedValue) ? normalizedValue : ''}
        disabled={disabled || renderedOptions.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {renderedOptions.length === 0 && <option value="">No times available</option>}
        {renderedOptions.map((t) => (
          <option key={t} value={t}>
            {formatSlot(t)}
            {preserveInvalidValue && t === normalizedValue && !options.includes(t) ? ' (current)' : ''}
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
  const { options: currentTimeOptions, isLoading: loadingCurrentTimeOptions } = useBookableTimeSlots(form.reservation_date);
  const selectedReservationTime =
    currentTimeOptions.includes(normalizeTime(form.reservation_time))
      ? normalizeTime(form.reservation_time)
      : currentTimeOptions[0] ?? '';
  const noBookableTimes = !loadingCurrentTimeOptions && currentTimeOptions.length === 0;

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
        reservation_time: selectedReservationTime,
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
    if (!selectedReservationTime) {
      setError('No bookable times for this date');
      return;
    }
    if (form.table_ids.length === 0) {
      setError('Please search for availability and select a table assignment');
      return;
    }
    createMutation.mutate({
      ...form,
      party_size: partySize,
      reservation_time: selectedReservationTime,
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
    if (!selectedReservationTime) {
      setError('No bookable times for this date');
      return;
    }
    searchMutation.mutate(partySize);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Reservation" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            value={selectedReservationTime}
            options={currentTimeOptions}
            disabled={loadingCurrentTimeOptions || noBookableTimes}
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
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-gray-700">Table Assignment</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFindAvailable}
              loading={searchMutation.isPending}
              disabled={loadingCurrentTimeOptions || noBookableTimes}
            >
              <Search size={14} />
              Find Available
            </Button>
          </div>

          {searchedAvail && availableOptions.length === 0 && (
            <Alert variant="warning">No tables available for this time slot</Alert>
          )}
          {noBookableTimes && (
            <Alert variant="warning">No bookable times for this date</Alert>
          )}

          {availableOptions.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" loading={createMutation.isPending} disabled={loadingCurrentTimeOptions || noBookableTimes} className="w-full sm:w-auto">
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
  const { options: currentTimeOptions, isLoading: loadingCurrentTimeOptions } = useBookableTimeSlots(form.reservation_date);
  const originalReservationTime = normalizeTime(reservation.reservation_time);
  const formReservationTime = normalizeTime(form.reservation_time);
  const timeUnchanged =
    form.reservation_date === reservation.reservation_date &&
    formReservationTime === originalReservationTime &&
    form.duration_minutes === reservation.duration_minutes;
  const displayedReservationTime = currentTimeOptions.includes(formReservationTime)
    ? formReservationTime
    : timeUnchanged
    ? formReservationTime
    : currentTimeOptions[0] ?? '';
  const selectedTimeIsBookable = currentTimeOptions.includes(displayedReservationTime);
  const dateTimeChanged =
    form.reservation_date !== reservation.reservation_date ||
    displayedReservationTime !== originalReservationTime ||
    form.duration_minutes !== reservation.duration_minutes;
  const noBookableTimes = !loadingCurrentTimeOptions && currentTimeOptions.length === 0;
  const dateTimeChangeBlocked = dateTimeChanged && !selectedTimeIsBookable;

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
        reservation_time: displayedReservationTime,
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
    mutationFn: (partySize: number) => {
      const payload: ReservationUpdate = {
        guest_name: form.guest_name,
        party_size: partySize,
        phone_number: form.phone_number.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
        ...(selectedOption ? { table_ids: selectedOption.table_ids } : {}),
      };

      if (dateTimeChanged) {
        payload.reservation_date = form.reservation_date;
        payload.reservation_time = displayedReservationTime;
        payload.duration_minutes = form.duration_minutes;
      }

      return reservationsApi.update(reservation.id, payload);
    },
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
    if (!selectedTimeIsBookable) {
      setError(noBookableTimes ? 'No bookable times for this date' : 'Choose a bookable time before finding tables');
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
    if (dateTimeChangeBlocked) {
      setError(noBookableTimes ? 'No bookable times for this date' : 'Choose a bookable time before saving date or time changes');
      return;
    }
    mutation.mutate(partySize);
  };

  return (
    <Modal open onClose={onClose} title="Edit Reservation" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            value={form.reservation_date}
            onChange={(e) => set({ reservation_date: e.target.value }, true)}
          />
          <TimeSelect
            label="Time"
            value={displayedReservationTime}
            options={currentTimeOptions}
            disabled={loadingCurrentTimeOptions || (noBookableTimes && !timeUnchanged)}
            preserveInvalidValue={timeUnchanged}
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

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm text-gray-600">
              <LayoutGrid size={14} className="shrink-0" />
              <span className="truncate">Current: {tableLabel}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFindAvailable}
              loading={searchMutation.isPending}
              disabled={loadingCurrentTimeOptions || !selectedTimeIsBookable}
            >
              <Search size={14} />
              Find Tables
            </Button>
          </div>

          {searchedAvail && availableOptions.length === 0 && (
            <Alert variant="warning">No tables available for this time slot</Alert>
          )}
          {!loadingCurrentTimeOptions && !selectedTimeIsBookable && (
            <Alert variant="warning">
              {noBookableTimes
                ? 'No bookable times for this date'
                : 'Choose a bookable time before finding tables'}
            </Alert>
          )}

          {availableOptions.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={loadingCurrentTimeOptions || dateTimeChangeBlocked} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
