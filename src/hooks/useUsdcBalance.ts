import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_CHAIN_ID, USDC_ADDRESS } from '@/lib/arc'

export function useUsdcBalance() {
  const { address } = useAccount()
  const query = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  })

  const amount =
    query.data !== undefined ? Amount.fromRaw(query.data, usdcDecimalsFor(ARC_CHAIN_ID)) : undefined

  return { amount, isLoading: query.isLoading, refetch: query.refetch }
}
