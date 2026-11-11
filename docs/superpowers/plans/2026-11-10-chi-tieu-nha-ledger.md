# SDD ledger — plan: docs/superpowers/plans/2026-11-10-chi-tieu-nha.md

Spec: docs/superpowers/specs/2026-11-10-chi-tieu-nha-design.md
Branch: mvp (from main 4c61d43). User directive at launch: "Giao diện bám sát mockup đã thiết kế".

## Pre-flight scan

| Rows | Produces vs consumes / self-check | Finding |
|---|---|---|
| T1→T4 | formatVnd (T1) used in T4 detail strings | ok |
| T2→T4 | allocate(total, weights) | ok; T2 test values re-derived by hand (100/7, 10/[1,2], 1e6/3) correct |
| T3→T6 | T3 throws AppError, but errors.ts is created in T6 | CONFLICT → Ruling R1 |
| T3→T4 | Tariff types in types.ts, T4 modifies | ok |
| T4 self | test uses line keys 'electricity', startsWith('item:xe') but key format not fully pinned | Ruling R2 |
| T5→T11/T13 | paymentStatus, resolveExpenseMonth, dueDateFor, daysInMonth, consumptionMonthDefault | ok |
| T1↔T6 | both list .env.example | T1 creates stub, T6 fills — ok |
| T6 self | type Db must cover Neon + PGlite; local dev has no Neon account yet | Ruling R3 |
| T6→T7 | user additional fields, auth | ok |
| T7 self | middleware.ts: Next ≥16 renamed to proxy.ts; mustChangePassword needs DB (not edge) | Ruling R4 |
| T8 self | scaffold src/app/page.tsx collides with (app)/page.tsx (T12); T8 redirects to /vao-nha created only in T9 | Ruling R5 |
| T8→T9/T11 | addMemberTx produced T8, modified T11 | ok |
| T8→T13 | archiveHouse/leaveHouse balance checks added T13 | ok |
| T10→T11 | settings mutations call syncDraftPeriods (T11 modifies) | ok |
| T11 self | period-events.ts consumed but not in T11 file list; T14 modifies it | Ruling R6 |
| T11→T14 | hooks need a PushSender; tests inject | Ruling R7 |
| T12→T13 | paymentStatus with [] then real data | ok |
| T15 self | Step 6–7 deploy to Neon/Vercel + iPhone check = external accounts/side effects | Ruling R8 |
| T1 self | create-next-app in non-empty dir; autocrlf on Windows | fallback in plan; Ruling R9 |
| All UI tasks | user directive: UI follows mockup closely | carried into every UI dispatch + reviewer constraints |

Ruling R1: AppError (src/lib/errors.ts) is created in Task 3 instead of Task 6; Task 6 consumes it — the billing module needs it first — cost if wrong: none, file just moves earlier.
Ruling R2: PayslipLine.key format = 'item:<itemId>' | 'electricity' | 'water' | 'expense:<expenseId>' — pins what the T4 test assumes — cost if wrong: rename in UI later.
Ruling R3: src/db/index.ts selects driver by DATABASE_URL: 'pglite:<dir>' → drizzle-orm/pglite (local dev + e2e, no Neon needed); otherwise neon-serverless Pool. Db type = PgDatabase<any, typeof schema> — user has no Neon project yet and e2e needs a DB — cost if wrong: one extra branch in db/index.ts.
Ruling R4: Guarding (login / mustChangePassword / admin) is done in server layouts via routeGuard() with the DB session; use Next's proxy.ts (or middleware.ts if installed Next < 16) only for the cheap cookie-presence redirect, or skip it — edge runtime can't read mustChangePassword — cost if wrong: small redirect flash.
Ruling R5: Task 8 deletes scaffold src/app/page.tsx, creates a minimal (app)/page.tsx placeholder (T12 replaces), and redirects users without a house to /nha/moi; Task 9 switches that redirect to /vao-nha and adds a "Tạo nhà mới" link there — avoids linking to a page that doesn't exist yet — cost if wrong: none.
Ruling R6: Task 11 creates src/server/period-events.ts with onPeriodClosed/onPeriodUpdated no-ops — plan text implies it — cost: none.
Ruling R7: period-events hooks take (db, periodId, deps?: { send?: PushSender }); default sender built from VAPID env in push.ts, no-op if VAPID env missing — keeps T11 tests independent of push — cost: none.
Ruling R8: Task 15 Steps 6–7 (create Neon/Vercel projects, production admin, iPhone test) are NOT dispatched; they need the user's accounts and are outward-facing. Task 15 instead adds a README "Triển khai" section with exact steps; user does deploy — cost: user does ~15 min of setup.
Ruling R9: Task 1 adds .gitattributes "* text=auto eol=lf" to stop CRLF churn on Windows — cost: none.

