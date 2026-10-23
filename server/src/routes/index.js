import { Router } from 'express';

// Every /api route except /api/health (see app.js). Each feature mounts its
// router here, e.g. router.use('/auth', authRoutes).
const router = Router();

export default router;
