import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
    // What this notification is about, e.g. "response-created:<responseId>".
    // Unique, so retrying a publish can never notify anyone twice.
    dedupeKey: { type: String, required: true, unique: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.user;
        delete ret.dedupeKey;
        return ret;
      },
    },
  },
);

notificationSchema.index({ user: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
