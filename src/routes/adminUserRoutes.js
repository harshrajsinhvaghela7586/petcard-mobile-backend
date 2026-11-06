import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { getAdminUsers } from "../controller/adminUserController.js";

export const adminUserRouter = Router();

adminUserRouter.get("/", requireAdmin, getAdminUsers);