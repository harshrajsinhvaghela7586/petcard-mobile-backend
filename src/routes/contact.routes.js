import { Router } from "express";
import { createContactMessage } from "../controller/contactController.js";

export const contactRouter = Router();
contactRouter.post("/", createContactMessage);
