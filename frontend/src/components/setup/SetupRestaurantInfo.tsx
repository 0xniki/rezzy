import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { configApi } from '../../api/config';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Alert from '../ui/Alert';
import { Store, ChevronRight } from 'lucide-react';
import type { RestaurantConfig } from '../../types';

interface Props {
  onNext: () => void;
}

export default function SetupRestaurantInfo({ onNext }: Props) {
  const { data: existingConfig } = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
    retry: false,
  });

  const formKey = existingConfig
    ? `${existingConfig.id}-${existingConfig.name}-${existingConfig.total_extra_chairs}-${existingConfig.weather_location ?? ''}`
    : 'new';

  return (
    <SetupRestaurantInfoForm
      key={formKey}
      existingConfig={existingConfig}
      onNext={onNext}
    />
  );
}

function SetupRestaurantInfoForm({
  existingConfig,
  onNext,
}: Props & { existingConfig?: RestaurantConfig }) {
  const [name, setName] = useState(existingConfig?.name ?? '');
  const [extraChairs, setExtraChairs] = useState(
    String(existingConfig?.total_extra_chairs ?? 0)
  );
  const [weatherLocation, setWeatherLocation] = useState(
    existingConfig?.weather_location ?? ''
  );
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      configApi.create({
        name: name.trim(),
        total_extra_chairs: parseInt(extraChairs) || 0,
        weather_location: weatherLocation.trim() || null,
      }),
    onSuccess: onNext,
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      configApi.update({
        name: name.trim(),
        total_extra_chairs: parseInt(extraChairs) || 0,
        weather_location: weatherLocation.trim() || null,
      }),
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
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-5 sm:px-8 sm:py-6">
        <div className="bg-blue-100 text-blue-600 rounded-xl p-2.5">
          <Store size={22} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Restaurant Information</h2>
          <p className="text-sm text-gray-500">Tell us about your restaurant</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-8 sm:py-6">
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

        <Input
          label="Weather Location"
          placeholder="e.g. Savannah, GA"
          value={weatherLocation}
          onChange={(e) => setWeatherLocation(e.target.value)}
          hint="Used to show hourly weather beside nearby venue events"
        />
      </div>

      <div className="flex border-t border-gray-100 bg-gray-50 px-4 py-4 sm:justify-end sm:px-8">
        <Button type="submit" loading={isPending} size="lg" className="w-full sm:w-auto">
          Continue
          <ChevronRight size={18} />
        </Button>
      </div>
    </form>
  );
}
