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

## Feature additions (2026-09-28)
- **Artist onboarding**: new artists create a studio profile (name, address, styles, specialty, bio) → auto-creates parlour + artist + starter service menu; cover/avatar/portfolio photos upload to Emergent Object Storage.
- **Favourites / Saved**: clients save studios & artists (heart on cards + detail screens); dedicated Saved tab.
- **Near Me**: Discover "Near me" toggle requests location and sorts studios by distance (graceful fallback if denied).
- **Earnings dashboard**: artist Studio tab shows Today / This Week totals, a 7-day bar chart, all-time earned + pending revenue.
- **Profile management & public preview**: edit studio profile, add/remove portfolio photos, and "Preview how clients see your profile" (opens the public artist view).
- Backend regression: 40/40 tests passing.
- Stripe deposit checkout (20% of service price) implemented via emergentintegrations hosted Checkout (Expo Go + web friendly); **awaiting the user's `sk_test_...` key** — `/api/checkout/*` returns 503 until set.
