# Octorand Recover

[![License: MIT](https://img.shields.io/badge/license-MIT-0E6F66.svg)](LICENSE)

Octorand shut the site down. The smart contracts did not.

Each Gen 1 and Gen 2 Prime is still an Algorand app with a vault. This repo is a wallet UI for those contracts. It finds the vault from the ASA in a wallet, claims the remint when the contract still allows it, and withdraws OCTO, other ASAs, and free ALGO.

## How the contract moves ASAs

A Prime has two ASAs:

| Role | What you see | Where it ends up |
| --- | --- | --- |
| Original | `OP2-*` (Gen 2), `OCTO-*`, or the older Gen 1 ASA | Deposited into the vault by claim. It stays there. |
| Remint | `OG1-*` or `OG2-*` | Comes to the wallet on claim. Withdrawals require it. |

Claim is one group. The router checks that the next transaction sends **1** original ASA to the vault. The Prime app then sends **1** remint to the caller and closes the claim slot. That slot is byte 47 of global state `P1`, and it can fire once.

OCTO (`559219992`, 6 decimals) is a separate balance inside the vault. Withdrawing it is a second call. The wallet must already hold the remint. The original ASA does not come back with the OCTO.

If a wallet shows the original at amount 0 and a new `OG1-*` or `OG2-*` plus an OCTO balance, that is the contract finishing the claim and the withdrawal.

## App

```bash
cd web
bun install
bun start
```

Connect the wallet that holds the original or the remint, scan, then claim or withdraw.

Live: https://corvidlabs.github.io/octorand-recover/

The call shapes, router ids, and `P1` layout are in `web/README.md`. Reversed TEAL is indexed in `teal/README.md`.
