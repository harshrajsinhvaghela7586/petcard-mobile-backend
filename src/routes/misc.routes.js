import { Router } from "express";

import * as catalog from "../controller/catalogController.js";
import * as uploads from "../controller/uploadController.js";
import * as guardians from "../controller/guardianController.js";
import { uploadSignLimiter, inviteRedeemLimiter } from "../middleware/userLimiters.js";

/* /api/catalog */
export const catalogRouter = Router();
catalogRouter.get("/avatars", catalog.listAvatars);
catalogRouter.get("/stickers", catalog.listStickers);
catalogRouter.get("/breeds", catalog.listBreeds);

/* /api/uploads */
export const uploadsRouter = Router();
uploadsRouter.post("/sign", uploadSignLimiter, uploads.signUpload);

/* /api/guardian-invites  (the person who scanned the QR code) */
export const guardianInvitesRouter = Router();
guardianInvitesRouter.post("/lookup", inviteRedeemLimiter, guardians.lookupInvite);
guardianInvitesRouter.post("/redeem", inviteRedeemLimiter, guardians.redeemInvite);

/* /api/guardian-requests */
export const guardianRequestsRouter = Router();
guardianRequestsRouter.get("/mine", guardians.myRequests);
guardianRequestsRouter.post("/by-pet-qr", guardians.requestByPetQr);
guardianRequestsRouter.delete("/:requestId", guardians.cancelRequest);
