import { Router } from 'express';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  replaceSecrets,
  uploadLockfile,
} from '../controllers/project.controller.js';
import { loadOwnedProject } from '../middlewares/loadOwnedProject.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate } from '../middlewares/validate.js';
import { createProjectBody, lockfileBody, secretsBody } from '../validators/project.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', listProjects);
router.post('/', validate({ body: createProjectBody }), createProject);
router.get('/:id', loadOwnedProject, getProject);
router.delete('/:id', loadOwnedProject, deleteProject);
router.put('/:id/lockfile', loadOwnedProject, validate({ body: lockfileBody }), uploadLockfile);
router.put('/:id/secrets', loadOwnedProject, validate({ body: secretsBody }), replaceSecrets);

export default router;
