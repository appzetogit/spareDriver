---
name: sparedriver-project
description: >-
  Map of the SpareDriver MERN repo (backend + frontend), naming conventions,
  and token-efficient operating rules. Use whenever working in this
  workspace before exploring with Glob/Grep/Read, to avoid re-discovering
  the layout each session.
---

# SpareDriver Project Skill

This skill exists to **prevent re-exploration of the codebase every session**.
Use the map below first; only `Glob`/`Grep`/`Read` for things not covered here.

## Stack

- Monorepo, two apps: `backend/` (Node 18+, Express 4, ESM, Mongoose 8) and `frontend/` (Vite 8, React 19, Tailwind 4, Zustand 5, Socket.IO client).
- Auth: JWT in cookies + localStorage (source of truth). Zustand auth stores are in-memory only; `useAuthSessionStore` restores session from JWT on boot. Google OAuth + Firebase Phone OTP. Realtime: Socket.IO. Payments: Razorpay. Storage: Cloudinary. Email: Resend.
- Validation: Zod (backend). Both apps use ESM (`"type": "module"`).

## Why Firebase (Realtime Database)

Firebase RTDB is used **only for live driver locations**, not auth/storage:

- Driver app pushes coords every ~5s → `firebase-admin` writes to `/drivers/{driverId}/location` in RTDB.
- Customer tracking pages + admin `LiveDriverMap` subscribe via `onValue` (`useFirebaseDriverLocations`, `useDriverLocation`, `useNearbyDrivers`).
- MongoDB also stores driver location, but **throttled to ≥60s**, used purely for `$nearSphere` dispatch matching — not for live UI.
- Why split: RTDB gives free fan-out + presence to many clients; doing the same over Socket.IO would need per-driver rooms, snapshots, reconnect plumbing. Mongo would balloon with 5s writes for no query benefit.
- Both configs **no-op when env vars are missing** so dev/CI boots without Firebase creds. See `backend/src/services/driverLocation.service.js` for the canonical comment.
- Separately, `firebase-admin` also verifies Phone OTP id-tokens during signup/login — that's the other reason the SDK is present.

## Repo Map

```
backend/src/
  app.js                  # express app, mounts /api/v1/{auth,common,driver,admin,webhooks}
  server.js               # http + socket.io bootstrap
  config/                 # cors, db, env
  constants/              # enums shared across services
  controllers/            # thin: validate → call service → respond
  middlewares/            # auth, role guards, multer, error
  models/                 # mongoose models (one per file, *.model.js)
    user/                 # car.model.js
    driverModels/         # driver.model.js + *.schema.js subdocs
    # trip chat: chatConversation.model.js, chatMessage.model.js (booking-scoped)
  routes/                 # *.routes.js per audience
  services/               # ALL business logic lives here (*.service.js)
                          # chat.service.js — booking chat + unread + authz
  controllers/chat*.js    # chat.controller.js + chatSocket.controller.js
  utils/                  # apiError.js, razorpay.js, asyncHandler, pdfBrand.js, etc.
  assets/                 # brand-logo.png for PDFKit exports (invoice + admin PDFs)
  validations/            # zod schemas per route group

frontend/src/
  App.jsx                 # lazy routes — read this to learn screen → page mapping
  main.jsx                # entry
  layouts/                # MobileLayout, AuthLayout, DashboardLayout, AdminLayout
  guards/                 # AdminGuard, DriverGuard, OnboardingGuard, *Guard
  features/{audience}/{domain}/{pages|components}/
    audience  ∈ auth | user | driver | admin | landing | dev
    domain    e.g. booking, tracking, wallet, trips, kit, registration
              landing pages use AppSettings + LegalDocument (privacy/terms/refund/pricing)
  components/             # shared UI primitives (Button, Modal, BottomSheet, maps/, dialogs/, chat/, ...)
  store/                  # zustand stores
    useUserAuthStore.js, useDriverAuthStore.js, useAdminAuthStore.js, useAuthSessionStore.js, useSocketStore.js
    # Auth stores are in-memory; useAuthSessionStore bootstraps them from JWT (cookie/localStorage)
    user/   — useBookingDraftStore, useUserActiveBookingStore, useUserPricingStore, useUserSavedLocationsStore, useUserWalletStore, useAdsStore, useNearbyDriversStore
    driver/ — useDriverActiveTripStore, useDriverHistoryStore, useDriverIncomingOfferStore, useDriverIncomingScheduledStore (scheduled + outstation + subscription inbox), useDriverSubscriptionsStore (assigned dedicated-driver plans), useDriverKitStore, useDriverOnlineStore, useDriverProfileStore, useDriverTripsStore
    admin/  — useAdmin{Drivers,Users,KitOrders,Kits,KitRevenue,Refunds,OnlineTransactions,Revenue,ServicePricing,Subscriptions,Tasks,Zones,DriverProfile,UserProfile,BulkPush,EmergencyPool,SidebarCounts,TeamMemberAnalytics}Store
  hooks/                  # useGoogleMaps, useDriverMovementSimulator, useTripChat, ...
  constants/              # mapTheme.js, chat.js, bookingStatus.js, socketEvents.js, ...
  config/                 # axios, firebase, env
  lib/, utils/            # helpers (chatApi.js for trip chat REST)
```

