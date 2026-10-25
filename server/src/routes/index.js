import { Router } from 'express';
import authRoutes from './auth.routes.js';
import projectRoutes from './project.routes.js';

// Every /api route except /api/health (see app.js).
const router = Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);

export default router;
