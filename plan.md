# Plan: Booking Request / Offer (Ring + Popup + FCM Fallback)

**Status:** MERN phases 1–3 + 5 done. Phase 4 (Flutter native ring/bridge) is outside this repo. Location tracking remains out of scope.  
**Principle:** Socket.IO = fast foreground path. FCM = background / disconnected delivery. Single UI source = `useDriverIncomingOfferStore`.

---

## Goal

| Driver state | Expected |
|---|---|
| App open (foreground) | Socket → popup + in-app ring; timeout clears both |
| App background | FCM → OS notif (+ native ring in Flutter later); click → same popup |
| App closed | FCM wake → notif; open → hydrate offer if still valid |
| Timeout / withdraw / other accept | Ring + popup + notif all clear |

---

## Current gaps

1. Offer UI + ring only listen to socket `BOOKING_OFFERED` / `BOOKING_OFFER_WITHDRAWN`
2. No client hard-expiry on `offerExpiresAt` → stuck ring/popup when withdraw is missed
3. FCM is a generic “New booking request” — no full offer hydrate
4. No FCM withdraw/cancel → background notif can linger
5. Notif click does not open the offer modal
6. No `GET /driver/bookings/pending-offer` resume API
7. Flutter native ring / WebView bridge is outside this repo (Phase 4)

---

## Architecture

```
Dispatch wave
    ├─ Socket BOOKING_OFFERED     (if connected)
    └─ FCM booking_offer          (always, high priority + compact offer JSON)
         │
         └─ hydrateOffer() → setOffer + local expiry timer
              ├─ foreground: in-app looping ring
              └─ background: OS / Flutter channel sound
         │
    accept | skip | local expire | BOOKING_OFFER_WITHDRAWN (+ FCM cancel)
         └─ clearOffer + stop ring + dismiss notif
```

**Rules**
- Idempotent by `bookingId`
- Never show offer if `Date.now() > offerExpiresAt`
- Do not try to keep Socket.IO alive in background

---

## Phase 0 — Contract

### Offer FCM / hydrate fields

- `kind`: `booking_offer`
- `bookingId`, `bookingNumber`, `offerExpiresAt` (ISO)
- `priority`: `high`
- `fcmTag`: `booking_offer_{bookingId}`
- `fcmChannelId`: `booking_offers`
- `offer`: JSON string of compact offer (same shape as socket, slim addresses)

### Withdraw FCM

- `kind`: `booking_offer_withdrawn`
- `bookingId`, `reason`
- `fcmTag`: same tag (cancel/replace)
- Prefer data-oriented / low-noise push (no inbox spam)

### API

- `GET /api/v1/driver/bookings/pending-offer` → `{ offer: null | OfferPayload }`

---

## Phase 1 — Client hard expiry

- Store schedules timeout from `offerExpiresAt`
- On fire / visibility resume past expiry → `clearOffer()` (stops ring via modal effect)
- Socket withdraw still clears immediately

## Phase 2 — Backend dual-channel

- Rich FCM on offer wave (compact `offer` JSON)
- FCM withdraw on wave timeout / loser / cancel paths
- Android high priority + notification tag/channel metadata

## Phase 3 — Frontend FCM hydrate + resume

- Foreground `onMessage` → hydrate / clear
- Service worker: tagged notif, click → `postMessage` / focus client
- Resume: visibility + socket reconnect → `GET pending-offer`

## Phase 4 — Flutter wrapper (separate repo)

| Event | Native action |
|---|---|
| FCM `booking_offer` | High notif + channel sound / optional looping ringtone |
| Notif tap / resume | Inject payload into WebView → `hydrateOffer` |
| FCM withdraw / local TTL | Stop ring + cancel notif by tag |
| App resumed | Tell JS → reconnect socket + fetch pending-offer |

## Phase 5 — Polish

- Audio `prime()` on Go Online
- Ignore hydrate when driver already has `activeBooking`
- Keep multi-device: accept on one → withdraw FCM on others

---

## Explicit non-goals (this plan)

- Live location HTTP/Firebase upload fallback
- Keeping socket alive in background
- CallKeep / full-screen “incoming call” UI (optional later)

---

## Definition of done

1. Foreground: offer → ring+popup; timeout/withdraw/accept/skip → both stop  
2. Background (web): FCM notif; click opens popup if still valid  
3. Resume / reconnect: pending-offer restores or clears correctly  
4. Expired offers never stick  
5. Location code untouched  

---

## Implementation checklist

- [x] `plan.md`
- [x] Phase 1 — store + modal local expiry
- [x] Phase 2 — rich FCM offer + withdraw
- [x] Phase 3 — pending-offer API + FE hydrate + SW
- [x] Phase 5 — prime audio / polish
- [ ] Phase 4 — Flutter (external)

## FCM kinds for Flutter (ring by `kind`)

| kind | Who | Ring | Open path |
|---|---|---|---|
| `booking_offer` | Driver | Instant looping ring | `/driver/home` |
| `inbox_offer` | Driver | Inbox alert ring | `/driver/trips?tab=incoming` |
| `booking_offer_withdrawn` | Driver | Stop ring / cancel notif | — |
| `ride_ending_soon` | User | Alert ring | `/user/book/assigned/{id}?extend=1` |

`inbox_offer` covers scheduled + outstation + subscription. Also read `bookingType` (`scheduled` \| `outstation` \| `subscription`) and `inbox: "1"`.
