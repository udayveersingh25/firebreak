import { Router } from 'express';
import {
  getResponse,
  listResponses,
  markNotAffected,
  reopenResponse,
  resolveResponse,
  updateStep,
} from '../controllers/response.controller.js';
import { loadOwnedResponse } from '../middlewares/loadOwnedResponse.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { validate } from '../middlewares/validate.js';
import { listResponsesQuery, notAffectedBody, stepBody, stepParams } from '../validators/response.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listResponsesQuery }), listResponses);
router.get('/:id', loadOwnedResponse, getResponse);
router.patch('/:id/steps/:stepKey', loadOwnedResponse, validate({ params: stepParams, body: stepBody }), updateStep);
router.post('/:id/not-affected', loadOwnedResponse, validate({ body: notAffectedBody }), markNotAffected);
router.post('/:id/reopen', loadOwnedResponse, reopenResponse);
router.post('/:id/resolve', loadOwnedResponse, resolveResponse);

export default router;