Admin promotional push: `/admin/push-notifications` → `ManageBulkPush` → `POST /api/v1/admin/notifications/bulk-push` (`adminBulkPush.service.js`) — **super admin only** (sidebar + routes). Audience user|driver, mode all|selected. Recipients picker: `GET .../bulk-push/recipients` (server-paginated). History: `BulkPushCampaign` + `GET .../bulk-push/history`.

Admin device FCM: staff are `User` docs (same `fcmToken*` fields). Register via `POST /admin/fcm-token` (`AdminNotificationBridge` + login `withFcmAuthPayload`). Emergency-pool / SOS / support-ticket / no-drivers fan out via `sendAdminNotification` + `ADMIN_FCM_NOTIFICATION_TYPES`. Visibility: platform-wide (no `zoneIds`) → super admin only; zone-scoped → admin + sub_admin/team_members whose `assignedZones` overlap. Inbox list/mark-read use the same filter (`buildAdminNotificationFilter`). Sidebar badges: `GET /admin/sidebar-counts` → `useAdminSidebarCountsStore` (emergency pool, pending drivers, kit orders, active SOS, open support). Team-member SOS/support badge counts are assignee-scoped (`assignedTo`).

Staff roles / zones: Super admin (`admin`) is platform-wide. `sub_admin` and `team_member` are zone-scoped via `User.assignedZones` (assign in Manage Team). Sub admins can view (not edit) platform settings, kits, zones, pricing, subscription plans, and coupons — mutations are `SUPER_ADMIN` only. Bookings / emergency pool / outstation / live map / admin notifications are filtered to assigned zones for sub_admin + team_member (`getStaffZoneScopeIds` in `staffPermissions.js`). SOS alerts and support tickets are **not** zone-filtered; ops (`admin`/`sub_admin`) assign via `PATCH /admin/sos|:support/:id/assign` (`assignedTo`/`assignedBy`/`assignedAt`); team members only list/act on items assigned to them (`staffAssignment.util.js`).

Banks (driver payout dropdown): model `Bank` (`bank.model.js`); public `GET /common/banks` (active only); admin CRUD `/admin/settings/banks` + Platform Settings → Banks tab (`BanksTab.jsx`). Seeded via `scripts/data/banks.data.js` in `npm run seed`. Driver onboarding `BankDetailsPage` uses searchable Select; step-3 validates name against active banks.

Driver onboarding flow: steps 1–5 (identity → credentials → bank → safety → live verification), then submit → `under_review`. Training is **post-approval** (required with kit to go online via `kitEligibility.util`). Admin/team mark each section via `PUT /admin/drivers/:id/step-review` (`onboardingStepReviews` on Driver + `stepReview.schema.js`); final `PUT .../status` approve requires all five steps approved. Rejected drivers see overall + section notes on `/driver/register/approval`; "Update my application" sets `revisionInProgress` (stays `rejected`, not pending) and unlocks steps until re-submit (`submissionCount` increments). Approval history is collapsible with per-attempt step reject notes. Suspended drivers go to `/driver/suspended` (reason + support + logout) — never onboarding/approval; suspend requires a reason and is listed in admin Suspension history.

Team member analytics (super admin): Manage Team → Analytics → `/admin/settings/team/:memberId/analytics` → `GET /admin/team/:id/analytics` (`staffAnalytics.service.js`). Aggregates driver approvals, kit reviews, completed tasks, emergency/manual assigns, withdrawals, SOS.

