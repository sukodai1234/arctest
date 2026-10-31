# Arc Pay

A simple USDC payments app on Arc Testnet. Connect your wallet, see your live USDC balance, and send USDC to any address. Payment links can prefill the form with `?to=0x...&amount=1.00`.

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

Other scripts: `bun run build`, `bun run check` (lint and typecheck).

### Environment variables

None.
