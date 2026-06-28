import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tablesApi } from '../api/tables';
import { Card, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import Toggle from '../components/ui/Toggle';
import { Armchair, Plus, Trash2, Edit2 } from 'lucide-react';
import type { Table, TableCreate, TableUpdate } from '../types';
import { useAuth } from '../context/useAuth';

export default function TablesPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [showCreate, setShowCreate] = useState(false);
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [adjustTable, setAdjustTable] = useState<Table | null>(null);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => tablesApi.list(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tablesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-gray-400">Loading tables…</div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tables</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage seating layout</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)} className="w-full sm:w-auto">
            <Plus size={16} />
            Add Table
          </Button>
        )}
      </div>

      {/* Tables grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tables.map((table) => (
          <Card key={table.id} className={!table.is_active ? 'opacity-60' : ''}>
            <CardBody>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-lg font-bold text-gray-900">{table.table_number}</span>
                  {!table.is_active && <Badge color="gray">Inactive</Badge>}
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setAdjustTable(table)}>
                      <Armchair size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditTable(table)}>
                      <Edit2 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(table.id)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="text-lg font-bold text-gray-900">{table.current_chairs}</div>
                  <div className="text-xs text-gray-500">Current</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="text-lg font-bold text-gray-900">{table.default_chairs}</div>
                  <div className="text-xs text-gray-500">Default</div>
                </div>
                <div className="bg-gray-50 rounded-lg py-2">
                  <div className="text-lg font-bold text-gray-900">{table.max_chairs}</div>
                  <div className="text-xs text-gray-500">Max</div>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
        {tables.length === 0 && (
          <div className="py-12 text-center text-gray-400 md:col-span-2 lg:col-span-3">
            No tables yet. Add your first table.
          </div>
        )}
      </div>

      {isAdmin && (
        <CreateTableModal open={showCreate} onClose={() => setShowCreate(false)} />
      )}
      {isAdmin && editTable && (
        <EditTableModal table={editTable} onClose={() => setEditTable(null)} />
      )}
      {isAdmin && adjustTable && (
        <AdjustChairsModal table={adjustTable} onClose={() => setAdjustTable(null)} />
      )}
    </div>
  );
}

// ─── Create Table Modal ───────────────────────────────────────────────────────

function CreateTableModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<TableCreate>({
    table_number: '',
    default_chairs: 4,
    max_chairs: 6,
    x_position: 0,
    y_position: 0,
  });
  const [error, setError] = useState('');
  const set = (p: Partial<TableCreate>) => setForm((f) => ({ ...f, ...p }));

  const mutation = useMutation({
    mutationFn: () => tablesApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add Table">
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
          label="Table Number"
          placeholder="e.g. T1, Patio-3"
          value={form.table_number}
          onChange={(e) => set({ table_number: e.target.value })}
          required
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Default Chairs"
            type="number"
            min="1"
            value={form.default_chairs}
            onChange={(e) => set({ default_chairs: parseInt(e.target.value) || 1 })}
          />
          <Input
            label="Max Chairs"
            type="number"
            min="1"
            value={form.max_chairs}
            onChange={(e) => set({ max_chairs: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="w-full sm:w-auto">Add Table</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Table Modal ─────────────────────────────────────────────────────────

function EditTableModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<TableUpdate>({
    table_number: table.table_number,
    default_chairs: table.default_chairs,
    max_chairs: table.max_chairs,
    is_active: table.is_active,
  });
  const [error, setError] = useState('');
  const set = (p: Partial<TableUpdate>) => setForm((f) => ({ ...f, ...p }));

  const mutation = useMutation({
    mutationFn: () => tablesApi.update(table.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open onClose={onClose} title={`Edit Table ${table.table_number}`}>
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
          label="Table Number"
          value={form.table_number ?? ''}
          onChange={(e) => set({ table_number: e.target.value })}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Default Chairs"
            type="number"
            min="1"
            value={form.default_chairs}
            onChange={(e) => set({ default_chairs: parseInt(e.target.value) || 1 })}
          />
          <Input
            label="Max Chairs"
            type="number"
            min="1"
            value={form.max_chairs}
            onChange={(e) => set({ max_chairs: parseInt(e.target.value) || 1 })}
          />
        </div>
        <Toggle
          checked={form.is_active ?? true}
          onChange={(v) => set({ is_active: v })}
          label="Active"
        />
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="w-full sm:w-auto">Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Adjust Chairs Modal ─────────────────────────────────────────────────────

function AdjustChairsModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const qc = useQueryClient();
  const [newChairCount, setNewChairCount] = useState(table.current_chairs);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      tablesApi.rearrangeChairs([
        { table_id: table.id, new_chair_count: newChairCount },
      ]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['config'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open onClose={onClose} title={`Adjust Chairs ${table.table_number}`}>
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
          label="Current Chairs"
          type="number"
          min="0"
          max={table.max_chairs}
          value={newChairCount}
          onChange={(e) => setNewChairCount(parseInt(e.target.value) || 0)}
        />
        <div className="text-sm text-gray-500">
          Default {table.default_chairs}, max {table.max_chairs}
        </div>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="w-full sm:w-auto">Save Chairs</Button>
        </div>
      </form>
    </Modal>
  );
}
