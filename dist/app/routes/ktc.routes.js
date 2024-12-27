import { Router } from "express";
import { getDayValues } from "../controllers/ktc.controller.js";
const router = Router();
router.get("/day", getDayValues);
export default router;
