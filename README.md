# ShieldStream

Pay-per-video on shielded Zcash (testnet), with no viewer account. A viewer taps Unlock, gets a QR and a one-time memo code, and pays with a shielded payment. The video unlocks only after a mined note with that exact memo arrives for at least the price. Creators get a gated studio with earnings and unlocks per video.

Built at Free Society Hack (Mumbai, 4 Nov 2026). New repo, written during the hack window.

## What it does and does not protect
- Protects: no account, email or ad profile. On the public chain there is no visible link between a viewer, a video and an amount.
- Does not protect: this server and the creator can see which video was unlocked and the viewer's IP address. Videos have no DRM, so an unlocked file can be saved or shared. The unlock key lives in the viewer's browser storage.
- Unlock waits for a mined block (about a minute or more on testnet). Testnet only, worthless TAZ, not ready for real money.
- Similar tools exist (for example Shieldz, LiveZEC, Portal, StreamLock). No claim of being first.

## Sample content
"Big Buck Bunny", (c) 2008 Blender Foundation | www.bigbuckbunny.org, licensed [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) ([source](https://peach.blender.org/about/)). Modified: cut into three 90 second clips (stream copy, no re-encode) from the official 320x180 download, with a thumbnail frame from each. Not endorsed by the Blender Foundation. The clip files are not stored in this repo: run `sh scripts/make-clips.sh` (needs curl, unzip, ffmpeg) to rebuild them. Videos are served only with a paid purchase token for that video (checked on every request, including range requests).

## Built vs reused
- **Built here (original):** `server.js` (catalog, unlock purchases, ZIP-321 URI builder, memo-matched payment detection, token-gated media streaming, creator API), `public/` (mobile UI), `setup.py` (dev setup).
- **Reused as dependencies, unmodified:**
  - [zkool2](https://github.com/hhanh00/zkool2) `zkool_graphql` v6.36.0, headless Zcash wallet backend (MIT, prebuilt binary).
  - [node-qrcode](https://github.com/soldair/node-qrcode) 1.5.4 (MIT).
  - Public Zcash testnet light-wallet server `testnet.zec.rocks`; funds from a public testnet faucet.
- Sample video: Big Buck Bunny, CC-BY 3.0, Blender Foundation.
- Nothing is copied from another product. Branding is original. The wallet and QR plumbing was first written earlier the same night in this repo (history in git).

## Addresses
The merchant address shown on each pay page belongs to a separate watch-only merchant account. It is not the wallet address shared earlier for incoming testnet transfers. Unlocks pay the merchant address, and the app detects only payments to it.

## Real vs demo
- Real: wallet sync, shielded receive, memo matching, confirmation from block height.
- The "Pay with demo wallet" button (enabled only with `DEMO_PAYER=1`) sends a real shielded testnet payment from a second account in the same local wallet, so the flow can be shown without another phone. It is labelled as a demo in the UI.
- Testnet only (TAZ). No real money. No mainnet support.

## Run
```
zkool_graphql -d .data/w.db -p 8000 --bind-address 127.0.0.1 -l https://testnet.zec.rocks:443 -C 1 --allow-unauthenticated --allow-unencrypted-database
python3 setup.py     # restores payer from seed files, creates merchant account (account 2)
DEMO_PAYER=1 node server.js   # http://127.0.0.1:3000
```
The zkool_graphql server runs unauthenticated on localhost only because it exposes seeds. Never bind it publicly. A production deployment should use a watch-only (viewing key) merchant account.

Creator access key: set `ADMIN_TOKEN` or it is generated into `.data/admin_token` (git-ignored).

## Limits
Single process, JSON file storage. Creators cannot upload; the operator edits `.data/catalog.json` and places files in `videos/`. No refunds, no expiry of unlock keys, no overpayment handling beyond accepting it. Only the built-in demo wallet was tested; no third-party wallet.
