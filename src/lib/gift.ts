import { createPublicClient, createWalletClient, erc20Abi, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { requireChain } from '@/onchain-facts'
import { ARC_CHAIN_ID, USDC_ADDRESS } from '@/lib/arc'

/**
 * Gift links work like Slush Links: the sender funds a fresh one-time wallet and the link carries
 * that wallet's key in the URL #fragment (never sent to a server). Whoever opens the link first
 * sweeps the funds to their own address. The sender can reclaim before that happens.
 */

/** USDC set aside inside every gift to pay the network fee of the claim. Unused fee goes to the claimer. */
export const GIFT_FEE_RESERVE = '0.01'
export const GIFT_MIN_AMOUNT = '0.02'

const STORAGE_KEY = 'arcpay-gifts-v1'
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/

export interface Gift {
  id: string
  address: `0x${string}`
  /** Private key without the 0x prefix. Saved in this browser so the sender can copy the link again or reclaim. */
  key: string
  amount: string
  /** Sender wallet, so each wallet only sees its own gifts. */
  from: string
  createdAt: number
  /** Set once the funding transfer is confirmed. */
  txHash?: string
  /** The sender took the funds back before anyone claimed them. */
  reclaimed?: boolean
}

export function newGift(amount: string, from: string): Gift {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  return {
    id: crypto.randomUUID().slice(0, 8),
    address: account.address,
    key: privateKey.slice(2),
    amount,
    from,
    createdAt: Date.now(),
  }
}

export function loadGifts(): Gift[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Gift[]) : []
  } catch {
    return []
  }
}

export function saveGifts(list: Gift[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export const claimPath = '/claim'

/** The secret lives only in the #fragment. */
export function giftLink(base: string, key: string): string {
  return `${base}${claimPath}#${key}`
}

export function isClaimRoute(): boolean {
  return window.location.pathname.replace(/\/+$/, '') === claimPath
}

export function readGiftKeyFromHash(hash: string): string | undefined {
  const key = hash.replace(/^#/, '')
  return KEY_PATTERN.test(key) ? key : undefined
}

export function addressOfKey(key: string): `0x${string}` {
  return privateKeyToAccount(`0x${key}`).address
}

const rpcUrl = () => requireChain(ARC_CHAIN_ID).rpcUrls[0]

function publicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(rpcUrl()) })
}

/** USDC (ERC-20 view, 6 decimals) held by an address. */
export async function readGiftBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient().readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
}

export class GiftError extends Error {
  readonly code: 'EMPTY' | 'TOO_SMALL'
  constructor(code: 'EMPTY' | 'TOO_SMALL') {
    super(code)
    this.code = code
  }
}

const NATIVE_PER_USDC_UNIT = 10n ** 12n // gas is metered in the 18-decimal view of the same USDC pool

/**
 * Sends everything the gift wallet holds, minus the network fee, to `to`.
 * The fee is paid from the gift itself, so the claimer needs no funds of their own.
 */
export async function sweepGift(key: string, to: `0x${string}`): Promise<`0x${string}`> {
  const account = privateKeyToAccount(`0x${key}`)
  const client = publicClient()
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl()) })

  const balance = await readGiftBalance(account.address)
  if (balance === 0n) throw new GiftError('EMPTY')

  const gas = await client.estimateContractGas({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, balance],
    account,
  })
  const fees = await client.estimateFeesPerGas()
  const gasLimit = (gas * 12n) / 10n
  const maxFeePerGas = fees.maxFeePerGas
  const feeNative = gasLimit * maxFeePerGas
  const feeUnits = (feeNative + NATIVE_PER_USDC_UNIT - 1n) / NATIVE_PER_USDC_UNIT + 1n
  if (balance <= feeUnits) throw new GiftError('TOO_SMALL')

  const hash = await wallet.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, balance - feeUnits],
    gas: gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  })
  await client.waitForTransactionReceipt({ hash })
  return hash
}
