import { useQuery } from '@tanstack/react-query';
import { configApi } from '../api/config';
import { operatingHoursApi } from '../api/hours';
import { tablesApi } from '../api/tables';

export function useSetupStatus() {
  const config = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
    retry: false,
  });

  const hours = useQuery({
    queryKey: ['operatingHours'],
    queryFn: operatingHoursApi.list,
    enabled: config.isSuccess,
  });

  const tables = useQuery({
    queryKey: ['tables'],
    queryFn: () => tablesApi.list(),
    enabled: config.isSuccess,
  });

  const isLoading =
    config.isLoading ||
    (config.isSuccess && hours.isLoading) ||
    (config.isSuccess && tables.isLoading);

  const hasConfig = config.isSuccess && !!config.data;
  const hasHours = hours.isSuccess && (hours.data?.length ?? 0) > 0;
  const hasTables = tables.isSuccess && (tables.data?.length ?? 0) > 0;

  const needsSetup = !hasConfig || !hasHours || !hasTables;

  // First step that still needs completing (1-indexed)
  const firstIncompleteStep = !hasConfig ? 1 : !hasHours ? 2 : !hasTables ? 3 : null;

  return { isLoading, needsSetup, hasConfig, hasHours, hasTables, firstIncompleteStep };
}
