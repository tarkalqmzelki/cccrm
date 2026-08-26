# ffd.md — Calista Referrals CRM · Codebase Orientation

> Purpose: give any future session (human or AI) a complete mental model of this
> codebase in one read, so work can start immediately without re-analyzing
> everything. Read this FIRST, then only open the files you need.

---

## 1. What this is

**Calista Referrals** — a PWA CRM for a referral-sales company. Sellers /
headhunters submit deals, earn commissions, compete on leaderboards, claim
leads from a marketplace, complete challenges, and receive virtual bank cards.
Admins control everything from Settings. Supabase backend, mobile-first UI.

- **Stack**: React 18 + TypeScript + Vite 5, Tailwind CSS 3, framer-motion 11,
  lucide-react icons, recharts (charts), Supabase JS v2, react-router-dom 6.
- **Entry**: `index.html` → `src/main.tsx` → `src/App.tsx`.
- **No ESLint config** (npm run lint fails — pre-existing). The only gate is
  **`npm run build`** = `tsc -b && vite build`. ALWAYS run it after changes.
- tsconfig: `strict`, `resolveJsonModule: true`, **`noUnusedLocals: false`**
  (unused imports won't fail the build — keep clean anyway).
- Node on this machine runs through PowerShell 5.1. **Never use
  `Get-Content | Set-Content` to bulk-edit files** — it corrupts UTF-8 (€
  became `?`). Use the Edit tool.

## 2. Commands

```bash
npm run dev      # vite dev server
npm run build    # tsc -b && vite build  ← the verification gate
npm run preview  # preview production build
```

## 3. Directory map

```
src/
  main.tsx / App.tsx        # router; Protected() wraps shell by role
  index.css                 # THEME: all CSS vars, glass utilities, keyframes
  lib/
    types.ts                # ~1000 lines: every domain type + META records
    db.ts                   # ALL Supabase calls (one `db` object, ~1900 lines)
    supabase.ts             # client (env vars)
    gamification.ts         # XP, tiers, streaks, medals, records, rankings
    geo.ts                  # country matching for the world map
    format.ts               # eur, eurFull, dateShort, initials, delta
    platformLocales.ts      # i18n: LOCALE_KEYS + ENGLISH_LOCALE (t() fallback)
    notifications.ts        # push subscription helpers
    hooks/useAsync.ts       # THE data-fetch hook (data/loading/error/reload)
    hooks/useActivitiesData.ts / useActivityStats.ts / useSidebarBadges.ts
  context/                  # AuthContext (user: Profile), Toast, Locale,
                            # Notifications
  components/
    ui/                     # primitives: Button Card Modal Badge Avatar Table
                            # Input/Field/Select Textarea Skeleton EmptyState
                            # Dropdown ContextMenu FilterDropdown
                            # SegmentedControl DateTimePicker Switch
                            # ActivityRings LeadScoreGauge gaugeColors.ts
                            # MotionBorder (running conic border)
    layout/                 # AppShell(+PageContainer) Sidebar Topbar MobileNav
                            # nav.ts navSlots.ts NavigationEditor.tsx
    dashboard/              # CareerCard MomentumChart PayoutTracker MedalShelf
                            # RecentWins   (seller overview widgets)
    leaderboard/            # Podium YourCard RankRow HallOfRecords DuelModal
                            # useCountUp medals
    marketplace/            # MarketplaceManager(admin) ProfileCombobox
    bank/                   # BankCardsManager(admin)
    ChallengesManager.tsx   # admin challenges
    ActivitiesStatsPanel.tsx ActivityModal ActivityInfoModal
    FormalInvoiceDocument.tsx FormalContractDocument.tsx FormalBalanceSheetDocument.tsx
    InvoicesTab / ContractsTab / LogBook / BroadcastManager / ...
  pages/
    Dashboard.tsx           # '/' — SellerHome (gamified) + AdminHome
    Leaderboard.tsx Challenges.tsx MarketplacePage.tsx Bank.tsx MapPage.tsx
    ActivitiesKanban.tsx ActivitiesCalendar.tsx
    Deals.tsx DealDetail.tsx Payouts.tsx Referrals.tsx Finances.tsx
    Leads.tsx CompanyDetail.tsx OpportunityDetail.tsx InboxPage.tsx
    admin/Settings.tsx admin/Sellers.tsx admin/CreateUser.tsx
    Login.tsx InvoiceVerifyPage.tsx (public QR verify)
supabase/
  schema.sql … schema64.sql # chronological migrations, run in order
```

## 4. Design system (critical for UI work)

- **Theme**: `.dark` class on `<html>` flips CSS vars (`--ink-*` scale is
  INVERTED in dark — `text-ink-700` is light there). Tailwind tokens:
  `ink/canvas/surface/line/pos/neg/warn/info(+Bg)`. NEVER hardcode theme
  colors except on intentionally-dark surfaces.
- **Intentional dark surfaces** (hero cards, market cards) use
  `bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 text-white
  dark:from-[rgb(30,30,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]`
  + ambient blur blobs + `.sheen-x` shine sweep (pure CSS keyframe — immune
  to re-renders; NEVER use framer keyframe loops for repeating animations on
  re-rendering parents; that caused a "resets every second" bug).
- **`.liquid-tile`**: liquid-glass stat tile (translucent + blur + tone
  gradient wash + gloss line). Used in stats panels, map chips, bank stats.
- **`.glass-tabs`**: translucent pill strip (Finances mobile tabs).
- **MotionBorder**: rotating conic-gradient border (UI component) — use
  sparingly; user prefers static gradients for tiles, running strokes only
  where explicitly asked.
- **Motion conventions**: framer-motion, entrance `initial y:16 opacity:0`,
  `ease: [0.22,1,0.36,1]`, springs `stiffness 420 damping 34`, layoutId for
  sliding pills. `MotionConfig reducedMotion="user"` on Leaderboard.
- **Bottom nav (mobile)**: Instagram-style solid dark pill
  (`MobileNav.tsx`), icon-only, layoutId gray capsule active, red-dot badges.
  Light mode = white pill/black icons. 4 customizable slots (navSlots.ts,
  editor in ProfileModal → NavigationEditor.tsx). **AppShell main has
  `pb-32`** to clear it.
- Dark-mode text on tinted tiles: use `dark:text-white` explicitly
  (ink-200/300 are too dim on glass).

## 5. Core patterns

- **Data**: `useAsync(async () => …, deps)` everywhere. `db.*` methods in
  db.ts return []/defaults on select errors but THROW on write errors —
  callers wrap in try/catch + `useToast().push({tone,title,desc})`.
- **Toasts**: `const { push } = useToast()`.
- **Modal**: `<Modal open onClose title desc size footer>` (portals to body).
- **Context menu**: `openContextMenu(e, CtxItem[])` — platform menus
  everywhere; on mobile cards expose a ⋯ button passing the real event.
- **Searchable member picker**: `components/marketplace/ProfileCombobox.tsx`
  (portal, fixed positioning — reuse for any "pick a person" UI).
- **Roles**: `user.role` = 'admin' | 'seller' | 'headhunter'. Admins are
  hidden from leaderboards/bank; some pages/components branch on isAdmin.
- **nav.ts**: `NAV[]` with `roles?`, `parent?` (renders nested under parent
  with a chevron in Sidebar; collapsed by default). Sidebar mobile drawer
  closes via click bubbling to `<nav onClick={close}>` — DO NOT add
  stopPropagation on row wrappers.
- **RSC-safe**: N/A (plain Vite SPA).

## 6. Feature map (route → page → notes)

| Route | Page | Essence |
|---|---|---|
| `/` | Dashboard | Seller: CareerCard hero, momentum chart, payout tracker, medal shelf, wins. Admin: command banner + rings + mini leaderboard |
| `/leaderboard` | Leaderboard | gamification.ts drives podium/rank rows/duel/records; race bars; motion-heavy |
| `/challenges` | Challenges | admin-pushed quests; functional (auto-checked: leads created / deals submitted since challenge.created_at) vs regular (+1 self-report); solo/team scope; bonus→pending payout (payout_type='bonus') |
| `/marketplace` | MarketplacePage | admin-imported lead pool (JSON import mirrors lead creation); claim → creates company (created_by=claimer) + confirm modal w/ 2s spinner; hidden until published; unlock timers; allocation |
| `/bank` | Bank | user-only virtual cards (schema63); FINIXIO-style layout: card stack, accounts overview, daily spent, big balance chart 1D–1Y; full card details + copy buttons; logo = design_settings.logo_url_dark |
| `/map` | MapPage (lazy) | world map (world-atlas topojson + d3-geo); choropleth by lead saturation; drill-down modal; companies.country/city (schema64) take priority over text matching |
| `/kanban` | ActivitiesKanban | framer drag&drop (touch: pan-y), optimistic moves, latest-first, urgency chips, mini stats |
| `/calendar` | ActivitiesCalendar | hover-expand week rows (desktop), heat overlay by booked revenue (gaugeColors), DayModal w/ completion ring, gradient activity rows (no left-stroke) |
| `/payouts` | Payouts | hero + 3 sparkline stat cards (warm amber gamma) + table w/ status pills; admin records payments |
| `/finances` | Finances | mobile stat tabs (glass), gradient metric card, ledger rows (category chip in meta line) |
| `/leads`, `/leads/:id` | Leads/CompanyDetail | companies table; create via CreateOppModal (country/city/services_offered REQUIRED since schema64); edit modal has same |
| `/deals…` `/referrals` `/payouts` `/inbox` `/given-access` | — | core CRM flows (mostly legacy style) |
| `/settings` (admin) | admin/Settings | tabbed: Commissions, Gamification▸(Challenges, Lead Marketplace, Bank Cards), Design, Locales, Languages, Invoice/Contract, Notifications, System, ChangeLog, Docs |
| `/invoice/verify/:id` | public | QR invoice verification |

## 7. Supabase

- Tables live in `supabase/schema*.sql`, run sequentially; **latest:
  schema64**. Each ends with `NOTIFY pgrst, 'reload schema'` (needed after
  adding columns or PostgREST throws "not found in schema cache" — if that
  error appears, re-run the latest schema file).
- RLS pattern: authenticated read-all; writes admin-only via
  `exists(select 1 from profiles where id=auth.uid() and role='admin')`.
  Member-write exceptions: challenge_progress (own rows), marketplace_leads
  (claim update), inbox_messages (insert true).
- **Push pipeline**: inserting into `inbox_messages` fires Edge Function
  `supabase/functions/send-push`. Routing via the row's `notification_key`
  column (schema29) → template in notification_templates; missing user
  preference = ENABLED by default. Keys enumerated in types.ts
  `NOTIFICATION_KEYS` (they auto-appear in Settings ▸ Templates/Preferences).
- profiles has `show_in_leaderboard`, `locale`, `avatar_color/url`.

## 8. Gamification engine (`lib/gamification.ts`)

- Windows: periodWindow/previousWindow('all'|'monthly'|'weekly').
- buildBoard() → per-member stats + achievements (first_deal, club_10k,
  deal_machine, rainmaker, crown, on_fire); rankRows() adds rank/momentum/
  pctToLeader; careerTotals() for all-time medals/streaks; xpOf, tierProgress
  (L1→L3 from settings thresholds); hallOfRecords.

## 9. Gotchas / lessons (do not re-learn these)

1. Repeating framer animations + per-second re-renders (countdowns) restart
   the animation → use CSS keyframes (`sheen-x`, `mb-sweep`, `.status-ring`).
2. `layout` prop on cards inside per-second-ticking parents causes translate
   jumps — avoid layout on such cards.
3. Wrapper `div`s with stopPropagation broke drawer-close bubbling once —
   keep click-bubbling paths intact (see §5 nav).
4. `backdrop-filter` clipping: popovers inside scrolling modals must portal
   with fixed positioning (see ProfileCombobox).
5. Kanban drag is framer `drag` + `dragSnapToOrigin` + rect hit-testing
   (`colFromPoint`); touch uses `touchAction:'pan-y'`. Click-after-drag is
   suppressed via `lastDragEnd` timestamp.
6. PowerShell here = 5.1: no `&&`, use `; if ($?) {}`; never Set-Content for
   source files (UTF-8 corruption).
7. Bundle: MapPage is lazy-loaded (Suspense). Keep heavy stuff chunk-split.
8. When user asks for "liquid glass": current accepted style = `.liquid-tile`
   / `.glass-tabs` (index.css). The fancy nav experiments were reverted to
   Instagram-solid; `.glass-refract` CSS remains but unused.

## 10. Conventions for new work

- New page: create in `src/pages`, add route in App.tsx, nav entry in nav.ts
  (+ `nav.*` key in platformLocales.ts LOCALE_KEYS), role-gate via `roles`.
- New admin tool: component under `src/components/<domain>/`, register a tab
  in admin/Settings.tsx (Category union + NAV_ITEMS + CATEGORY_TITLE + render).
- New table: `supabase/schemaNN.sql` (next number), types in types.ts, methods
  in db.ts following the existing style (allowed-keys whitelists for updates).
- Visual polish defaults: gradients from the warm amber family for money
  things, spring layoutId pills for tab switches, `.liquid-tile` for stat
  chips, staggered entrances capped ~0.35s delay, tabular `num` class on all
  figures.
