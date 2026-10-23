import mongoose from 'mongoose';

/**
 * Connects to MongoDB. Gives up after 10 seconds instead of hanging, so a bad
 * URI or a missing Atlas network rule shows up immediately in the logs.
 */
export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/** 'connected', 'connecting', 'disconnecting' or 'disconnected'. */
export function databaseStatus() {
  const state = mongoose.STATES[mongoose.connection.readyState];
  return state === 'uninitialized' || !state ? 'disconnected' : state;
}

/** Error message with any user:password@ part of a connection string removed. */
export function describeConnectionError(error) {
  return String(error?.message ?? error).replace(/\/\/[^/@\s]+@/g, '//<credentials>@');
}
