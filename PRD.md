# InkBound — Product Requirements Document

## Original Problem Statement
Build a mobile app: tattoo parlour location app and booking appointments.

### User choices
- Serves BOTH customers and parlour/artist side
- Parlours shown on an interactive map + list view
- Booking flow: pick tattoo style/service → artist → time slot
- Auth: email/password AND Google sign-in
- Seeded with rich demo data

## Architecture
- **Frontend:** Expo Router (React Native, SDK 57), react-query, dark "Luxe / Glass" theme (Fraunces + Satoshi fonts, champagne-gold on charcoal), react-native-maps (native) + web fallback, @react-native-vector-icons/material-design-icons.
- **Backend:** FastAPI + MongoDB (motor), all routes under `/api`. Bearer session-token auth (7-day sessions in `user_sessions`).
- **Auth:** bcrypt email/password + Emergent-managed Google OAuth (`/api/auth/session`). Root-layout gate handles redirects.

## User Personas
- **Client:** discovers studios by style/location, views artist portfolios, books appointments, reviews studios.
- **Artist / Studio:** sees incoming booking requests, confirms/declines, marks completed via the Studio dashboard.

## Core Requirements (static)
- Discover screen: map/list toggle, search, style-chip filter.
- Parlour detail: hero, Gallery / Artists / Reviews tabs, sticky Book Now, review posting.
- Artist profile: bio, stats, masonry portfolio, Book CTA.
- 4-step booking wizard: Service → Date → Time slot → Confirm.
- My Bookings (client) with cancel; Studio dashboard (artist) with confirm/decline/complete.

## Implemented (2026-06)
- Full backend: auth (register/login/me/logout/google), styles, parlours (+filter/search), parlour & artist detail, booking slots, create/list bookings, status transitions, reviews with rating recompute. Seed of 6 parlours, 7 artists, services, reviews + demo accounts. **23/23 backend tests passing.**
- Full frontend: login (email+Google+demo), Discover (list + web-fallback map), parlour/artist detail, booking flow, bookings, artist dashboard, profile. Verified e2e.
- Fix: react-query cache cleared on sign-in/sign-out (correct data on account switch).

## Test Accounts
- Client: customer@inkbound.com / Passw0rd!
- Artist: artist@inkbound.com / Passw0rd! (artist_id ar_1)

## Backlog
- **P1:** Real device map validation (react-native-maps needs a native build / Google Maps key on Android); "near me" location sorting with expo-location.
- **P1:** Restrict non-cancel booking status transitions to the artist only.
- **P2:** Seed matching review rows so seeded review_count doesn't collapse on first new review; deposit/payment step; artist portfolio upload via Object Storage.
- **P2:** Migrate FastAPI startup/shutdown to lifespan handlers.

## Next Tasks
- Location-based sorting & filters on Discover.

## Feature additions (2026-10-02, part 2)
- **Service management**: artists rename services, add new ones (＋), and delete (soft-delete, min 1 kept) from Studio → Prices & deposits. Endpoints: `POST/PUT/DELETE /api/studio/services`.
- **Local currency (display-only)**: `src/currency.tsx` detects the client's country via GPS reverse-geocode and shows the matching symbol (base GBP £); amounts are not converted. Applied across booking flow, BookingCard, EarningsCard, parlour CTA, and the services editor.

## Feature additions (2026-09-28)
- **Artist onboarding**: new artists create a studio profile (name, address, styles, specialty, bio) → auto-creates parlour + artist + starter service menu; cover/avatar/portfolio photos upload to Emergent Object Storage.
- **Favourites / Saved**: clients save studios & artists (heart on cards + detail screens); dedicated Saved tab.
- **Near Me**: Discover "Near me" toggle requests location and sorts studios by distance (graceful fallback if denied).
- **Earnings dashboard**: artist Studio tab shows Today / This Week totals, a 7-day bar chart, all-time earned + pending revenue.
- **Profile management & public preview**: edit studio profile, add/remove portfolio photos, and "Preview how clients see your profile" (opens the public artist view).
- Backend regression: 40/40 tests passing.
- Stripe deposit checkout (20% of service price) implemented via emergentintegrations hosted Checkout (Expo Go + web friendly); **awaiting the user's `sk_test_...` key** — `/api/checkout/*` returns 503 until set.

## Pre-Stripe polish (2026-10-02, part 3)
- **One currency (GBP)**: the display-only local-currency swap was removed. Everyone sees £; `CURRENCY` (default `gbp`) in `backend/server.py` is what Stripe charges and what the deposit messages use; `src/currency.tsx` is the matching frontend constant. Change both together if you ever need another currency.
- **Deposit flow**: client requests -> artist confirms -> client pays the deposit (checkout returns 409 until the booking is `confirmed`). Paying no longer auto-confirms.
- **Cancellation / refund policy** (`backend/policy.py`, tested in `tests/test_policy.py`): artist cancels or declines = full refund; client cancels at least `REFUND_WINDOW_HOURS` (default 48) before = full refund; later = deposit kept. Appointment times are treated as UTC (studio time zones aren't stored). Keep `src/policy.ts` in sync with the window.
- **Refunds are bookkeeping only for now**: the server records `refund_status` (`due` / `none`), `refund_amount`, `refund_reason` and `cancelled_by` on the booking and logs `REFUND DUE ...`. **No money is sent automatically.** Until a Stripe refund call is wired in, bookings with `refund_status: "due"` must be refunded from the Stripe dashboard. Payments that complete after a booking was cancelled are also marked `due`.
- **Studio page**: no more "Starting from" with no priced services; shows "Ask the artist".
- **Service editor**: "Add a service" is a local draft until name and price are filled in; creating applies the same deposit rules as editing; max 30 services per studio.

## Choosing your studio (2026-10-05)
- **Join requests**: an artist (or a brand-new artist) searches studios and asks to join; the studio's **owner approves or declines** from the new Team screen (dashboard people icon, with a badge for pending requests). Nobody can attach themselves to someone else's studio without approval. One pending request per person; they can cancel it.
- **Ownership**: `parlour.owner_user_id`. Studios created before ownership existed (e.g. the seeded demo studios) are given an owner at startup: the earliest-created user whose artist profile works there. A studio nobody works at has no owner and shows "Not taking requests".
- **Permissions**: only the owner changes studio-wide things (name, address, cover, styles, services, prices, deposits, opening hours). Members edit only their own profile (photo, specialty, bio) and portfolio.
- **Moving**: approving moves the artist's `parlour_id`. A move is blocked while the artist has upcoming pending/confirmed bookings (clients booked them at the old studio), and an owner whose studio still has other artists can't leave until those are removed. A solo owner who moves has their now-empty studio retired (`deleted_at`).
- **Removing**: owners can remove a member from the Team screen (same upcoming-bookings rule). A removed or still-waiting artist has no studio: not listed, not bookable, and sees "Choose your studio" on their dashboard.
- **Not built yet**: members can't have their own prices (the studio menu is shared), no per-artist invites from the owner's side, and no notification when a request arrives (owners see the badge on their dashboard).

