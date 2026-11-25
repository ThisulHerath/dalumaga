# DaluMaga · Pilot UX specification

**Three priority screens:** **M04 Weigh leaves** establishes the original measurement. **M06 Report a stop** gives a safely parked driver one-tap reporting. **W01 Deadline board** helps dispatch intervene before leaves arrive late. Design the Sinhala and English variants of these three first. All IDs, weights and times in the wireframes are illustrative fixtures.

## Navigation and role entry

Show one language at a time. In this specification, each English label is paired with its Sinhala string. Permissions are checked by the API even when a control is hidden. After sign-in, open the assigned role’s default task. A person with multiple authorized roles may switch context under Account; already captured events retain the original actor and role context.

| Role | Mobile route | Web route |
|---|---|---|
| Weighing employee | M01 → M02 → M03 → **M04 Pickup** → local confirmation → next load. From a reading open M08; delegated staff can open M11 from crate details. | No dedicated office landing page. |
| Driver | M01 → M02 → M05 → active trip with **M06 reason controls embedded directly**. After a reason, the same surface shows Resume. Departure/end are actions on M02. | No office dashboard. |
| Factory receiver | M01 → M02 → M07 → **M04 Receipt** → M07. M08 opens the reading’s history; M11 requires tare delegation. | A delegated field reviewer can open W05 directly after W09. |
| Dispatcher | Mobile browser opens responsive W01 from W09; native field actions require a separate field role. | W09 → **W01** → W02 or W03. Sidebar also exposes W04 and W06. |
| Manager | Mobile browser opens responsive W04; alert links open a scoped W03 detail after sign-in. | W09 → W04 → W05 when delegated. W01–W03 available; policy approval in W07 and audit in W10 require delegation. |
| Admin | Mobile browser opens responsive W08. The native phone is used for simulations only under an assigned test identity. | W09 → W08. W01–W06 follow office permissions; W07 and W10 require delegation. |

**Shared navigation.** On mobile use Trip / ගමන, Sync / යැවීම්, Account / ගිණුම. M09 opens from either Sync or the pending badge; M10 opens from Account. Back returns to the same batch, filter and scroll position. On web use Tasks (W01–W06) and Administration (W07–W10 excluding sign-in). Hide unauthorized links; expired sessions return to sign-in and then the original authorized destination. On narrow web layouts the sidebar becomes a labelled menu. Weighers with delegated office correction authority can open W05 by the same direct route as receivers.

## Screen inventory and states

Each screen below names its purpose, visible elements, primary action, and operating states. For all web screens “last loaded” means an already displayed, authorized in-memory snapshot. On cold start without connectivity show the connection-required state. Clear protected data at sign-out. For every write, show a success state only after the relevant local or server commit.

### M01 · Sign in / පිවිසෙන්න

Start an individual session or unlock a previously enrolled account.

- **Elements:** Language selector, account, password, device status; show role options only when the person has multiple roles.
- **Primary action:** Continue / ඉදිරියට යන්න
- **Empty:** No account selected / ගිණුමක් තෝරා නැත
- **Error:** Sign-in failed / පිවිසීම අසාර්ථකයි — keep account name and retry.
- **Offline:** Unlock saved account / සුරැකි ගිණුම විවෘත කරන්න — only within its authorized offline period; first sign-in needs connectivity.

### M02 · My trip / මගේ ගමන

Find today’s assigned work.

- **Elements:** Role and operator, trip, vehicle, pickup sequence, manifest age, pending count; role-specific next task.
- **Primary action:** Open trip / ගමන බලන්න
- **Empty:** No assigned trip / පවරා ඇති ගමනක් නැත
- **Error:** Could not load trip / ගමන ලබාගත නොහැක — retry or use valid cache.
- **Offline:** Saved trip / සුරැකි ගමන — show cache time; never silently create a trip.

### M03 · Batch and load / දළු තොගය සහ පැටවුම

Identify a particular loading and record the source of the batch start time.

- **Elements:** Batch, collection point, observed/estimated/unknown start, crate QR or printed ID, load reference; weigher can issue an online loading.
- **Primary action:** Select load / පැටවුම තෝරන්න
- **Empty:** Scan a crate / පෙට්ටියේ කේතය කියවන්න
- **Error:** Multiple loads found / පැටවුම් කිහිපයක් හමු විය — confirm trip and load reference.
- **Offline:** Use saved manifest / සුරැකි ලැයිස්තුව භාවිත කරන්න — allow pre-issued references only.

