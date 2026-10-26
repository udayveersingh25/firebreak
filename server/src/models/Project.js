import mongoose from 'mongoose';

export const HOSTING_PROVIDERS = ['vercel', 'render', 'railway', 'netlify', 'zeabur', 'fly', 'other'];
export const CRITICALITIES = ['critical', 'high', 'medium', 'low', 'public'];

const dependencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    version: { type: String, required: true },
    isDev: { type: Boolean, required: true },
    isDirect: { type: Boolean, required: true },
  },
  { _id: false },
);

// Names only. There is deliberately no field that could hold a secret value.
const secretSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    serviceKey: { type: String, required: true },
    serviceLabel: { type: String, required: true },
    capability: { type: String, required: true },
    criticality: { type: String, enum: CRITICALITIES, required: true },
    publicByDesign: { type: Boolean, default: false },
    exposedInFrontend: { type: Boolean, default: false },
    exposureReason: { type: String, default: null },
    rotateUrl: { type: String, default: null },
    rotationNotes: { type: String, default: null },
    userOverride: { type: Boolean, default: false },
    lastRotatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const findingSchema = new mongoose.Schema(
  {
    vulnId: String,
    aliases: [String],
    packageName: String,
    installedVersion: String,
    severity: String,
    summary: String,
    fixedVersion: String,
    isDev: Boolean,
    isDirect: Boolean,
    priority: String,
    explanation: String,
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    hostingProvider: { type: String, enum: HOSTING_PROVIDERS, required: true },
    lockfile: {
      type: new mongoose.Schema(
        { uploadedAt: Date, lockfileVersion: Number, packageCount: Number },
        { _id: false },
      ),
      default: null,
    },
    dependencies: { type: [dependencySchema], default: [] },
    secrets: { type: [secretSchema], default: [] },
    // null until the user has given us their .env names at least once, so
    // "no secrets yet" (unknown) is different from "an empty list" (known).
    secretsUpdatedAt: { type: Date, default: null },
    scan: {
      status: { type: String, enum: ['never', 'running', 'succeeded', 'failed'], default: 'never' },
      lastRunAt: { type: Date, default: null },
      error: { type: String, default: null },
      packagesScanned: { type: Number, default: 0 },
      // Identifies the latest run, so a slow older run cannot overwrite a newer one.
      runId: { type: String, default: null },
    },
    findings: { type: [findingSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.owner;
        if (ret.scan) delete ret.scan.runId;
        return ret;
      },
    },
  },
);

// Incident matching looks projects up by package name.
projectSchema.index({ 'dependencies.name': 1 });

export const Project = mongoose.model('Project', projectSchema);
