# Octorand Recover

Angular 20 app that talks to the still-live Octorand Prime contracts on Algorand mainnet.

The original site is gone. Each Gen 1 / Gen 2 Prime is still a vault app. If a Prime holds NFTs, OCTO, or extra ALGO, the owner can pull them out from here.

Visual language comes from [CorvidLabs/design-system](https://github.com/CorvidLabs/design-system): `assets/tokens.css` is imported as `src/brand/tokens.css`, Schibsted Grotesk + Spline Sans Mono, sheen accent, sun/moon theme toggle. No purple, no pixel fonts.

## Run

```bash
cd web
bun install
bun start
```

Open http://127.0.0.1:4200, connect Pera / Defly / Lute / Kibisis, then scan the wallet that holds `OG1-*` or `OG2-*`.

Hosted build: https://corvidlabs.github.io/octorand-recover/

## What it calls

You never call the Prime app directly. User calls go through the 2024 routers created by `NXZLEEQ…`:

| Action | Gen 1 router | Gen 2 router |
| --- | --- | --- |
| Extract ASA | `2141433934` | `2141438961` |
| Withdraw OCTO | `2141433746` | `2141437705` |
| Withdraw ALGO | `2141435280` | `2141439903` |

The connected wallet must hold the Prime remint (`OG1-*` / `OG2-*`). The original 2022 ASA sitting inside the vault is identity, not an extra NFT extract.

Nested Primes (a Prime stored in another Prime) can be extracted first, then scanned again as their own vaults.
