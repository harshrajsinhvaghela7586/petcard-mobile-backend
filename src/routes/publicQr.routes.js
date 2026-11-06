import { Router } from "express";
import { publicQrLookup } from "../controller/petController.js";
import { optionalUser } from "../middleware/optionalUser.js";
export const publicQrRouter = Router();
publicQrRouter.get("/pets/qr/:token", optionalUser, publicQrLookup);
