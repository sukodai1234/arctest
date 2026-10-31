# Arc Pay

A simple USDC payments app on Arc Testnet. Connect your wallet, see your live USDC balance, and send USDC to any address. Payment links can prefill the form with `?to=0x...&amount=1.00`. You can also create a payment request with a shareable link and QR code, so someone else can pay you in a tap. The main screen always shows your balance, the send form and your history; a menu on the left opens the other tools on demand (on phones it opens from the menu button). The app is available in English, Vietnamese and Chinese, with a light and dark mode (both in the menu). A Gift tool creates a one-time claim link that holds USDC: the first person to open it claims the gift, and the sender can reclaim it until then. Extra tools: Invoices (numbered, with due dates and a paid status taken from the chain), Batch send (pay many addresses from a list) and Swap (USDC, EURC and cirBTC). Every tool also shows your latest transactions at the bottom when your wallet has history. An "Add network" button in the bottom-right corner adds Arc Testnet or Arc Mainnet to your wallet (you approve it in the wallet). A Wallet tool shows your address and current USDC balance on Arc Testnet, plus your USDC on other testnets. A Shop tool gives a store a fixed payment QR code and link, and shows payments as they arrive. A Bridge tool moves USDC from Arc Testnet to other testnets (Base, Ethereum, Arbitrum, Optimism, Avalanche, Polygon), with Circle delivering it on the destination so no gas is needed there. The app shows your 5 latest USDC transactions from the chain explorer, so they stay after a reload. A Tip tool offers preset tip amounts ($0.01 to $0.25) or a custom amount, and a link with `?tipTo=0x...` prefills the creator's address.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- Vite, React, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit

## Development

Prerequisites: [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

Build for production with `bunx vite build`. Run `bun run check` for lint and typecheck.

### Environment variables

- `VITE_ARC_TESTNET_EURC_ADDRESS`: EURC token address on Arc Testnet, used to show your EURC balance in the Swap tool (optional; the swap itself works without it).
- `VITE_ARC_TESTNET_CIRBTC_ADDRESS`: cirBTC token address on Arc Testnet, used to show your cirBTC balance in the Swap tool (optional).
