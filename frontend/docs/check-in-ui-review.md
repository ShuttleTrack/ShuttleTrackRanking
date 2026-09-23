# Game-day check-in — UI hand-off for UX/UI review

The attendance vote (`ATTENDANCE_VOTE_PLAN.md`) was built on the check-in mockup from the
`feature/ui/cself-serve` branch. The mockup covered one case: a player with a slot voting in or
out, with fake data. The real feature has more roles and states than that, so some UI was
**invented during implementation without a design**. This doc lists what came from the mockup
unchanged, what was adapted, what is new, and the known rough edges. Work through it before or
alongside the PR review.

Component reference: `frontend/docs/components.md` ("Game-day check-in", "User Profile",
"Game Planner"). Design tokens: `frontend/docs/design.md`.

## 1. How much of the mockup was used

Line churn = lines changed between the mockup file and the shipped file.

| Mockup file | Fate | Churn |
|---|---|---|
| `components/layout/Layout.tsx` | Used **as-is** | 0 |
| `pages/_app.tsx` (viewport meta) | Used **as-is** | 0 |
| `app/globals.css` (reduced-motion list) | Used **as-is** | 0 |
| `utils/userTabBar.ts` | Used **as-is** | 0 |
| `pages/s/[squad]/user/profile.tsx` | As-is, apart from one prop | 2 |
| `components/check-in/CheckInPlayerRow.tsx` | **Visuals unchanged**; takes the API's roster type, gains an optional badge | 12 |
| `components/nav/UserTabBar.tsx` | **Visuals unchanged**; the Check-in link now comes from real data | 25 |
| `components/check-in/CheckInVoteButtons.tsx` | **Visuals unchanged**; each button can be disabled on its own, and "I'm out" can be hidden | 59 |
| `components/check-in/CheckInRoster.tsx` | In/Out tabs and columns unchanged; **a third group and a waiting-list count added** | 56 |
| `components/check-in/UpcomingSessionsList.tsx` | Card layout unchanged; **chip states, empty and error states added** | 147 |
| `components/check-in/CheckInView.tsx` | Hero card unchanged; **everything below it rewritten** for the new roles and states | 229 |
| `hooks/useGameDayCheckIn.ts`, `lib/check-in/schedule.ts`, `lib/check-in/types.ts` | Rewritten (data layer, not UI) | — |
| `pages/s/[squad]/game-day/[uid].tsx` | Renamed to `[date].tsx`; same shell and header | — |
| `hooks/useRequireUser.ts` | Same behaviour (return to the current page after login) | 8 |

**Dropped from the mockup:**

- `lib/check-in/mockVotes.ts` (+ test) and `lib/check-in/storage.ts` — fake votes and
  `localStorage`, replaced by the API.
- `utils/safeCallbackUrl.ts` and the `pages/login.tsx` change — `main` already had the same helper
  in `utils/loginAuth.ts`.
- `wed-`/`fri-` session ids and the hardcoded Wed 19:00–22:00 / Fri 20:00–23:00 Amsterdam sessions
  — the URL is now the date, and times come from each squad's own schedule.
- `ProfileBackLink` in the page header — kept, but only shown on the "session not found" screen,
  matching the mockup's own note.

**In short:** the visual language (hero card, vote-button geometry and colours, player rows, tab
bar, profile cards) is the mockup's, pixel for pixel. What the mockup never had to design is the
state around it, and that is where the gaps are.

## 2. UI with no mockup — invented during implementation, needs design review

Each item says where it lives and what it looks like today.

### Check-in page (`CheckInView.tsx`)

1. **Voting status line** under the hero card — "Voting closes at 13:00 on the day · 11 of 16 in"
   / "Voting closed at 13:00". Plain `text-sm` muted text. It's the most important sentence on
   the page and has no visual weight.
2. **Cancelled state** — a red chip in place of the countdown, a red line of text, and no action
   area. No explanation of why it was cancelled (the reason is only in the Telegram post).
3. **After the deadline, buttons are disabled with a reason** — e.g. a holder who didn't vote in
   sees both buttons greyed (`disabled:opacity-50`) plus "Voting has closed." underneath.
   Disabled-but-selected vs. disabled-and-not-selected aren't visually distinct.
4. **Situation prompts above the buttons** (plain text, one line each):
   - an open-slot player assigned a slot who hasn't confirmed yet,
   - a player a slot was passed to after voting closed ("confirm until 17:00"),
   - a direct claimer ("this slot is yours").

   These are the moments the feature most needs the player to act, and they currently read like
   fine print.
