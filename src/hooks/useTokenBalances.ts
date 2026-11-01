import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { Amount } from '@/onchain-money'
import { ARC_CHAIN_ID } from '@/lib/arc'
import { ARC_TOKENS, type ArcToken, type TokenId } from '@/lib/tokens'

/** ERC-20 balances of the connected wallet for every Arc token the app knows. */
export function useTokenBalances() {
  const { address } = useAccount()
  const { data, refetch, isFetching } = useReadContracts({
    allowFailure: true,
    contracts: ARC_TOKENS.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address ?? '0x0000000000000000000000000000000000000001'] as const,
      chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  })

  const balances = useMemo(() => {
    const map: Partial<Record<TokenId, Amount>> = {}
    ARC_TOKENS.forEach((token: ArcToken, i) => {
      const result = data?.[i]
      if (result && result.status === 'success') map[token.id] = Amount.fromRaw(result.result, token.decimals)
    })
    return map
  }, [data])

  return { balances, refetch, isFetching }
}
