import mongoose from 'mongoose';

export const INCIDENT_KINDS = ['vulnerability', 'compromise'];
export const INCIDENT_SEVERITIES = ['low', 'moderate', 'high', 'critical'];
export const INCIDENT_STATUSES = ['draft', 'published', 'archived'];

const targetSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['package', 'service', 'hosting'], required: true },
    packageName: String,
    affectedRange: String,
    fixedVersion: String,
    serviceKey: String,
    hostingProvider: String,
  },
  { _id: false },
);

const incidentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    kind: { type: String, enum: INCIDENT_KINDS, required: true },
    target: { type: targetSchema, required: true },
    severity: { type: String, enum: INCIDENT_SEVERITIES, required: true },
    sourceUrl: { type: String, default: null },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'draft', index: true },
    isSimulated: { type: Boolean, default: true },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    matchedCounts: {
      affected: { type: Number, default: 0 },
      unknown: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const Incident = mongoose.model('Incident', incidentSchema);
