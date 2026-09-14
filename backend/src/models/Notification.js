import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: [true, 'Notification ID is required'],
      unique: true,
      index: true,
    },
    recipientId: {
      type: String,
      required: [true, 'Recipient ID is required'],
      index: true,
    },
    actorId: {
      type: String,
      required: [true, 'Actor ID is required'],
    },
    actorName: {
      type: String,
      required: [true, 'Actor name is required'],
      trim: true,
    },
    roomId: {
      type: String,
      required: [true, 'Room ID is required'],
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['USER_JOINED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_CONFLICT', 'MENTION'],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: 300,
    },
    taskId: {
      type: String,
      default: null,
    },
    taskTitle: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast retrieval of unread / user-specific notifications
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
