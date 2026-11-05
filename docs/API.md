# PetCard API reference (v2)

Base URL: `https://<your-render-url>`. All bodies are JSON. Every response has `success: true|false`.
Errors: `{ success:false, message, code?, fields?, retryAfterSeconds?, requestId }`.

Authenticated routes need `Authorization: Bearer <accessToken>`. When the access token expires the API answers
`401` with `code: "TOKEN_EXPIRED"`: call `/api/mobile-auth/refresh`, then retry once.

Dates are plain `YYYY-MM-DD` strings (no time zones to get wrong). Send `?today=YYYY-MM-DD` (the phone's local date)
on screens that show streaks/tasks.

## Auth (`/api/mobile-auth`, unchanged from Phase 2)
`POST signup · verify-otp · resend-otp · login · refresh · logout · forgot-password · reset-password`,
`GET me`, `POST logout-all · change-password`.

## Startup
| Method | Path | Notes |
|---|---|---|
| GET | `/api/me/bootstrap` | user, pets (with progress + streak), `hasPet`, wallet, unread count, pending guardian requests. One call at app start. `hasPet` decides onboarding vs Home. |

## Profile, account, rewards
| Method | Path | Body / notes |
|---|---|---|
| GET / PATCH | `/api/me/profile` | PATCH: `name`, `phone`, `timezone` (IANA), `notificationPrefs {push,email}` |
| DELETE | `/api/me` | `{ password }` permanently deletes the account and owned pets |
| GET | `/api/me/rewards?cursor&limit` | `wallet {pawPoints,lifetimePoints}` + history |

## Pets
| Method | Path | Notes |
|---|---|---|
| GET | `/api/pets` | every pet the user owns or co-guards (`role`) |
| POST | `/api/pets` | Send header `Idempotency-Key: <16-80 chars>`: retrying never creates a second pet. Body: `name`*, `type`*, `breed`, `gender` (male/female/unknown), `birthDate`, `weightKg`, `avatarKey`, `stickerKeys` (max 7), `photo`, `health{vaccinated,allergies[],conditions[],vetName,vetPhone,notes}`, `reminders{enabled,time}`, `firstTask{title,category,timeOfDay}` |
| GET | `/api/pets/:petId` | any member |
| PATCH | `/api/pets/:petId` | owner. Same fields as create (no stickers) |
| DELETE | `/api/pets/:petId` | owner. Deletes everything attached |
| GET | `/api/pets/:petId/progress` | level/XP, streak, wallet, sticker slot costs |
| POST | `/api/pets/:petId/stickers` | `{ key }`. Free slots first; a new slot costs Paw Points (15 / 20 / 30). Errors: `INSUFFICIENT_POINTS` (402), `ALREADY_ADDED`, `MAX_SLOTS` |
| DELETE | `/api/pets/:petId/stickers/:key` | removes it from the card; the slot stays unlocked |

Pet object: `id,name,type,breed,gender,birthDate,weightKg,avatarKey,photoUrl,stickerKeys,stickerSlots,nextStickerSlotCost,health,reminders,progress{level,xp,...},streak{current,longest,lastDate},role,createdAt`.

## Catalogue
`GET /api/catalog/avatars?petType=dog` · `GET /api/catalog/stickers?petType=dog` → `items[{key,label,petType,order}]` (cached 5 min).

## Tasks (`/api/pets/:petId/tasks`)
| Method | Path | Notes |
|---|---|---|
| GET | `/` `?date=` | tasks due that day with `completed` state |
| GET | `/all` | every active task (manage screen) |
| GET | `/history?cursor&limit` | completions, newest first |
| POST | `/` | `title`*, `category`* (food, water, walk, play, grooming, training, medication, vet, hygiene, other), `note`, `timeOfDay`, `recurrence{type: once/daily/weekly, daysOfWeek[0-6], startDate, endDate}`. Points/XP are set by the server |
| PATCH / DELETE | `/:taskId` | DELETE archives (history stays) |
| POST | `/:taskId/complete` | `{ date? }`. Idempotent: a second call returns `alreadyCompleted: true` and no reward. Response: `reward{points,xp,streakBonus,capped}`, `progress`, `streak`, `wallet`, `leveledUp` |

`GET /api/pets/:petId/calendar?from=&to=` (max 62 days) → `days{ "YYYY-MM-DD": {tasks[],health[],memories[]} }`.

## Health (`/api/pets/:petId/health`)
`GET /?type&cursor&limit` · `GET /upcoming` · `POST /` · `GET|PATCH|DELETE /:recordId`.
Body: `type`* (vaccination, medication, vet_visit, allergy, condition, weight, surgery, other), `title`*, `date`*, `nextDueDate`, `weightKg`, `vetName`, `notes`.

## Memories (`/api/pets/:petId/memories`)
`GET /?cursor&limit` · `POST /` · `GET|PATCH|DELETE /:memoryId` (author or owner for edit/delete).
Body: `title`, `caption`, `date`, `photo{publicId,width,height,format}`.

## Photo upload (Cloudinary, signed)
1. `POST /api/uploads/sign` `{ purpose: "pet_photo" | "memory", petId? }` (`petId` optional only for a pet photo before the pet exists).
2. Upload to `upload.uploadUrl` as multipart form: every key/value in `upload.params`, plus `api_key` = `upload.apiKey`, `signature` = `upload.signature`, and `file`.
3. Send `{ publicId: result.public_id, width, height, format }` as `photo` to the pet/memory endpoint. The server only accepts ids inside the caller's own folder.

## Co-guardians
Owner (`/api/pets/:petId/guardians`):
`GET /` (members, and for owners: pending requests + invites) · `POST /invites` (returns `token` and `deepLink` ONCE: put the deepLink in the QR) · `DELETE /invites/:id` · `POST /requests/:id/approve|reject` · `DELETE /:userId` (remove) · `POST /leave` (co-guardian leaves).

Invited person: `POST /api/guardian-invites/lookup {token}` (preview: pet name/avatar + inviter) → `POST /api/guardian-invites/redeem {token}` (creates a pending request; the owner is notified by push/email and must approve) · `GET /api/guardian-requests/mine` · `DELETE /api/guardian-requests/:id`.

## Notifications & push
`GET /api/me/notifications?unread&cursor&limit` · `GET /api/me/notifications/unread-count` · `POST /api/me/notifications/read {ids[]|all:true}`
`POST /api/me/devices {token, platform}` (Expo push token; call after login) · `POST /api/me/devices/unregister {token}` (call on logout).
Types: `guardian_request, guardian_approved, guardian_rejected, guardian_removed, level_up, referral_reward`.

## Referral
`GET /api/me/referral` → `code`, `invitedCount`, `rewards`, `canApplyCode` · `POST /api/me/referral/apply {code}` (once per account, first 7 days only).

## Rules the server enforces (change in `src/config/rewards.js`)
Points per task category, daily cap per pet (100), streak bonus every 7 days, level curve, 7 free sticker slots then 15/20/30,
referral rewards (referrer 50 / friend 25), per-user limits (10 pets, 6 guardians, 40 active tasks).

## Admin API  (`/api/admin`, cookie session, admin only)

Every list returns `{ success, items, pagination: { page, limit, total, pages, hasPrev, hasNext } }` and accepts `?page` (default 1) and `?limit` (default 20, max 100). Dates are `YYYY-MM-DD`; `from`/`to` are inclusive. `sort` is whitelisted per list (`?sort=field&order=asc|desc`). Every change is written to the audit log (`GET /audit`).

| Area | Endpoints | Filters / notes |
|---|---|---|
| Dashboard | `GET /overview` | Counts, 14-day trends (signups, pets, task completions), health overdue/due, level distribution, top pets. Cached 30 s |
| Audit | `GET /audit` | `search, action, admin, targetType, target, from, to` |
| Users | `GET /users`, `GET /users/stats`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/revoke-sessions`, `DELETE /users/:id` | `search, verified, disabled, country, language, hasPet, from, to, sort=createdAt/name/email/lastLoginAt`. Each row has `level` (highest pet level, 0 = no pet), `totalXp`, `petCount`, `achievements`, `wallet`. Disable also signs the user out. Delete needs body `{ confirmEmail }` |
| Pets | `GET /pets`, `GET /pets/filters`, `POST /pets`, `GET /pets/:id`, `PATCH /pets/:id`, `DELETE /pets/:id`, `POST /pets/:id/regenerate-qr`, `POST /pets/:id/grant-xp` | `search, type, breed, gender, owner, minLevel, maxLevel, vaccinated, from, to, sort=createdAt/name/xp/level/streak.current/weightKg`. Detail shows members, counts, upcoming health, achievements with progress. Delete needs `{ confirmName }`. Create needs `ownerId` + the same fields as the app |
| Tasks | `GET /tasks`, `/tasks/stats`, `/tasks/completions`, `POST /tasks`, `GET/PATCH/DELETE /tasks/:id`, `POST /tasks/:id/archive`, `/unarchive` | `search, pet, owner, category, type, archived(true/false/all), reminder, date (tasks happening that day), createdFrom/createdTo`. Completions: `pet, owner, user, task, category, from, to` |
| Health | `GET /health`, `/health/upcoming`, `/health/stats`, `POST /health`, `GET/PATCH/DELETE /health/:id`, `POST /health/:id/complete` | `search, pet, owner, petType, type, status=overdue/today/soon/upcoming/pending/completed/none, vet, from, to, dueFrom, dueTo`. Upcoming: `days, overdueDays, overdue, type` + `summary {overdue,today,upcoming}` |
| Calendar | `GET /calendar?from&to&pet&owner&petType&type=all/tasks/health&items=true` | Max 62 days. Per day: health due/overdue/completed and task completions. With `pet`/`owner` the scheduled task occurrences are expanded as well |
| Notifications | `GET /notifications`, `/notifications/stats`, `POST /notifications/send`, `POST /notifications/delete-many`, `DELETE /notifications/:id` | `search, user, type, read, from, to`. Send: `{ title, body?, push?, userIds[] }` or `{ audience: { all \| country, language, hasPet, verified } }` (max 50,000, batched) |
| Contacts | `GET /contacts`, `/contacts/stats`, `GET/PATCH/DELETE /contacts/:id`, `POST /contacts/:id/reply` | `search, status, replied, from, to`. Reply `{ message, resolve? }` emails the person and notifies them in the app if they have an account |
| Guardians | `GET /guardians` (requests), `PATCH /guardians/:id/decision`, `GET /guardians/members`, `PATCH/DELETE /guardians/members/:memberId`, `GET /guardians/invites`, `DELETE /guardians/invites/:inviteId` | `status, pet, owner, requester, search, from, to`; members: `user, role`; invites: `active` |
| Rewards | `GET /rewards` (wallets), `/rewards/stats`, `/rewards/ledger`, `POST /rewards/:userId/adjust` | wallets: `search, min, max, sort`; ledger: `user, pet, kind, sign=earned/spent, from, to`. Adjust `{ points (+/-), note }` notifies the user |
| Referrals | `GET /referrals`, `PATCH /referrals/:id/skip` | `search, rewarded, skipped, from, to` |
| Catalog | `GET /catalog`, `POST /catalog`, `GET/PATCH/DELETE /catalog/:id` | `kind, petType, active, free, search`. `DELETE` hides the item; `?hard=true` removes it only if unused. `kind` and `key` cannot change |
| Achievements | `GET /achievements`, `/achievements/definitions`, `/achievements/pet/:petId`, `/achievements/user/:userId`, `POST /achievements/grant`, `DELETE /achievements/:id` | list: `key, pet, user, from, to` |
| Levels | `GET /levels` | Level table + pets per level |
| Rankings | `GET /rankings/users`, `GET /rankings/pets`, `GET /rankings/options` | users: `by=lifetime/points/xp/level/achievements, period=all/week/month, country, language, verified, search`; pets: `by=xp/streak/longestStreak/achievements/tasks, period, type, breed, gender, minLevel, country, search`. Cached 30 s; equal values share a rank |

A user's level is the level of their highest-level pet; their XP is the sum of the XP of the pets they own.

Disabled users (`disabledAt` set) cannot log in and existing access tokens stop working.

## Also added to the app API
`GET /api/meta`, `GET /api/pets/:petId/{home,card,know,know/:pageKey,assistant/suggestions,reminders}`, `POST /api/pets/:petId/{card/regenerate-qr,assistant/chat}`, `/api/pets/:petId/tracker/*` (summary, care-score, entries, counters, goals), `GET /api/pets/:petId/health/summary`, `POST /api/pets/:petId/health/:recordId/complete`, `GET /api/pets/:petId/guardians/permissions`, `PATCH /api/pets/:petId/guardians/:userId`.
