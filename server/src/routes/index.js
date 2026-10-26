import { Router } from 'express';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import notificationRoutes from './notification.routes.js';
import projectRoutes from './project.routes.js';

// Every /api route except /api/health (see app.js).
const router = Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

export default router;
