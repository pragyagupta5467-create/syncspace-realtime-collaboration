import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: [true, 'Room ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      userId: { type: String, default: 'anonymous' },
      displayName: { type: String, default: 'Anonymous' },
      userColor: { type: String, default: '#6366f1' },
    },
  },
  {
    timestamps: true,
  }
);

export const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);
export default Room;
