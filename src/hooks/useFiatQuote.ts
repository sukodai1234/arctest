import { useQuery } from '@tanstack/react-query'
import { fiatToUsdc, getFxRate, type FxRate } from '@/lib/fx'

/** Live rate for a currency and the USDC that equals a local price. Refreshes every minute. */
export function useFiatQuote(code: string | undefined, fiatAmount: string | undefined) {
  const query = useQuery<FxRate>({
    queryKey: ['fx', code],
    queryFn: () => getFxRate(code ?? 'USD'),
    enabled: Boolean(code),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })
  const rate = query.data
  const usdc = rate && fiatAmount ? fiatToUsdc(fiatAmount, rate.perUsd) : undefined
  return { rate, usdc, loading: query.isLoading, error: query.isError, refetch: query.refetch }
}
