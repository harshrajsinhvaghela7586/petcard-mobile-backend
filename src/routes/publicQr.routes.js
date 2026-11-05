import { Router } from "express";
import { publicQrLookup } from "../controller/petController.js";
export const publicQrRouter = Router();
publicQrRouter.get("/pets/qr/:token", publicQrLookup);
