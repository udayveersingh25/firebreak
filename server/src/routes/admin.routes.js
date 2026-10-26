import { Router } from 'express';
import {
  archiveIncident,
  createIncident,
  getIncident,
  listIncidents,
  previewIncidentMatches,
  publishIncident,
  updateIncident,
} from '../controllers/admin.controller.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate } from '../middlewares/validate.js';
import { incidentBody } from '../validators/incident.validators.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/incidents', listIncidents);
router.post('/incidents', validate({ body: incidentBody }), createIncident);
router.get('/incidents/:id', getIncident);
router.patch('/incidents/:id', validate({ body: incidentBody }), updateIncident);
router.post('/incidents/:id/preview', previewIncidentMatches);
router.post('/incidents/:id/publish', publishIncident);
router.post('/incidents/:id/archive', archiveIncident);

export default router;
