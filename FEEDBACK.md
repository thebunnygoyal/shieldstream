# Developer feedback on the hack tooling

These are developer-experience notes from building ShieldStream: what broke, confused or slowed the builder. They are not user or mentor feedback about the app, and no user or mentor feedback has been collected.


1. The prebuilt `zkool_graphql` Linux binary needs glibc 2.38. On Ubuntu 22.04 it fails with `GLIBC_2.38 not found` and `XZ_5.4 not found`. I ran it with a newer glibc loader from Ubuntu packages. A static build or a note in the docs would save time.
2. `zkool_graphql` with `--allow-unauthenticated` exposes `accounts { seed }`. The docs warn about it, which helped. A watch-only account (UFVK) on a separate instance worked well for the merchant side: it detected a shielded payment with its memo and cannot spend.
3. Fauzec's API worked without a captcha and the TAZ arrived in the Ironwood pool in under a minute. The web form has a human check, which doesn't suit headless setups.
4. Faucet drips are small (0.125 to 1 TAZ per address or IP per day), so a demo payer wallet has to be careful with spend. I capped demo payments in code.
5. The `synchronize` call has to run before `pay`, and before reading `transactionsByAccount`. That is easy to miss.
6. ZIP-321 memo support differs between wallets. I did not test the QR with a third-party wallet, so the app tells users to paste the memo code if their wallet ignores it.
