import mongoose from 'mongoose';

export const RESPONSE_STATUSES = ['open', 'in_progress', 'resolved', 'not_affected', 'unknown'];

const stepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    type: { type: String, enum: ['manual', 'auto_verify'], required: true },
    order: { type: Number, required: true },
    link: { type: String, default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actor: { type: String, enum: ['user', 'system'], required: true },
    action: { type: String, required: true },
    detail: { type: String, default: '' },
  },
  { _id: false },
);

// One project's response to one incident.
const incidentResponseSchema = new mongoose.Schema(
  {
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: RESPONSE_STATUSES, required: true },
    affectedReason: { type: String, default: '' },
    affectedSecrets: { type: [String], default: [] },
    steps: { type: [stepSchema], default: [] },
    notAffectedReason: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    timeline: { type: [timelineSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.owner;
        return ret;
      },
    },
  },
);

// At most one response per incident and project. The publish fan-out relies on
// this: running it twice can never create a duplicate.
incidentResponseSchema.index({ incident: 1, project: 1 }, { unique: true });

export const IncidentResponse = mongoose.model('IncidentResponse', incidentResponseSchema);