### M04 ★ · Weigh leaves / දළු කිරන්න

Capture a stable pickup or receipt weight under the operator’s assigned role.

- **Elements:** Stage, crate and load, scale/source, gross, verified empty weight and net kg, stability, local save result; receipt starts with its own reading.
- **Primary action:** Save weight / බර සුරකින්න
- **Empty:** Waiting for scale / තරාදියේ කියවීම ලැබෙන තුරු රැඳෙන්න
- **Error:** Weight unstable / බර ස්ථාවර නැත — disable verified save. Missing tare: retain gross as unverified; manual fallback goes to review.
- **Offline:** Saved on phone / දුරකථනයේ සුරැකිණි — only after SQLite commit; keep event pending.

### M05 · Load handover / දළු භාරගැනීම

Let the driver confirm exactly which loads were accepted.

- **Elements:** Trip, expected and selected load IDs, crate count, unchecked loads; read-only weights where handover policy permits.
- **Primary action:** Confirm handover / භාරගැනීම තහවුරු කරන්න
- **Empty:** No loads assigned / පැටවුම් පවරා නැත
- **Error:** Load does not match / පැටවුම නොගැළපේ — leave it unconfirmed.
- **Offline:** Handover queued / භාරගැනීම යැවීමට ඇත — retain actor and time.

### M06 ★ · Report a stop / නැවතුම දන්වන්න

Let a safely parked driver record a reason in one tap.

- **Elements:** Four labelled reasons, active break time, resume, emergency contact procedure and delivery/acknowledgement states.
- **Primary action:** Tap a reason / හේතුව තෝරන්න
- **Empty:** No active break / දැනට විවේකයක් නැත — show reasons.
- **Error:** Could not save stop / නැවතුම සුරැකිය නොහැකි විය — show retry and emergency contact procedure.
- **Offline:** Queued on phone / දුරකථනයෙන් යැවීමට ඇත — never imply dispatch has seen it.

### M07 · Factory intake / කම්හලේ දළු භාරගැනීම

Receive loads and distinguish physical intake from completed comparison.

- **Elements:** Expected, received, outstanding loads; scan/lookup, waiting-for-pickup state, whole-batch milestone.
- **Primary action:** Receive load / පැටවුම භාරගන්න
- **Empty:** No expected loads / අපේක්ෂිත පැටවුම් නැත
- **Error:** Unknown load / හඳුනා නොගත් පැටවුම — retain unmatched evidence for review; never guess a crate match.
- **Offline:** Receipt saved locally / භාරගැනීම දුරකථනයේ සුරැකිණි — queue supported receipt events. Submit whole-batch completion online under the current API.

### M08 · Reading and correction / බර සටහන සහ නිවැරදි කිරීම

Inspect original evidence and request an append-only revision.

- **Elements:** Original and effective weights, unit, actor, time, prior revisions, replacement gross/tare, required reason; delegated action only.
- **Primary action:** Request correction / නිවැරදි කිරීමක් ඉල්ලන්න
- **Empty:** No corrections / නිවැරදි කිරීම් නැත
- **Error:** Revision changed / සටහන වෙනස් වී ඇත — reload and review; retain the draft.
- **Offline:** Request queued / ඉල්ලීම යැවීමට ඇත — current effective value stays visible.

### M09 · Sync queue / යැවීමට ඇති සටහන්

Explain what reached the server and what needs attention.

- **Elements:** Pending count, event type, capture time, queued/blocked/conflict states, last successful sync, per-item recovery.
- **Primary action:** Retry now / දැන් නැවත උත්සාහ කරන්න
- **Empty:** All synced / සියල්ල යවා ඇත
- **Error:** Needs attention / පරීක්ෂා කළ යුතුයි — show cause and keep original event ID.
- **Offline:** Waiting for signal / සම්බන්ධතාව ලැබෙන තුරු රැඳෙන්න — queue remains after restart.

### M10 · Account and language / ගිණුම සහ භාෂාව

Switch language or safely hand over a shared device.

- **Elements:** Current operator and role, English/සිංහල selector, pending count, lock/sign-out.
- **Primary action:** Lock account / ගිණුම අගුළු දමන්න
- **Empty:** No pending records / යැවීමට සටහන් නැත
- **Error:** Unlock failed / අගුළ විවෘත කළ නොහැක — retry as original user.
- **Offline:** Language saved / භාෂාව සුරැකිණි — switch locally; lock the previous operator’s pending queue.

