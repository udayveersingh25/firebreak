import mongoose from 'mongoose';

// Full OSV records, shared by every project. MongoDB deletes each one 24 hours
// after it was fetched, so advisories that change are picked up again.
const vulnCacheSchema = new mongoose.Schema({
  vulnId: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  fetchedAt: { type: Date, required: true, default: Date.now, expires: 24 * 60 * 60 },
});

export const VulnCache = mongoose.model('VulnCache', vulnCacheSchema);
