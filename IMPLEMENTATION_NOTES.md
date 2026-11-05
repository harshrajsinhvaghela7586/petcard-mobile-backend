# PetCard sticker and guardian flow changes

## Sticker system

- The sticker catalog is now avatar-scoped using keys `avatar-slug-1` through `avatar-slug-15`.
- Each of the seven avatar folders is loaded independently; no Huchiko fallback is used.
- Catalog pricing is server seeded: images 1-7 free, 8-10 Silver (50), 11-13 Platinum (70), 14-15 Premium (80).
- `StickerOwnership` stores account-wide permanent ownership with a unique `(user, stickerKey)` index.
- Paw Points are debited by the backend through the existing reward ledger and atomic wallet balance condition. The purchase idempotency key is account + sticker, not pet + sticker.
- Selecting a sticker is separate from purchasing it. `Pet.activeStickerKey` stores the pet-specific selection.
- `Pet.avatarLocalId` is persisted so the mobile app can resolve the correct avatar's bundled image set.

## Guardian invite flow

- Private invite deep links are parsed from `petcardmobile://guardian-invite?token=...`.
- Pending invite tokens are stored using Expo SecureStore, not navigation-only params.
- Login/signup/OTP can complete without losing the pending invite. The auth gate resumes `GuardianRequestPreview` before the ordinary pet setup resolver.
- Private invite preview uses authenticated `/api/guardian-invites/lookup`; submit uses `/api/guardian-invites/redeem`.
- Public pet QR preview remains a separate path and does not grant membership.
- The backend checks invite ownership, expiry, revocation, use limit, existing membership and duplicate pending requests. Only owner approval creates a `PetMember`.

## Backend rollout

Run these commands from `backend_full/` after setting `MONGODB_URI`:

```bash
npm run seed:catalog -- --prune
npm run migrate:stickers
```

The catalog seed is safe to re-run. The migration backfills account ownership from existing `Pet.stickerKeys` and assigns a default `activeStickerKey` to pets that do not yet have one. Backed-up production data is recommended before running migrations.

## API additions

- `GET /api/me/stickers` — account ownership and wallet.
- `POST /api/me/stickers/:key/purchase` — purchase/unlock using server catalog price.
- `POST /api/pets/:petId/stickers/:key/select` — select an already-owned sticker for a pet.
- `GET /api/catalog/stickers?petType=...&avatarKey=...` — avatar-specific catalog.

Existing `POST /api/pets/:petId/stickers` is retained for compatibility and now uses account-wide ownership semantics.

## Verification limits

Backend JavaScript syntax checks passed for all 74 source/script files. Static checks confirmed all seven avatar folders contain image1.png through image15.png. No live MongoDB, Expo device, Android build, production API or end-to-end authentication test was run in this environment. Frontend TypeScript/Metro validation could not complete because project dependencies were not installed; `npm ci` exceeded the execution time limit.
