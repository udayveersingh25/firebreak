import { Router } from 'express';
import authRoutes from './auth.routes.js';

// Every /api route except /api/health (see app.js).
const router = Router();

router.use('/auth', authRoutes);

export default router;
