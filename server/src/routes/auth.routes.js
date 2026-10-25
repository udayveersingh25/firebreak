import { Router } from 'express';
import { login, logout, me, register } from '../controllers/auth.controller.js';
import { loginLimiter, registerLimiter } from '../middlewares/rateLimits.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate } from '../middlewares/validate.js';
import { loginBody, registerBody } from '../validators/auth.validators.js';

const router = Router();

router.post('/register', registerLimiter(), validate({ body: registerBody }), register);
router.post('/login', loginLimiter(), validate({ body: loginBody }), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
