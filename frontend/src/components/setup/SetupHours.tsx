import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { operatingHoursApi } from '../../api/hours';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import Alert from '../ui/Alert';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { DAY_NAMES } from '../../types';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

interface DayConfig {
  is_closed: boolean;
  open_time: string;
  close_time: string;
}

const DEFAULT_OPEN = '11:00';
const DEFAULT_CLOSE = '22:00';

export default function SetupHours({ onNext, onBack }: Props) {
  const [days, setDays] = useState<DayConfig[]>(
    DAY_NAMES.map(() => ({ is_closed: false, open_time: DEFAULT_OPEN, close_time: DEFAULT_CLOSE }))
  );
  const [error, setError] = useState('');

  const updateDay = (index: number, patch: Partial<DayConfig>) => {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const mutation = useMutation({
    mutationFn: () =>
      operatingHoursApi.bulkCreate(
        days.map((d, i) => ({
          day_of_week: i,
          is_closed: d.is_closed,
          open_time: d.is_closed ? null : d.open_time,
          close_time: d.is_closed ? null : d.close_time,
        }))
      ),
    onSuccess: onNext,
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      if (!d.is_closed && (!d.open_time || !d.close_time)) {
        setError(`Please set open and close times for ${DAY_NAMES[i]}`);
        return;
      }
    }
    mutation.mutate();
  };

  const applyToAll = (config: DayConfig) => {
    setDays(DAY_NAMES.map(() => ({ ...config })));
  };

  const weekdayConfig = days[0];

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-3">
        <div className="bg-purple-100 text-purple-600 rounded-xl p-2.5">
          <Clock size={22} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Operating Hours</h2>
          <p className="text-sm text-gray-500">Set your regular weekly schedule</p>
        </div>
      </div>

      <div className="px-8 py-6">
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {/* Quick apply */}
        <div className="flex items-center gap-2 mb-5 pb-5 border-b border-gray-100">
          <span className="text-sm text-gray-600 mr-1">Quick apply Mon hours to all days:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyToAll(weekdayConfig)}
          >
            Apply to All
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {DAY_NAMES.map((day, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 w-28 shrink-0">{day}</span>
              <Toggle
                checked={!days[i].is_closed}
                onChange={(open) => updateDay(i, { is_closed: !open })}
              />
              {!days[i].is_closed ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={days[i].open_time}
                    onChange={(e) => updateDay(i, { open_time: e.target.value })}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="time"
                    value={days[i].close_time}
                    onChange={(e) => updateDay(i, { close_time: e.target.value })}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeft size={18} />
          Back
        </Button>
        <Button type="submit" loading={mutation.isPending} size="lg">
          Continue
          <ChevronRight size={18} />
        </Button>
      </div>
    </form>
  );
}
