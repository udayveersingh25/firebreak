import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Loads :id only if it belongs to the logged-in user. A malformed ID, a missing
 * project and someone else's project all get the same 404, so nobody can find
 * out that another user's project exists.
 */
export async function loadOwnedProject(req, res, next) {
  const { id } = req.params;
  const project = mongoose.isObjectIdOrHexString(id)
    ? await Project.findOne({ _id: id, owner: req.user._id })
    : null;

  if (!project) throw new HttpError(404, 'NOT_FOUND', 'We could not find that project.');
  req.project = project;
  next();
}
