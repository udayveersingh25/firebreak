import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { HttpError } from '../utils/httpError.js';

const PAGE_SIZE = 50;

export async function listNotifications(req, res) {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(PAGE_SIZE),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  res.json({ notifications, unreadCount });
}

export async function markRead(req, res) {
  const { id } = req.params;
  // Someone else's notification is a 404, like any resource you do not own.
  const notification = mongoose.isObjectIdOrHexString(id)
    ? await Notification.findOne({ _id: id, user: req.user._id })
    : null;
  if (!notification) throw new HttpError(404, 'NOT_FOUND', 'We could not find that notification.');
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  res.json({ notification });
}

export async function markAllRead(req, res) {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ unreadCount: 0 });
}