## Progress
Task 1: dispatched implementer ad02f796ecb799c4e (sonnet), BASE 4c61d43
Task 1: Ruling: next.config cacheComponents/partialPrefetching OFF — app is per-user dynamic everywhere; avoids Suspense/'use cache' friction in every later task — cost if wrong: lose PPR static shell (SW shell cache in T14 covers fast start)
Task 1: minor (deferred): parseVnd('-0') returns -0; '007' accepted; formatVnd RangeError path untested
Task 1: minor (deferred): vitest.config.ts ESM-as-CJS warning (rename to .mts)
Task 1: minor (deferred): tokens.css dark/light blocks duplicated (group selectors)
Task 1: minor (deferred): stock README.md / public/*.svg boilerplate committed
Task 1: minor (deferred): extract-mockup.mjs raw stack trace on missing file; quote/semicolon style inconsistency, no formatter
Task 1: complete (commits 4c61d43..bcf0d93, review clean)
Task 2: dispatched implementer a29c67b1a4031a9c9 (sonnet), BASE bcf0d93
Task 2: minor (deferred): add non-first-member tie test e.g. allocate(5,[2,1,2]); comment the extra<=nonzero-remainder invariant
Task 2: complete (commits bcf0d93..978b1f9, review clean)
Task 3: dispatched (sonnet), BASE 978b1f9 — carries Ruling R1 (create src/lib/errors.ts here)
Task 3: minor (deferred): calcTieredAmount silently under-bills usage beyond a bounded last tier — guard with TARIFF_INVALID
Task 3: minor (deferred): no test perPerson:false with registeredPeople>1; fragile try/catch assertions; no multi-surcharge test
Task 3: Ruling: Task 10 tariffSchema must REQUIRE last tier upTo === null (not merely allow) and registeredPeople ≥ 1 — closes the silent under-billing path at input time — cost if wrong: owner can't model a capped tariff (no real tariff is capped)
Task 3: complete (commits 978b1f9..c127f0b, review clean)
Task 4: dispatched (sonnet), BASE c127f0b — carries Ruling R2 (line keys)
Task 4: Ruling: excluded member who paid an expense gets a payslip with share 0, advanced X, due −X (no share lines, not in M/Σd) — keeps owner's reimbursement debt visible per spec §5.3 — cost if wrong: one extra payslip row in UI
Task 4: Ruling: >1 isOwner → AppError MULTIPLE_OWNERS; duplicate item/expense ids rejected; spentOn strictly validated — cheap guards on money input — cost: none
Task 4: minor (deferred): zero-amount lines emitted for 0 items/expenses and days=0 utility share — UI must render or hide them
Task 4: fix round 1 dispatched to implementer (FIX_BASE c1e1029)
Task 4: fix round 1/5 (5 addressed, 0 open; commits c1e1029..2fc0e68)
Task 4: complete (commits c127f0b..2fc0e68, review clean)
Task 5: dispatched (sonnet), BASE 2fc0e68
Task 5: minor (deferred): Date.UTC maps years 0..99 to 19xx; assertYM accepts year<=0; no test mixing confirmed in+out; rejected-record amounts validated (malformed row throws)
Task 5: complete (commits 2fc0e68..6c4af43, review clean)
Task 6: dispatched (sonnet), BASE 6c4af43 — carries Ruling R3 (pglite driver by DATABASE_URL), R1 (errors.ts already exists)
Task 6: minor (deferred): uniqueness tests use bare rejects.toThrow (assert 23505); db singleton not cached on globalThis (HMR → second PGlite on same dir); MIGRATIONS_FOLDER uses cwd; no CHECK constraints (server layer must validate enums/dueDay); pglite URL parsing duplicated in db/index.ts and scripts/migrate.mts
Task 6: note: @better-auth/cli deprecated → `npx auth@latest`; better-auth 1.7.19 installed
Task 6: complete (commits 6c4af43..131730b, review clean)
Task 7: dispatched (sonnet), BASE 131730b — carries Ruling R4 (guard in server layouts)
Task 7: Ruling: username min length 2 (`an` must work) — cost: none
Task 7: minor (deferred): admin can reset own password from panel (kills own sessions) — hide for currentUserId; USERNAME_PATTERN allows leading/trailing/double dots; forced change loses original next; build logs default-secret noise without BETTER_AUTH_SECRET; proxy comment says edge; adminListUsers role type string|null
Task 7: fix round 1 dispatched (FIX_BASE 4e8fc99): MUST_CHANGE_PASSWORD in getActor + /api/auth/admin/*, extension rule out of layout guard, gitleaks allowlist scoping, login dark input token
Task 7: fix round 1/5 (4 addressed, 0 open; commits 4e8fc99..5c9e44e)
Task 7: minor (deferred): route handlers with dotted names outside /admin,/moi skip proxy cookie check — every route handler must call getActor itself (relevant to T13 /api/upload, T14 /api/push); percent-encoded paths vs x-pathname guard unverified
Task 7: complete (commits 131730b..5c9e44e, review clean)
Task 8: dispatched (sonnet), BASE 5c9e44e — carries Ruling R5
Task 8: Ruling: default tariff row = { mode 'total', tariff: {tiers: [], …} } instead of null (column NOT NULL) — avoids migration; tariffSchema in T10 must accept empty tiers only for mode 'total' — cost: none
Task 8: Ruling: HouseSwitcher not in (app) layout — mockup places "Tên nhà ▾" in the home header; Task 12 puts it there (plan text said layout) — cost if wrong: switcher only reachable from home
Task 8: Ruling: leaveHouse HAS_BALANCE + archiveHouse UNSETTLED_PERIODS(force) implemented early here — matches spec §9; Task 13 must reuse, not duplicate, these checks
Task 8: minor (deferred): filler assert houses.test.ts:1733; membersWithBalance N+1; addMemberTx no archived check + sortOrder max+1 race (T9 callers must check archived / handle); missing archived-path tests; AppNav fixed 390px width overflows <390px viewports; ConfirmSheet no focus trap; getActor throw in layout → 500
Task 8: fix round 1 dispatched (FIX_BASE 0d56427): move no-house redirect from layout RedirectTo into pages via requireCurrentHouse()
Task 8: fix round 1/5 (1 addressed, 0 open; commits 0d56427..c14bab6)
Task 8: minor (deferred): requireCurrentHouse/redirect paths have no automated test (cover in T15 e2e); every new house-scoped page must call requireCurrentHouse()
Task 8: complete (commits 5c9e44e..c14bab6, review clean)
Task 9: Ruling: users whose houses are all archived must still reach history — /vao-nha lists archived houses ("Nhà cũ"), selecting one sets the cookie; requireCurrentHouse accepts an explicitly selected archived house (read-only) — spec §2/§9 promise history — cost: small extra list on /vao-nha
Task 9: dispatched (sonnet), BASE c14bab6
Task 9: minor (deferred): swallowed ALREADY_MEMBER inside decideJoinRequest tx (needs savepoint if 23505 path ever reached); invite-share comment wrong about gesture; no cap on active invite links; /doi-mat-khau drops next; house-code maxLength 12 vs mockup 7 (accepted)
Task 9: fix round 1 dispatched (FIX_BASE 72d4b99): accept-vs-revoke race, Vào nhà dark field colour
Task 9: fix round 1/5 (2 addressed, 0 open; commits 72d4b99..ba2dec4)
Task 9: minor (deferred): test seam hooks.afterPrecheck in production signature; --c-join-field documented only in globals.css not tokens.css header; row-lock races only provable on Neon
Task 9: complete (commits c14bab6..ba2dec4, review clean)
Task 10: dispatched (sonnet), BASE ba2dec4 — carries T3 ruling (last tier must be null) + T8 ruling (empty tiers ok for mode total)
Task 10: minor (deferred): item row read outside tx in house-settings (stale once sync added; NOT_FOUND vs FORBIDDEN leak); setDueDay lacks explicit requireOwner; upsert active:false new item creates hidden row; member-qty saved map masks server values; upTo UI 7 digits vs schema 1,000,000; NAME_MAX + diacritic stripping duplicated; missing foreign-item test
Task 10: fix round 1 dispatched (FIX_BASE 81ba389): integer pct math in calcTieredAmount
Task 10: fix round 1/5 (1 addressed, 0 open; commits 81ba389..a317132)
Task 10: minor (deferred): percentOf exact only for base ≲ 4.5e12 and billing core assertMoney doesn't enforce MAX_MONEY (1e11) — add MAX_MONEY guard in calcTieredAmount/compute; JSDoc wording; legacy pct >1 decimal silently rounded
Task 10: complete (commits ba2dec4..a317132, review clean)
Task 11: dispatched (opus — money-critical integration), BASE a317132 — carries R6, R7, T4 excluded-payer ruling, T10 tx structure
Task 11: Ruling: closing (and recomputing a closed month) requires both utilities entered → INVALID UTILITY_MISSING; a house not using one enters 0 — prevents silently closing with a missing bill — cost: owner types 0 once
Task 11: Ruling: addMemberTx lock FOR NO KEY UPDATE (implementer change, reviewer verified sound) — avoids deadlock with period-lock→FK insert — cost: none
Task 11: Ruling: updateExpense changing spentOn does not move the expense to another month (delete + re-add) — keeps edit semantics simple — cost: UI should say so
Task 11: minor (deferred): correcting closed curr when next month also closed → units double/missing (UI warning flag); previewPeriod accepts closed periods; archived check race in writePeriod/addExpense; updateHouse(dueDay) bypasses draft sync (only setDueDay syncs); concurrency test serial on PGlite; viewing a draft can throw INVALID (T12 must show message)
Task 11: fix round 1 dispatched (FIX_BASE d82fc10): no-op writes must not bump revision/fire hook; rejoined member double-charged in drafts
Task 11: fix round 1/5 (3 addressed, 0 open; commits d82fc10..7620874)
Task 11: minor (deferred): re-enabled old row after rejoin can double count (T12 should label old row "đã rời"); sameJson undefined-key edge (safe direction)
Task 11: complete (commits a317132..7620874, review clean)
Task 12: Ruling: home shows the most recent period visible to the viewer (owner: latest draft or closed; member: latest closed); month arrows step through visible periods; none → empty state (+ owner CTA "Tạo hóa đơn") — spec silent — cost: small UX change later
Task 12: Ruling: payslip hides zero-amount lines except utilities (shows "0 ngày" context) — zero lines are noise — cost: none
Task 12: dispatched (opus — largest UI task, mockup fidelity), BASE 7620874
Task 12: Ruling: payslip pill reads "Chốt sổ dd/mm" (closedAt) instead of mockup "Chốt số" — we don't store a meter-reading date; "chốt số" would mislabel the closing date — cost: one-word copy change if owner prefers mockup text
Task 12: Ruling: applyPeriodEdits + getPeriodEditor added (single revision bump per "Cập nhật"), reviewer verified authz/snapshot — cost: none
Task 12: minor (deferred): no retry after failed save (CTA disabled); autosave sends intermediate readings < prev (skip autosave while locally invalid); editor not re-seeded after router.refresh (stale item ids → ITEM_NOT_FOUND); compact StatusPill shows icons mockup lacks; "Đủ 0/0" when no payer slips; /phieu notFound unreachable; getStatuses has no own auth check (keep server-only)
Task 12: fix round 1 dispatched (FIX_BASE 31b3b8e): draft-only guard for saveDraftAction/applyPeriodEdits; tsconfig exclude .data
Task 12: fix round 1/5 (2 addressed, 0 open; commits 31b3b8e..22d0868)
Task 12: minor (deferred): expense actions / item toggles on /tao lack expect:'draft' guard (edits to a month closed elsewhere via expense path still count as edit-after-close)
Task 12: complete (commits 7620874..22d0868, review clean)
Task 13: Ruling: transfer proof is optional; when BLOB_READ_WRITE_TOKEN is missing (local dev/e2e) the upload control is hidden and "Tôi đã chuyển" works without a photo; Blob objects use random suffix URLs shown only to house members — Vercel Blob URLs are public-by-URL — cost if wrong: a leaked URL exposes one transfer screenshot
Task 13: dispatched (sonnet), BASE 22d0868
Task 13: controller check: full vitest run flaky — 1 of 2 runs: worker exited unexpectedly (0x80000003) in periods.test.ts (PGlite WASM under parallel forks) → must be fixed (limit workers / pool config)
Task 13: Ruling: reason renamed UNSETTLED_PERIODS → UNPAID_PERIODS to match plan; cash refused with HAS_PENDING while a transfer is pending (reviewer: sensible) — cost: owner rejects then records cash
Task 13: Ruling: upload via route handler /api/upload (server actions cap 1MB bodies) with own getActor auth — cost: none
Task 13: minor (deferred): isProofUrlFor accepts any *.blob.vercel-storage.com host (pin to own store); proof blobs public; orphaned uploads/no rate limit; houses.ts↔payments.ts circular import; misnamed VietQR test; concurrency tests single-connection; Sheet uses h1
Task 13: fix round 1 dispatched (FIX_BASE 3ac4425): Content-Length enforcement, flaky suite (worker crash), account regex mismatch + silent catch + unknown-bank message
Task 13: fix round 1/5 (3 addressed, 0 open; commits 3ac4425..56f42ea)
Task 13: minor (deferred): no route-level 411/413 test; unknown BIN hides recipient rows (show account rows anyway); updateHouse accepts BIN not in BANKS; maxWorkers:4 is mitigation (3 green runs)
Task 13: complete (commits 22d0868..56f42ea, review clean)
Task 14: dispatched (sonnet), BASE 56f42ea — carries R7 + hook error-catching TODO
Task 14: Ruling: owner does not receive period_updated (they made the edit); owner gets "Đã chốt sổ tháng M" on close; owner compose card on /thong-bao added (only caller of sendHouseMessage); push allowed on desktop/Android browsers, iOS requires standalone; push endpoints allow-listed (apple/fcm/mozilla/windows) — cost: none
Task 14: minor (deferred): SW cache never pruned across deploys + icons cache-first unversioned; notificationclick navigate no fallback; getVapidPublicKey returns key when private key missing; test gaps (hostile endpoints, remind race, route 401, sw.js); no cap on subscriptions per user; notifications↔payments import cycle; due=0 members get a "không cần chuyển" push (noise); statusBarStyle black adds top spacing
Task 14: fix round 1 dispatched (FIX_BASE 65adb32): guard push phase post-commit; detach/re-key subscriptions across logout
Task 14: note: PGlite worker OOM flake recurred once even with maxWorkers:4 — Task 15 must make the suite reliable (e.g. maxWorkers 2 / share one PGlite per worker / singleFork for src/server)
Task 14: fix round 1/5 (2 addressed, 0 open; commits 65adb32..2f7d668)
Task 14: minor (deferred): detach timeout not cleared (late DELETE after signOut gets 401; next user's re-POST re-keys); PushToggle disable() unsubscribe unguarded
Task 14: complete (commits 56f42ea..2f7d668, review clean)
Task 15: dispatched (sonnet), BASE 2f7d668 — carries R8 (no deploy; README Triển khai), detachPushSubscription before signOut, PushToggle/InstallGuide in /cai-dat, flaky-suite fix
Task 15: session restart mid-task; resumed implementer ad9ab3048e231a5ce on uncommitted work (BASE 2f7d668)
Task 15: Ruling: keep Better Auth freshAge default (24h) for security; map SESSION_NOT_FRESH on passkey register to "đăng xuất rồi đăng nhập lại" with a sign-out button — cost: users adding Face ID after day 1 must re-login once
Task 15: Ruling: avatarVariant applies to every avatar of that user (per-user profile choice, spec §9) — cost: extra field in member queries
Task 15: Ruling: R8 honoured — no deploy; README "Triển khai"/"Chạy trên máy" written; "Tạo hình mới" button 44px (touch target) vs mockup 36px
Task 15: minor (deferred): sign-out routes to /login even if signOut failed (both buttons); PasskeyPrompt per-account not per-device; e2e dismissFaceIdPrompt swallows errors + system-clock month calc; prepare-db reaches $client; hand-maintained DB_TESTS list in vitest.config; no banned-passkey test; admin-panel markup duplication, cross-route imports from nha/_ui; avatar shuffle persists before "Lưu thay đổi"; (auth) and /moi pages stay 430px on wide screens
Task 15: fix round 1 dispatched (FIX_BASE 1042743): SESSION_NOT_FRESH mapping, avatar variant everywhere
Task 15: fix round 1/5 (2 addressed, 0 open; commits 1042743..5876697)
Task 15: minor (deferred): classifyAddPasskeyError treats any 403 as stale session; PasskeyPrompt stale state never reset
Task 15: complete (commits 2f7d668..5876697, review clean)
Final review: dispatched (opus), range 4c61d43..HEAD
Final review: With fixes — Critical #1 (excluding a paid member after close erases money), Important #2 (notification/home show original due not balance), #3 (former members lose history), #4 (admin plugin HTTP endpoints allow impersonate/set-role/update-user), #5 (Vercel region vs Neon Singapore), #6 (cold start no shell), #7 (Neon Pool lifecycle), #8 (invite next lost at forced password change)
Final: Ruling: #1 fixed by keeping a payslip (share 0, due −advanced) for any excluded member with non-rejected payments — preserves "Chủ nhà nợ X" per spec §7 — cost: one extra row
Final: Ruling: #4 block every /api/auth/admin/* HTTP endpoint (panel uses server-side auth.api only) — cost: none
Final: Ruling: #6 cold-start app shell deferred (not in this fix wave) — larger SW/streaming change; first open after idle can be blank 1–3s — cost: spec §11 skeleton-on-cold-start not met yet; listed for the user
Final: fix wave dispatched (opus): #1 #2 #3 #4 #5 #7 #8 + README preview/migration notes + excluded-payer notice
Final: fix wave re-review — all 8 addressed, no new Critical/Important (commits 5876697..687f7a0)
Final: residual minors (parked): payslip "Cần chuyển" block shows original due next to live pill; visibility keyed on snapshot not payslip; proof upload allowed without balance>0; stale house cookie wins; "Đã thu" ignores refunds; former members can read house code; rejoined member's old-stay payslip not matched as "mine"
