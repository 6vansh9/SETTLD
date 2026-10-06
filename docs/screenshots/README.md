# Screenshots

Real captures of the live app (https://settld00.vercel.app) signed in as the demo account, at iPhone 14 size (390×844 @3x). Regenerate them with:

```bash
npm run demo:seed          # fresh demo data (demo accounts and groups only)
npm run demo:screenshots   # captures everything below (PW_CHROMIUM=/path/to/Chrome-or-Brave optional)
```

The capture fails if any offline/sync banner, skeleton loader or toast is visible (except `offline.png`, which shows offline mode on purpose).

| File | What it shows |
| --- | --- |
| `hero.png` | Group header, expense list and Split Room on the brand background (1600×900) |
| `groups.png` / `groups-dark.png` | Home: you owe / you're owed, Flat 4B and Goa Trip (cover photo), light and dark |
| `group-header.png` | Goa Trip header: cover photo, your balance, WHO'S PAID |
| `group.png` | Expense list: a confirmed UPI payment, a USD expense, unread comment dots |
| `debt-graph.png` | Debt Graph, simplified view |
| `push-nudge.png` | Balances: who pays whom, with a nudge's live cooldown ("Nudge again in 59:32") |
| `command-bar.png` | Command bar parsing `dinner 2400 paid by aman` with its preview |
| `settle-upi.png` | Settle up: You pay Aman, Pay via UPI |
| `split-room.png` | Split Room: items partly claimed, MY TOTAL, Finalize waiting on unclaimed items |
| `offline.png` | Offline banner and an expense waiting to sync |
| `demo.gif` | Adding an expense with the command bar (≈10 s) |

A nudge as a lock-screen notification needs a real phone: add `push-lockscreen.png` by hand if you want one.