### M11 · Verify empty weight / හිස් බර තහවුරු කරන්න

Record a new tare version under delegated authority.

- **Elements:** Crate, empty scale reading, liner/condition, verification time, scale and verifier.
- **Primary action:** Save verified tare / තහවුරු කළ හිස් බර සුරකින්න
- **Empty:** Select a crate / පෙට්ටියක් තෝරන්න
- **Error:** Verification unavailable / තහවුරු කිරීම කළ නොහැක — show missing authority or unstable reading.
- **Offline:** Connect to verify / තහවුරු කිරීමට සම්බන්ධ වන්න — existing verified versions remain available.

### W01 ★ · Deadline board / භාරදීමේ කාල සීමා

Choose the batch needing the earliest dispatch decision.

- **Elements:** Deadline-sorted batches, ETA, delay, last valid update, unknown deadlines, selected batch and available interventions.
- **Primary action:** Open batch / තොගය බලන්න
- **Empty:** No open batches / විවෘත දළු තොග නැත
- **Error:** Timing unavailable / කාල තොරතුරු නොමැත — retain row and show reason.
- **Offline:** Last loaded board / අවසන් වරට ලැබුණු දත්ත — freeze values, show snapshot time and disable writes.

### W02 · Trip and batch detail / ගමන සහ දළු තොගය

Inspect a batch in context and follow up on its delivery.

- **Elements:** Vehicle, load manifest, gate/intake milestones, deadline basis, ETA freshness, reported breaks, last valid location and time; map optional.
- **Primary action:** Review trip / ගමන පරීක්ෂා කරන්න
- **Empty:** No valid position / වලංගු පිහිටීමක් නැත
- **Error:** Location out of date / පිහිටීමේ තොරතුරු පැරණියි — no inferred stop.
- **Offline:** Saved trip details / සුරැකි ගමන් විස්තර — show snapshot time. A missing map leaves the list usable.

### W03 · Alerts / දැනුම්දීම්

Triage an alert and distinguish human acknowledgement from channel delivery.

- **Elements:** Filterable inbox, selected episode, time, evidence interval, driver explanation, acknowledgement and resolution history.
- **Primary action:** Acknowledge / දුටු බව තහවුරු කරන්න
- **Empty:** No open alerts / විවෘත දැනුම්දීම් නැත
- **Error:** Alert already changed / දැනුම්දීම වෙනස් වී ඇත — refresh before acting.
- **Offline:** Reconnect to acknowledge / දුටු බව දන්වන්න නැවත සම්බන්ධ වන්න — preserve typed notes for this session.

### W04 · Weight review / බර වෙනස පරීක්ෂා කිරීම

Decide whether a comparable difference needs follow-up.

- **Elements:** Side-by-side pickup/receipt net, gross/tare, operators, timestamps, signed difference, tolerance version and case explanation.
- **Primary action:** Review evidence / සාක්ෂි බලන්න
- **Empty:** Awaiting pickup / එකතු කළ තැන බර ලැබීමට ඇත
- **Error:** Cannot compare / සැසඳිය නොහැක — identify missing unit or incomplete group.
- **Offline:** Saved readings / සුරැකි බර සටහන් — show last load time; no offline decision.

### W05 · Corrections / නිවැරදි කිරීම්

Make an accountable decision on a proposed revision.

- **Elements:** Original, effective and proposed weights, reason, requester, revision and approval authority; separate approve/reject controls.
- **Primary action:** Record decision / තීරණය සටහන් කරන්න
- **Empty:** No pending requests / බලාපොරොත්තු වන ඉල්ලීම් නැත
- **Error:** Independent reviewer required / වෙනත් බලයලත් අයෙකු අවශ්‍යයි — prevent self-approval.
- **Offline:** Reconnect to decide / තීරණය සටහන් කිරීමට නැවත සම්බන්ධ වන්න.

### W06 · Trip planning / ගමන් සැලසුම

Provision the trip, batches and loading references before field work.

