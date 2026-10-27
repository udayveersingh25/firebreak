import mongoose from 'mongoose';
import { IncidentResponse } from '../models/IncidentResponse.js';
import { HttpError } from '../utils/httpError.js';

/** Loads :id only if it belongs to the logged-in user; otherwise the same 404 for everyone. */
export async function loadOwnedResponse(req, res, next) {
  const { id } = req.params;
  const response = mongoose.isObjectIdOrHexString(id)
    ? await IncidentResponse.findOne({ _id: id, owner: req.user._id })
    : null;

  if (!response) throw new HttpError(404, 'NOT_FOUND', 'We could not find that incident response.');
  req.response = response;
  next();
}
