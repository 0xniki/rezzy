import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configApi } from '../api/config';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import { Settings, Save } from 'lucide-react';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', total_extra_chairs: 0 });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
  });

  useEffect(() => {
    if (config) {
      setForm({ name: config.name, total_extra_chairs: config.total_extra_chairs });
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: () => configApi.update(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] });
      setSaveSuccess(true);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage restaurant configuration</p>
        </div>
      </div>

      {saveSuccess && <Alert variant="success" className="mb-4">Settings saved successfully</Alert>}
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 text-gray-700">
            <Settings size={18} />
            <span className="font-medium">Restaurant Details</span>
          </div>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSaveSuccess(false);
              setError('');
              mutation.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              label="Restaurant Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Extra Chairs Pool"
              type="number"
              min="0"
              value={form.total_extra_chairs}
              onChange={(e) =>
                setForm((f) => ({ ...f, total_extra_chairs: parseInt(e.target.value) || 0 }))
              }
              hint="Unassigned chairs that can be moved to any table"
            />
            <div className="flex justify-end pt-2">
              <Button type="submit" loading={mutation.isPending}>
                <Save size={16} />
                Save Settings
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