- **Elements:** Route, driver, vehicle, pickup list, batch start source, crate/load IDs and manifest preview.
- **Primary action:** Save manifest / පැටවුම් ලැයිස්තුව සුරකින්න
- **Empty:** No trip planned / ගමනක් සැලසුම් කර නැත
- **Error:** Assignment conflict / පැවරුම නොගැළපේ — show conflicting field.
- **Offline:** Connect to assign / පවරන්න සම්බන්ධ වන්න — never issue an unconfirmed manifest.

### W07 · Rules and access / නීති සහ අවසර

Configure approved operating rules and scoped role delegations.

- **Elements:** Separate policy approval and application panels, current version, effective date, scope, approval reference and audit history.
- **Primary action:** Apply approved change / අනුමත වෙනස යොදන්න
- **Empty:** Rule unconfigured / නීතිය සකසා නැත
- **Error:** Approval required / අනුමැතිය අවශ්‍යයි — retain previous rule.
- **Offline:** Connect to apply / වෙනස යෙදීමට සම්බන්ධ වන්න.

### W08 · Crates and devices / පෙට්ටි සහ උපකරණ

Prepare equipment and distinguish simulation from field evidence.

- **Elements:** QR registry, tare history, scale/tracker assignment, source mode, last test and integration readiness.
- **Primary action:** Register crate / පෙට්ටිය ලියාපදිංචි කරන්න
- **Empty:** No crates registered / පෙට්ටි ලියාපදිංචි කර නැත
- **Error:** Duplicate QR / QR කේතය දැනටමත් භාවිත වේ — open existing crate.
- **Offline:** Connect to register / ලියාපදිංචියට සම්බන්ධ වන්න.

### W09 · Sign in / පිවිසෙන්න

Authenticate an office user and enter their authorized landing page.

- **Elements:** Account, password, language switch, submit and inline error.
- **Primary action:** Sign in / පිවිසෙන්න
- **Empty:** Enter account details / ගිණුම් තොරතුරු ඇතුළත් කරන්න
- **Error:** Sign-in failed / පිවිසීම අසාර්ථකයි — retry.
- **Offline:** Connection required / සම්බන්ධතාව අවශ්‍යයි — no fresh web sign-in offline.

### W10 · Audit history / වෙනස්කම් පිළිබඳ වාර්තාව

Reconstruct a scoped case or policy decision.

- **Elements:** Case filter, chronological actor/time/reason entries, original and effective revisions, related evidence.
- **Primary action:** Open record / සටහන බලන්න
- **Empty:** No matching records / ගැළපෙන සටහන් නැත
- **Error:** Access unavailable / ප්‍රවේශ අවසර නැත — hide protected evidence.
- **Offline:** Last loaded history / අවසන් වරට ලැබුණු වාර්තාව — read-only within the active session.

## Figma construction

Use pages **Foundations**, **Components**, **Mobile**, **Office** and **Pilot walkthrough**. Name frames by ID, role, locale and state, for example `M04/Receiver/si/Pending`. Use vertical auto layout, fill-container text, hug-content height, logical reading order and a fixed bottom safe-area inset. Baseline sizes below are design decisions, not measured handset dimensions.

### ★ M04 · Weigh leaves

1. Start with a 360 × 800 dp mobile frame. Within the safe area, use 16 dp side padding and a 56 dp header with Back, stage title and the sync count. Put “Pickup / දළු එකතු කිරීම” or “Factory receipt / කම්හලේ භාරගැනීම” in text above the measurement.
2. Below the header place the crate and unique load reference on separate lines. Use a full-width 56 dp Scan crate button until identified, with Enter crate ID / පෙට්ටි අංකය ඇතුළත් කරන්න alongside or below. Never match a reused crate solely by QR.
3. In a single measurement panel stack Scale / තරාදිය and Stable / ස්ථාවරයි above two comparable figure rows: Gross / මුළු බර **20 kg**, Empty crate / හිස් පෙට්ටිය **2 kg**. Use a divider, then **Net leaf weight / දළුවල ශුද්ධ බර 18 kg** at 40 sp. On the receipt variant hide expected pickup weight during capture to support independent measurement.
4. Anchor the 56 dp Save weight action above the safe area. After commit change the panel to Saved on phone, show the reading and “Next crate / ඊළඟ පෙට්ටිය”. Do not clear the values on a failed save. Before confirmation a disconnection removes the stable indication until another valid capture.
5. Prototype variants: empty → scanning → unstable → stable → committing → pending → synced. Add branches for invalid tare, storage full and receipt-first. A separate secondary action may retain an unverified reading; never label that value verified.

