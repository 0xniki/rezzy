import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tablesApi } from '../../api/tables';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Alert from '../ui/Alert';
import { LayoutGrid, Plus, Trash2, ChevronLeft, CheckCircle } from 'lucide-react';
import type { TableCreate } from '../../types';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

interface TableDraft extends TableCreate {
  key: string;
}

let keyCounter = 0;
const makeKey = () => `t-${++keyCounter}`;

const defaultTable = (): TableDraft => ({
  key: makeKey(),
  table_number: '',
  default_chairs: 4,
  max_chairs: 6,
  x_position: 0,
  y_position: 0,
});

export default function SetupTables({ onNext, onBack }: Props) {
  const [tables, setTables] = useState<TableDraft[]>([defaultTable()]);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const addTable = () => setTables((prev) => [...prev, defaultTable()]);

  const removeTable = (key: string) =>
    setTables((prev) => prev.filter((t) => t.key !== key));

  const updateTable = (key: string, patch: Partial<TableDraft>) =>
    setTables((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const mutation = useMutation({
    mutationFn: async () => {
      for (const t of tables) {
        await tablesApi.create({
          table_number: t.table_number,
          default_chairs: t.default_chairs,
          max_chairs: t.max_chairs,
          x_position: t.x_position,
          y_position: t.y_position,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      onNext();
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (tables.length === 0) {
      setError('Add at least one table');
      return;
    }

    for (const t of tables) {
      if (!t.table_number.trim()) {
        setError('All tables must have a table number');
        return;
      }
      if (t.default_chairs < 1) {
        setError('Default chairs must be at least 1');
        return;
      }
      if (t.max_chairs < t.default_chairs) {
        setError(`Max chairs must be >= default chairs for table ${t.table_number}`);
        return;
      }
    }

    const nums = tables.map((t) => t.table_number.trim());
    if (new Set(nums).size !== nums.length) {
      setError('Table numbers must be unique');
      return;
    }

    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-5 sm:px-8 sm:py-6">
        <div className="bg-green-100 text-green-600 rounded-xl p-2.5">
          <LayoutGrid size={22} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Table Layout</h2>
          <p className="text-sm text-gray-500">Add your tables and seating capacity</p>
        </div>
      </div>

      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto px-4 py-5 sm:max-h-[50vh] sm:px-8 sm:py-6">
        {error && <Alert variant="error">{error}</Alert>}

        {tables.map((t) => (
          <div key={t.key} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <div className="mb-3 flex items-start justify-between">
              <span className="text-sm font-semibold text-gray-700">Table</span>
              <button
                type="button"
                onClick={() => removeTable(t.key)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Table #"
                placeholder="e.g. T1, A2"
                value={t.table_number}
                onChange={(e) => updateTable(t.key, { table_number: e.target.value })}
              />
              <Input
                label="Default Chairs"
                type="number"
                min="1"
                value={t.default_chairs}
                onChange={(e) =>
                  updateTable(t.key, { default_chairs: parseInt(e.target.value) || 1 })
                }
              />
              <Input
                label="Max Chairs"
                type="number"
                min="1"
                value={t.max_chairs}
                onChange={(e) =>
                  updateTable(t.key, { max_chairs: parseInt(e.target.value) || 1 })
                }
              />
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={addTable} className="w-full">
          <Plus size={16} />
          Add Table
        </Button>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:justify-between sm:px-8">
        <Button type="button" variant="ghost" onClick={onBack} className="w-full sm:w-auto">
          <ChevronLeft size={18} />
          Back
        </Button>
        <Button type="submit" loading={mutation.isPending} size="lg" className="w-full sm:w-auto">
          <CheckCircle size={18} />
          Finish Setup
        </Button>
      </div>
    </form>
  );
}
