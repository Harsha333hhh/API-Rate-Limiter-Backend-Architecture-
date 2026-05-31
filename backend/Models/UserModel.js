// USER MODEL - Schema for app users
// Each user gets a friendly short "userId" (e.g. "a7k2p9") that others use to message them.
// The normal Mongo _id still exists, but userId is what we show and type in the UI.
import mongoose from 'mongoose'

// generate a short, friendly, lowercase id like "a7k2p9"
// (no confusing characters like 0/o or 1/l)
function generateShortId() {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz'
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

// define the user schema
const userSchema = new mongoose.Schema(
  {
    // friendly id used for messaging - unique and auto-generated
    userId: { type: String, unique: true, default: generateShortId },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // stored as a bcrypt hash
    role: { type: String, default: 'user' },
    // soft-delete marker: keeps the user row so past messages still attribute to a userId
    isDeleted: { type: Boolean, default: false },
    // list of userIds this user has blocked (prevents them from delivering messages to the blocker)
    blocked: { type: [String], default: [] },
  },
  { timestamps: true }
)

// create and export the model
export const UserModel = mongoose.model('User', userSchema)
