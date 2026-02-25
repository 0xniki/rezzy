import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { operatingHoursApi } from '../api/hours';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toggle from '../components/ui/Toggle';
import Alert from '../components/ui/Alert';
import { Clock, Save } from 'lucide-react';
import { DAY_NAMES } from '../types';
import { formatTime } from '../lib/utils';

export default function HoursPage() {
  const qc = useQueryClient();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  const { data: hours = [], isLoading } = useQuery({
    queryKey: ['operatingHours'],
    queryFn: operatingHoursApi.list,
  });

  // Local editable state
  const [edits, setEdits] = useState<
    Record<number, { is_closed: boolean; open_time: string; close_time: string }>
  >({});

  const hoursMap = Object.fromEntries(hours.map((h) => [h.day_of_week, h]));

  const getDay = (i: number) =>
    edits[i] ?? {
      is_closed: hoursMap[i]?.is_closed ?? false,
      open_time: hoursMap[i]?.open_time ?? '11:00',
      close_time: hoursMap[i]?.close_time ?? '22:00',
    };

  const updateDay = (i: number, patch: Partial<ReturnType<typeof getDay>>) => {
    setEdits((e) => ({ ...e, [i]: { ...getDay(i), ...patch } }));
    setSaveSuccess(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 7; i++) {
        const d = getDay(i);
        if (hoursMap[i]) {
          await operatingHoursApi.update(i, {
            is_closed: d.is_closed,
            open_time: d.is_closed ? null : d.open_time,
            close_time: d.is_closed ? null : d.close_time,
          });
        } else {
          await operatingHoursApi.create({
            day_of_week: i,
            is_closed: d.is_closed,
            open_time: d.is_closed ? null : d.open_time,
            close_time: d.is_closed ? null : d.close_time,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operatingHours'] });
      setEdits({});
      setSaveSuccess(true);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-gray-400">Loading hours…</div>;
  }

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operating Hours</h1>
          <p className="text-gray-500 text-sm mt-0.5">Set your regular weekly schedule</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!hasEdits}
        >
          <Save size={16} />
          Save Changes
        </Button>
      </div>

      {saveSuccess && <Alert variant="success" className="mb-4">Hours saved successfully</Alert>}
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-gray-700">
            <Clock size={18} />
            <span className="font-medium">Weekly Schedule</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {DAY_NAMES.map((day, i) => {
            const d = getDay(i);
            const isEdited = !!edits[i];
            return (
              <div
                key={i}
                className="flex items-center gap-6 px-6 py-4 border-b border-gray-100 last:border-0"
              >
                <div className="w-28 flex items-center gap-2">
                  <span className="font-medium text-gray-800">{day}</span>
                  {isEdited && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">
                      unsaved
                    </span>
                  )}
                </div>
                <Toggle
                  checked={!d.is_closed}
                  onChange={(open) => updateDay(i, { is_closed: !open })}
                />
                {!d.is_closed ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={d.open_time}
                      onChange={(e) => updateDay(i, { open_time: e.target.value })}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-gray-400 text-sm">—</span>
                    <input
                      type="time"
                      value={d.close_time}
                      onChange={(e) => updateDay(i, { close_time: e.target.value })}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-500">
                      ({formatTime(d.open_time)} – {formatTime(d.close_time)})
                    </span>
                  </div>
                ) : (
                  <Badge color="gray">Closed</Badge>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
