# Realtime Database rules

`database.rules.json` is the access-control layer for live location. It is not
optional: the API writes location assuming these rules are what keeps it
private.

## What the rules say

| Path | Who can read | Why |
|---|---|---|
| `/` | nobody | Deny by default; every grant below is explicit. |
| `/drivers` | staff only | Fleet-wide positions plus `activeTrip`, which carries customer name and (once revealed) phone. |
| `/trips/{bookingId}/driver` | the customer on that booking, or staff | Position and freshness for one ride, nothing else. |

**Nothing has write access.** Every write comes from the API through the
Firebase Admin SDK, which bypasses rules. A client that could write here could
put a driver anywhere on the map.

`auth.token.bookingId` is a claim minted server-side in
`services/firebaseAuthToken.service.js` — the client never supplies it, so a
customer cannot ask for someone else's ride.

## Deploying

```bash
# from backend/
npx firebase-tools deploy --only database --project <your-project-id>
```

Or paste the contents into Firebase console → Realtime Database → Rules.

`firebase.json` should point at this file:

```json
{ "database": { "rules": "firebase/database.rules.json" } }
```

## Before you deploy

Deploying these rules **breaks any client that reads RTDB anonymously.** That
is the point — it is what closes the leak — but it means the web app must ship
the matching change first (or at the same time):

1. Web app calls `GET /api/v1/auth/firebase-token` (or `/api/v1/driver/firebase-token`
   / `/api/v1/admin/firebase-token`). `GET /api/v1/user/firebase-token` is kept as
   an alias for native clients. Pass the result to `signInWithCustomToken`.
2. Customer surfaces read `/trips/{bookingId}/driver`, not `/drivers`.

If you deploy rules before the web app, customer maps go blank. If you deploy
the web app first, it keeps working and the leak stays open until the rules
land. **Web app first, then rules**, is the safe order.

## Verifying

Firebase console → Realtime Database → Rules → Rules Playground:

- Read `/drivers` as unauthenticated → **denied**
- Read `/drivers` with `{ "role": "staff" }` → **allowed**
- Read `/trips/abc123/driver` with `{ "bookingId": "abc123" }` → **allowed**
- Read `/trips/abc123/driver` with `{ "bookingId": "other" }` → **denied**
