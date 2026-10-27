import { useQuery } from '@tanstack/react-query';
import { Config } from '../api/endpoints';
import { keys } from '../api/queryClient';

/** Public server configuration (which optional features are switched on). */
export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: Config.get, staleTime: Infinity }).data;
}