### ★ M06 · Driver stop reasons

1. In the active-trip screen, place the reason controls immediately below the trip header. They are available from the parked trip view without opening another menu. Include the instruction “Use when safely parked / ආරක්ෂිතව නවතා ඇති විට භාවිත කරන්න”.
2. At 360 dp use a 2 × 2 grid, 16 dp outer margins and 12 dp gaps; each tile is 158 dp wide and at least 80 dp high. Order: Tea break / තේ විවේකය, Toilet / වැසිකිළි අවශ්‍යතාව, Breakdown / වාහන දෝෂය, Emergency / හදිසි අවස්ථාව. Use a text label and a simple icon; distinguish Emergency by text, icon and border.
3. A single tap commits the start event. Replace the grid with selected reason, start time, duration, delivery status and a 56 dp **Resume trip / ගමන නැවත අරඹන්න** button. Keep emergency contact instructions reachable during any break. At large font sizes stack tiles vertically.
4. Emergency needs no approval or confirmation dialog. Show Queued / යැවීමට ඇත, Received by office / කාර්යාලයට ලැබී ඇත, and Acknowledged by dispatcher / නිලධාරියා දුටු බව තහවුරු කළා as distinct states. If saved offline, display the approved phone/radio procedure immediately.
5. If a tap selected the wrong reason, offer an explanation linked to the original event or resume and record the intended reason. Never delete the original. Driver notes are a Should feature; the MVP always supports resume.

### ★ W01 · Dispatcher deadline board

1. Start at 1440 × 900 px. Use a 216 px left rail, 64 px top bar and 24 px content padding. Main content is a single table with a 48 px header and rows at least 60 px high. Open detail in a 360 px drawer; allow it to overlay the table when horizontal space is tight.
2. Heading row: board title left, last successful refresh time and Refresh / යළි ලබාගන්න right. Keep the board refresh time distinct from the last valid vehicle fix. Filters: Route / මාර්ගය and Status / තත්ත්වය; retain selection on return.
3. Column order: Batch / තොගය, Vehicle / වාහනය, Deadline / භාරදිය යුතු වේලාව, ETA / අපේක්ෂිත පැමිණීම, Risk / ප්‍රමාද අවදානම, Last GPS update / අවසන් GPS තොරතුර. Sort by known deadline ascending; group unknown deadlines under Needs timing / වේලාව තහවුරු කළ යුතුයි. Never omit that group.
4. Example row: B-014 · V-01 · 14:30 · 14:42 · **12 min late predicted / මිනිත්තු 12ක ප්‍රමාදයක් අපේක්ෂිතයි** · 2 min ago. Equality at 14:30 is on time. For stale evidence show **ETA unavailable / පැමිණෙන වේලාව නොදනී** and the last fix age. Never infer a vehicle stop from silence.
5. Selecting a row by click or Enter opens deadline basis, remaining stops, evidence age and links to W02/W03. Restore focus to the originating row on Escape. Below 768 px switch to stacked rows with batch, deadline and risk first; detail becomes a full-width screen. No map is required to triage the queue.

### Remaining frame templates

- **Field lists (M02, M07, M09):** header, sync band, summary, single scrolling list, then one primary task. Each row has a leading ID, two lines of context and a trailing text state. M07 groups by receipt status; M09 groups by action needed and pending.
- **Field forms (M01, M03, M05, M08, M10, M11):** a single column; visible label above every input; helper/error directly below; role/source before measured values; primary bottom action. M05 uses 56 dp selectable manifest rows and an explicit selected count. M08 presents the original read-only above the proposal.
- **Office lists and detail (W02–W06, W08, W10):** reuse the rail, top bar, filters, list and detail drawer. On W04 align pickup and receipt by gross, tare and net; below 768 px stack the two readings. On W05 place reason and current revision before decision controls. W06 uses inline field validation and a reviewable manifest before save.
- **Settings (W07) and sign-in (W09):** W07 uses labelled sections, current and proposed values, approval reference and a review step before application. W09 is a centred one-column form, maximum width 420 px. W07 governance panels and W08 device configuration depend on the proposed admin endpoints.
- **Component variants:** Button (default, pressed, disabled, busy); event status (pending, sending, synced, conflict, rejected); scale state (waiting, unstable, stable, unavailable); evidence age (fresh, stale, unknown); alert (open, acknowledged, resolved). Every variant has text and a screen-reader name. Use an inline persistent banner for actionable failures; reserve transient announcements for redundant feedback.

