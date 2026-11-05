# PetCard integration notes

## API surface
- `GET /api/catalog/breeds?petType=dog|cat|rabbit` returns breed options.
- `GET /api/catalog/avatars?petType=...` and `/stickers?petType=...` return catalogue keys and sticker Paw Point prices.
- `POST /api/pets` creates the pet, membership, optional first task, and persistent random `qrToken` (send `Idempotency-Key`).
- `GET /api/public/pets/qr/:token` is a public emergency-safe lookup. It intentionally excludes owner contact details and full health notes.
- `POST /api/pets/:petId/stickers` unlocks a sticker. The server reads the price from CatalogItem and debits the authenticated user's Paw Points; the client never submits a price.
- Guardian invite QR uses the backend-generated `deepLink`; redemption creates a pending request and the owner approves/rejects it.
- Tasks are created at `POST /api/pets/:petId/tasks`; categories and recurrence are validated server-side.

## Catalogue setup
Copy `data/catalog.sample.json` to `data/catalog.json`, replace/add every actual asset key, then run `npm run seed:catalog`. `price` is Paw Points; 0 means free. The sample catalogue is deliberately a starter subset, not a complete production catalogue.

## Local mobile API URL
Set `EXPO_PUBLIC_API_URL=http://192.168.0.106:5000` only when the phone and development machine are on the same LAN and that is the machine's current LAN IP. Do not include spaces or a trailing invisible character. For production use the deployed HTTPS origin.

## Verification limits
Static Node syntax checks and archive integrity checks can be run without credentials. MongoDB persistence, push delivery, Cloudinary upload, QR scanning on a physical device, and full Expo native build require the user's configured services/device and were not represented as end-to-end tested here.
