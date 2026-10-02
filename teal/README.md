# Reversed TEAL

These are disassemblies of the programs the recover app calls. The Prime app is shared by Gen 1 and Gen 2. The routers differ by factory address.

| File | Program |
| --- | --- |
| `prime-approval.teal` | Prime app. Claim inner method `3a3762b0` sends the remint and closes byte 47 of `P1`. |
| `gen1-vault-withdraw-router.teal` | Gen 1 ASA extract, router `2141433934`. |
| `gen1-vault-optin-router.teal` | Gen 1 vault opt-in, router `2141433859`. |
| `gen1-octo-withdraw-router.teal` | Gen 1 OCTO withdrawal, router `2141433746`. |
| `gen2-vault-withdraw-router.teal` | Gen 2 ASA extract, router `2141438961`. |

The claim routers are `2141434605` (Gen 1) and `2141439838` (Gen 2). They are one program of 596 bytes. The only bytecode difference is the 32-byte factory address: `WLBZZ2XA…` for Gen 1, `RFBPCQV6…` for Gen 2. Selector `a0cba8dd` requires the next group transaction to pay the original ASA into the vault, then inner-calls Prime method `3a3762b0`. The call shape is written up in `web/README.md`.

Gen 2 OCTO and ALGO routers are `2141437705` and `2141439903`. They follow the Gen 1 OCTO and ALGO routers with the Gen 2 factory address.