## Design tokens

Values are proposed pilot defaults. Use dp/sp on Android and CSS px/rem equivalents on web. Maintain unit labels alongside values and use tabular digits for English and Sinhala weight/time displays where the font supports them.

| Semantic colour | Value | Use |
|---|---|---|
| surface / canvas | #FFFFFF / #F5F7F4 | Cards, page background |
| ink / secondary ink | #14271E / #405448 | Primary and secondary text on light surfaces |
| action / action ink | #175A39 / #FFFFFF | Primary filled button and its label |
| attention ink / surface | #704500 / #FFF2CF | Pending sync, nearing deadline |
| danger ink / surface | #922A22 / #FFF1EF | Emergency, blocking error and late-risk text |
| focus / control outline | #1555A2 / #64776A | 3 px visible focus ring and input outlines |
| divider | #CBD5CC | Decorative row separators only |

| Token family | Values | Use |
|---|---|---|
| Space | 4, 8, 12, 16, 24, 32, 48 | Icon/text, row gaps, form padding, section separation |
| Type families | Noto Sans Sinhala + Noto Sans, system sans fallback | Bundle both writing systems with the mobile app |
| Type scale (size/line height) | 14/22 metadata, 16/26 body, 18/28 action, 24/36 title, 32/46 heading, 40/56 net reading | Use medium or semibold for labels; allow Sinhala marks and wrapping |
| Touch and shape | 48 minimum target, 56 primary height, 80 stop tile; radius 8 controls, 12 panels | Grow component height with content and font scale |
| Responsive | 360 mobile reference; 768 web compact; 1200 wide; max form width 640 | Test at 320 dp and with 200% text |
| Feedback | 120 ms optional pressed state; no essential animation | Respect reduced motion; never animate the scale through intermediate values |

## Field-use and acceptance checks

- **Gloves and sunlight:** Provide 48 × 48 dp minimum targets with ≥8 dp separation, 56 dp primary buttons, opaque backgrounds and explicit text states. Aim for at least 4.5:1 for normal text and 3:1 for control boundaries and focus on their adjacent surface. Verify on the actual phone outdoors with staff gloves. If the gloves cannot operate that touchscreen, record the hardware limitation during the pilot.
- **Few taps:** From an identified load with a stable reading, one tap saves it. From the active trip while safely parked, one tap records any of the four reasons. One tap resumes. No swipe-only, long-press-only or precision drag actions.
- **Low-end Android:** Load the assigned manifest first, page long lists, render only visible rows, stop camera use after scanning and avoid a map on the critical path. Keep scale capture independent of mobile data. Use the backlog target of p95 ≤1 second for confirmation of a durable local save, measured on a representative pilot phone.
- **Language and accessibility:** Show a persistent language switch. Switch offline without resetting draft values, selected load or pending IDs. Read controls in visual order with TalkBack; announce one stable reading and the final save result, avoiding announcements for every fluctuating gram. Support 200% text, keyboard-only web use, visible focus and sufficient bottom padding to keep the last field reachable.
- **Walkthrough:** With radios off capture 20 kg gross and 2 kg tare. The phone shows 18 kg and Pending. Receive the same load at 15 kg net under another login; show Awaiting pickup. After reconnection and retries show one signed difference of −3 kg. Verify driver Emergency can remain queued and the dispatcher sees stale GPS as stale.
- **Web outage:** Keep the last view with an explicit age. Disable office commands that require fresh server authorization, and prevent duplicate submissions on reconnect. Alert acknowledgement requires a successful server response.
- **Deferred:** Historical analytics, fuel alerts and multi-factory switching have no MVP navigation entries.

## Assumptions to validate

- **ASSUMPTION A1:** Proposed frames, tokens, tap paths and performance targets suit the available Android phone, screen brightness and gloves; validate with a remote field task before the pilot.
- **ASSUMPTION A2:** The supplied Sinhala strings are draft interface copy; ask one representative from each role to read and use them, especially the distinctions between saved, delivered and acknowledged.
- **ASSUMPTION A3:** Office-only roles use responsive web on a phone. Confirm access policy and whether shared devices permit cached data during an active session.
- **ASSUMPTION A4:** The pilot can distribute load references, verified tares and emergency contact instructions in advance. Mark unavailable inputs explicitly until factory confirmation.