Inbox auto-search (scheduled hourly + outstation bookings + subscription assignment): `bookingScheduled.service` (`decideScheduleTier` for hourly hours; `decideOutstationScheduleTiers` for outstation calendar days via `MIN_OUTSTATION_LEAD_DAYS` / `DRIVER_VISIBILITY_DAYS` / `EMERGENCY_POOL_DAYS`) / `bookingDispatch.broadcastScheduledInboxService` / `subscriptionDispatch.service`. Outstation strips pickup coords until trip-day midnight (`applyOutstationLocationPrivacy`). Admin knobs: `ServicePricing.scheduledDispatch` (hourly + outstation pricing modal) and `AppSettings.subscriptionDispatch` (Manage Subscriptions). Drivers see offers in My Trips → Incoming via `useDriverIncomingScheduledStore`. Outstation ARRIVED never arms hourly no-show auto-complete; stuck no-OTP trips are settled by admin via `POST /admin/outstation-assignments/:id/settle-arrived` (Manage Outstation Assignments → Settle).

## Naming Conventions

- Backend files: `*.model.js`, `*.service.js`, `*.controller.js`, `*.routes.js`, `*.schema.js`.
- Frontend pages: `features/<audience>/<domain>/pages/<PascalCase>Page.jsx`.
- Frontend components: `features/<audience>/<domain>/components/<PascalCase>.jsx` or shared `components/<PascalCase>.jsx`.
- Zustand stores: `useXxxStore.js`, exported as `useXxxStore`.
- API base: `/api/v1/{auth|common|driver|admin|webhooks}`.

## Conventions That Save Edits

- Business logic goes in `services/`, not controllers. Controllers stay thin.
- Errors: throw `new ApiError(status, message)` from `utils/apiError.js`; the global error handler in `app.js` formats the response.
- Money: store paise (integers) when persisting; convert at the edge. See `wallet.service.js` for `toPaise`/`round2` pattern.
- Wallet/booking mutations use the atomic `findOneAndUpdate` + ledger-row pattern. Mirror it; do not invent new patterns.
- Frontend routing is lazy-loaded in `App.jsx`. Adding a page = new `lazy()` import + new `<Route>`.
- Cookies require `app.set('trust proxy', 1)` (already set) because of TLS-terminating proxy.

---

# Token-Efficient Operating Rules

Apply these in **every** session on this repo. They are the main reason past sessions spent too many tokens.

## 1. Skip Exploration When the Map Above Covers It

- Don't `ls -R`, `find`, or `tree` on the repo — the structure is above.
- Don't run `cat package.json` to learn the stack — it's listed above.
- Only explore when looking for something not covered (a specific function, a new file).

## 2. Search Surgically

- Prefer `Grep` over `Read` when looking for a symbol. Use `type: "js"` / `type: "jsx"` and `output_mode: "files_with_matches"` first, then read just the hit.
- Use `Glob` with a precise pattern (e.g. `backend/src/services/*wallet*.js`), never `**/*`.
- Use `head_limit` on `Grep` and `offset`/`limit` on `Read` for large files.
- Never read `package-lock.json` or anything in `node_modules/`.

## 3. Read the Minimum

- For a 500+ line file, read the function range you need via `offset`/`limit`, not the whole file.
- Don't re-read a file you already read this session unless it changed.
- For `App.jsx` (300 lines of routes), grep for the route path instead of re-reading.

## 4. Edit, Don't Rewrite

- Use `StrReplace` for changes; never `Write` over an existing file unless rewriting it entirely is the goal.
- `replace_all: true` for renames across a file.

## 5. Shell Discipline

- Batch independent commands in **one** message with parallel tool calls.
- Chain dependent commands with `&&` inside a single shell call.
- Don't poll background jobs reflexively — wait for the completion notification.
- Don't run commands that need permissions inside the default sandbox just to discover that fact; request `all` upfront when writing under `.cursor/` or outside the workspace.

## 6. Communication Discipline

- Keep replies short. No preamble ("Sure! I'll now..."), no postamble ("Let me know if..."), no restating the user's request.
- Don't recap diffs the user can see. One line of *why*, not *what*.
- Don't add narrating comments in code (`// import the module`, `// loop over items`). Comments only for non-obvious intent.
- No emojis unless asked.

## 7. Planning Discipline

- Use `TodoWrite` only for genuinely multi-step (3+) tasks. Skip it for one-shot edits.
- Don't create `*.md` summaries of work unless asked.

## 8. Subagents

- Use `Task` with `subagent_type: "explore"` for *broad* unknowns; for needle queries, call `Grep`/`Glob` directly — spawning a subagent costs more tokens than one search.

---

## When This Map Goes Stale

If you add a new top-level folder, model, store, or audience under `features/`, update the **Repo Map** section above in the same change. Stale map = wasted future tokens.
