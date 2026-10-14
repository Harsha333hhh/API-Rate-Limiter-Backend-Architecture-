// MESSAGE MODEL - Schema for direct messages between two users
// We store the friendly short userIds of both sender and receiver,
// plus the text and a timestamp. A conversation is just all messages
// where (sender, receiver) match either direction.
import mongoose from 'mongoose'

// define the message schema
const messageSchema = new mongoose.Schema(
  {
    // friendly short userId of the person sending
    senderId: { type: String, required: true },
    // friendly short userId of the person receiving
    receiverId: { type: String, required: true },
    // the actual message text
    // Plaintext exists only to serve any participant whose personal copy is unprotected.
    text: { type: String, trim: true },
    // Each protected participant receives a separately wrapped copy of the data key.
    protectedCopies: {
      type: [
        new mongoose.Schema(
          {
            userId: { type: String, required: true },
            version: { type: Number, required: true },
            iv: { type: String, required: true },
            ciphertext: { type: String, required: true },
            wrappedKey: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // whether the receiver has opened this message
    read: { type: Boolean, default: false },
    // list of userIds for whom this message / conversation is hidden (soft-deleted from sidebar)
    hiddenFor: { type: [String], default: [] },
  },
  { timestamps: true } // gives us createdAt automatically
)

messageSchema.pre('validate', function validateMessageBody(next) {
  if ((!this.text || !this.text.trim()) && this.protectedCopies.length === 0) {
    this.invalidate('text', 'A message requires plaintext or at least one protected copy')
  }
  next()
})

// create and export the model
export const MessageModel = mongoose.model('Message', messageSchema)
