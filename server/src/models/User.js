import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  {
    timestamps: true,
    toJSON: {
      // What the API sends: never the password hash, even if it was selected.
      transform: (doc, { _id, name, email, role }) => ({ id: String(_id), name, email, role }),
    },
  },
);

export const User = mongoose.model('User', userSchema);
