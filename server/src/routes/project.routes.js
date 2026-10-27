import express, { Router } from 'express';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  overrideSecret,
  replaceSecrets,
  scanProject,
  uploadLockfile,
} from '../controllers/project.controller.js';
import { loadOwnedProject } from '../middlewares/loadOwnedProject.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate } from '../middlewares/validate.js';
import {
  createProjectBody,
  lockfileBody,
  secretOverrideBody,
  secretParams,
  secretsBody,
} from '../validators/project.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', listProjects);
router.post('/', validate({ body: createProjectBody }), createProject);
router.get('/:id', loadOwnedProject, getProject);
router.delete('/:id', loadOwnedProject, deleteProject);
// A 5 MB lockfile grows when wrapped in JSON. Read only after requireAuth and
// loadOwnedProject have passed; app.js leaves this route's body unread.
router.put(
  '/:id/lockfile',
  loadOwnedProject,
  express.json({ limit: '6mb' }),
  validate({ body: lockfileBody }),
  uploadLockfile,
);
router.post('/:id/scan', loadOwnedProject, scanProject);
router.put('/:id/secrets', loadOwnedProject, validate({ body: secretsBody }), replaceSecrets);
router.patch(
  '/:id/secrets/:name',
  loadOwnedProject,
  validate({ params: secretParams, body: secretOverrideBody }),
  overrideSecret,
);

export default router;
