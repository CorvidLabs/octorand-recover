# Octorand Recover

[![License: MIT](https://img.shields.io/badge/license-MIT-0E6F66.svg)](LICENSE)

Octorand shut the site down. The smart contracts did not.

Gen 1 and Gen 2 Primes are Algorand apps that can still hold ASAs. This repo is a wallet UI that finds those vaults and extracts whatever is inside.

## App

```bash
cd web
bun install
bun start
```

Connect the wallet that holds the Prime, scan, extract.

Live: https://corvidlabs.github.io/octorand-recover/

Details live in `web/README.md`. Reversed TEAL is in `teal/`.
