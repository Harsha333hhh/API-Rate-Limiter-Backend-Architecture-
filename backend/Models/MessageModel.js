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
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true } // gives us createdAt automatically
)

// create and export the model
export const MessageModel = mongoose.model('Message', messageSchema)
