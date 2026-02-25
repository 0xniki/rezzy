import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { configApi } from '../../api/config';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Alert from '../ui/Alert';
import { Store, ChevronRight } from 'lucide-react';

interface Props {
  onNext: () => void;
}

export default function SetupRestaurantInfo({ onNext }: Props) {
  const [name, setName] = useState('');
  const [extraChairs, setExtraChairs] = useState('0');
  const [error, setError] = useState('');

  const { data: existingConfig } = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
    retry: false,
  });

  // Pre-fill if config already exists
  useEffect(() => {
    if (existingConfig) {
      setName(existingConfig.name);
      setExtraChairs(String(existingConfig.total_extra_chairs));
    }
  }, [existingConfig]);

  const createMutation = useMutation({
    mutationFn: () =>
      configApi.create({ name: name.trim(), total_extra_chairs: parseInt(extraChairs) || 0 }),
    onSuccess: onNext,
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      configApi.update({ name: name.trim(), total_extra_chairs: parseInt(extraChairs) || 0 }),
    onSuccess: onNext,
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Restaurant name is required');
      return;
    }
    if (existingConfig) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-3">
        <div className="bg-blue-100 text-blue-600 rounded-xl p-2.5">
          <Store size={22} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Restaurant Information</h2>
          <p className="text-sm text-gray-500">Tell us about your restaurant</p>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-5">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Restaurant Name"
          placeholder="e.g. The Golden Fork"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />

        <Input
          label="Extra Chairs Pool"
          type="number"
          min="0"
          value={extraChairs}
          onChange={(e) => setExtraChairs(e.target.value)}
          hint="Unassigned chairs that can be moved to any table as needed"
        />
      </div>

      <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <Button type="submit" loading={isPending} size="lg">
          Continue
          <ChevronRight size={18} />
        </Button>
      </div>
    </form>
  );
}