5. **Direct claimer sees "I'm in" only** — the button then stretches full width on `sm+`.
6. **Open-slot panel** (a whole role the mockup didn't have), reusing the vote-button geometry:
   - **Join waiting list** (outline button) before the deadline;
   - once joined: a *disabled primary* "On the waiting list" button + **Leave waiting list**, with
     "You're #2 on the waiting list…". **This is a misuse of a disabled button as a status
     indicator** — it reads as broken. Needs a proper status treatment.
   - **Claim a slot** (primary) after the deadline, with "N open slots – first come, first served".
   - otherwise, just a reason sentence (too late, gave it back, no open slots…).
7. **View-only (observer)** — a covered fulltime owner, or a superadmin with no player profile.
   A "Viewing only" label and one sentence (e.g. "You have handed your slot to Ada for this
   date."). No other treatment.
8. **Action error box** — a red bordered box under the buttons for server refusals.
9. **Load error** — bare red text ("Could not load this session").

### Roster (`CheckInRoster.tsx`, `CheckInPlayerRow.tsx`)

10. **Third group: "Holding a slot · awaiting confirmation"** — players who hold a slot but haven't
    said they're coming (not counted as In). It renders **below both In/Out columns and outside
    the mobile tabs**, so on mobile it sits under whichever tab is open. Needs a place in the
    tab/column design.
11. **Row badges** — "Open slot" (a confirmed open-slot player in the In list), "Slot passed on"
    and "Open slot" in the awaiting group. Generic `bg-white/10` pill; not from the token set.
12. **Waiting list** is shown as a count sentence only ("3 on the open-slot waiting list"). Showing
    names/order is a product + design decision nobody has made.
13. **Roster appears only after the server confirms the vote.** "I'm in" updates instantly, but
    the roster is withheld until you've voted and arrives on the refetch a moment later — a small
    delay with no loading state.

### Profile & tab bar

14. **Upcoming sessions chips** — the mockup had three (In / Out / Not voted); there are now eight:
    In, Out, Not voted, Waiting list, Slot assigned, Slot passed to you, Open slot, No slot. Colours
    were picked ad hoc. There's also an appended "· voting closed" on the time line.
15. **Empty state** — "No sessions open for check-in yet – the vote opens a couple of days before
    each game day." The mockup always had two fake sessions, so this was never designed.
16. **Check-in tab with no open game day** links to the profile page — the tab then points at the
    same place as "Profile". Consider a disabled/"no session" state instead.

### Admin surfaces (DaisyUI-free token style, like the rest of admin)

17. **Game Planner attendance banner** (`AttendanceBanner.tsx`) — pre-selected count, "dropped
    out after the deadline" list, and chips for unconfirmed slot holders with a tiny **Release**
    text button. Dense; Release is easy to mis-tap.
18. **Settings → "Game day check-in" card** — on/off toggle + four fields (days ahead, open-slot
    minimum, two Telegram chat ids). No help on *how to find* a Telegram chat id; the minimum
    field uses the placeholder "Off" to mean empty.
19. ~~**Settings → timezone select** listing all ~400 IANA zones with no search.~~ **Fixed:**
    `components/common/TimezonePicker.tsx`, a headless UI Combobox in the same shape and tokens as
    `SearchablePlayerPicker`. Before typing it shows a short "Common" list (Amsterdam, Brussels,
    Berlin, Paris, London, Colombo, UTC, plus the current zone). Typing searches every zone by
    city, region or UTC offset (`amsterdam`, `europe ams`, `+05:30`), ranked city-first and
    capped at 50 results. Each row shows city, region and today's offset. Only a real zone id can
    be saved. Still worth a design look: the globe icon, and whether offsets should read "GMT+2"
    rather than "UTC+02:00".
20. **Dashboard → "Run game-day check-in tick now"** (superadmin only) — a debug button beside the
    Telegram test buttons, reporting counts in a text line. Fine as a tool, but not designed.

## 3. Real misses — things that should exist but don't

These are gaps, not just polish:

- **No confirmation for actions you can't undo.** Several taps are final, and nothing warns the
  player first:
  - voting **Out after the deadline** (a holder can't vote back In);
  - an assignee **giving their slot back** (they can't rejoin the waiting list);
  - **Claim a slot** (a direct claim can't be given back by the player — only an admin can
    release it; one mis-tap holds a court slot for the night).

  These need a confirm step or at least a clear "this is final" line.
- **Admin Release has no confirmation either** (Game Planner banner).
- **No admin UI for "Close voting now" or "Cancel session".** The API supports both
  (`PATCH /api/squads/[squadId]/game-days/[date]/admin`, `action: close | cancel`) but there's no
  button anywhere. The plan also mentioned an admin oversight table in the style of
  `ReplacementOversight.tsx`; that wasn't built either. Today an admin can only act from Game
  Planner, and only once voting has closed.
- **Game Planner can pre-tick a count it can't create.** 6, 7 and 11 players can't be split into
  groups of 4–5. The existing validation message appears, but the banner doesn't explain why the
  vote's result can't be used as-is.
- **No design review on phone widths** for the new states (open-slot panel, long observer
  sentences, the awaiting group). Only the mockup's original states were designed mobile-first.
- **Not verified in a browser.** The local environment has no real Google sign-in, so the pages
  were checked by typecheck, lint, build and API/logic tests, but never clicked through. Treat
  everything in section 2 as unreviewed visually.

## 4. How to see each state

Sign in as a squad admin/player on a squad with a recurring schedule, then on
`/s/[squad]/admin/settings` turn **Game day check-in** on (set an open-slot minimum to get the
waiting-list states). As a platform superadmin, use **Run game-day check-in tick now** on the
admin dashboard to create the game day without waiting for the 5-minute cron. Then:

| State | How to get there |
|---|---|
| Voter, not voted (roster hidden) | Fulltime player, before 13:00 |
| Open-slot: join / on the list | `OPEN_SLOT` player, before 13:00 |
| Assigned, awaiting confirmation | Open-slot player on the list when voting closes with a shortfall (squad admin can close voting via the API above) |
| Claim a slot / direct claimer | Open-slot player, after voting closed with open slots |
| Voting closed, buttons disabled | Fulltime player who didn't vote, after 13:00 |
| Slot passed on after deadline | After voting closes, create a replacement covering today for a player who voted In |
| Observer | Fulltime owner with an active replacement for that date, or a superadmin with no player profile |
| Cancelled | Add the date as a skip date in settings, then run a tick |
| Game Planner banner | Admin opens Game Planner on the day, after voting closed |
