# Octorand Recover

Angular 20 app that talks to the still-live Octorand Prime contracts on Algorand mainnet.

The original site is gone. Each Gen 1 and Gen 2 Prime is still a vault app. The app finds that vault from either ASA, runs the on-chain claim when the original is still in the wallet, then withdraws OCTO, other ASAs, and free ALGO.

Visual language comes from [CorvidLabs/design-system](https://github.com/CorvidLabs/design-system): `assets/tokens.css` is imported as `src/brand/tokens.css`, Schibsted Grotesk + Spline Sans Mono, sheen accent, sun/moon theme toggle. No purple, no pixel fonts.

## Run

```bash
cd web
bun install
bun start
```

Open http://127.0.0.1:4200, connect Pera / Defly / Lute / Kibisis, then scan the wallet that holds an original (`OP2-*`, `OCTO-*`) or a remint (`OG1-*`, `OG2-*`).

Hosted build: https://corvidlabs.github.io/octorand-recover/

## Two ASAs, one Prime

`P1` in the Prime's global state names both ASAs:

| Offset | Field | Gen 2 example |
| --- | --- | --- |
| 0 | Prime index | `5131` |
| 8 | OCTO asset id | `559219992` |
| 16 | Remint asset id | `2143376645` (`OG2-5131`) |
| 24 | Original asset id | `626516065` (`OP2-5131`) |
| byte 47 | Claim slot | `0` until claim, then `1` |

Gen 2 originals are named `Octo Prime Gen2 #N` with unit `OP2-N`. Remints are `Octorand Gen2 #N` with unit `OG2-N`. Gen 1 remints are `OG1-N`. Older Gen 1 originals use `OCTO-N` or the 2022 ASA id stored at offset 24.

The scan treats every held ASA except the OCTO token as a candidate. A deleted app id in that ASA's history is skipped. The vault that matches is the app whose `P1` remint or original equals the ASA.

## What it calls

User calls go through the 2024 routers created by `NXZLEEQ35KIZ3V3MHFXOOQNEINVLYAU7JCAOZZTQRCDREO4O34I27KLIXU`. Those routers are the only callers the Prime app accepts. Gen 1 routers require the Prime's creator to be `WLBZZ2XA…`. Gen 2 routers require `RFBPCQV6…`. The two claim routers are the same program; the factory address is the only difference.

| Action | Selector | Gen 1 router | Gen 2 router |
| --- | --- | --- | --- |
| Claim remint | `a0cba8dd` | `2141434605` | `2141439838` |
| Extract ASA | `f79ff952` | `2141433934` | `2141438961` |
| Withdraw OCTO | `a153ff0d` | `2141433746` | `2141437705` |
| Withdraw ALGO | `32506c70` | `2141435280` | `2141439903` |

### Claim

Claim runs only while byte 47 of `P1` is `0`. The group, in order:

1. Opt in to the remint, when the wallet is not already opted in.
2. App call the claim router. Args are the selector and `0x01` (the Prime is foreign app 1; index 0 is the router). Foreign apps: `[prime]`. Foreign assets: `[remint]`. Fee covers the outer call plus the inner app call and the inner ASA transfer (`3000` microALGO at the minimum fee).
3. The next transaction, and it must be the next one, sends amount `1` of the original ASA to the Prime's app address.

The router reads `P1` at offset 24 for that asset id and checks the payment. The inner call is Prime method `3a3762b0`. The Prime sends amount `1` of the remint (`P1` offset 16) to the caller and sets byte 47 to `1`.

After that, the original ASA balance in the wallet is 0. The ASA still exists, inside the vault. The wallet holds the remint.

### Withdraw

Extract, OCTO withdrawal, and ALGO withdrawal all require the caller to hold the remint. The routers read `P1` offset 16 and assert that balance is greater than 0.

OCTO withdrawal pays the vault's balance of asset `559219992`. It does not move the original ASA. A wallet that receives OCTO and no longer shows the original ASA has completed both calls.

ASA extract uses foreign assets `[remint, OCTO, asset being withdrawn]`, matching the old site. The remint, the original, and the OCTO asset id are identity slots. They are listed on the vault and are not offered on the NFT extract path. Take OCTO is the path for the token balance.

Free ALGO is `vault balance - minimum balance`. Extracting ASAs first can lower the minimum and reveal ALGO.

Nested Primes (a Prime stored in another Prime) can be extracted first, then scanned again as their own vaults.

A rekeyed Prime account stays the transaction sender. The auth address signs. Simulate sets `sgnr` to that auth address so a rekey is not reported as a bad signature.
