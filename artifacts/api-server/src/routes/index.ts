import { Router, type IRouter } from "express";
import authRouter, { requireAuth } from "./auth";
import dashboardRouter from "./dashboard";
import documentsRouter from "./documents";
import evidenceRouter from "./evidence";
import healthRouter from "./health";
import recordsRouter from "./records";
import storageRouter from "./storage";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth);
router.use(dashboardRouter);
router.use(recordsRouter);
router.use(documentsRouter);
router.use(usersRouter);
router.use(evidenceRouter);
router.use(storageRouter);

export default router;
