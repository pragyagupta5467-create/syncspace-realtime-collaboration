import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    activityId: {
      type: String,
      required: [true, 'Activity ID is required'],
      unique: true,
      index: true,
    },
    roomId: {
      type: String,
      required: [true, 'Room ID is required'],
      uppercase: true,
      trim: true,
      index: true,
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
    },
    userName: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    userColor: {
      type: String,
      default: '#6366f1',
    },
    type: {
      type: String,
      required: [true, 'Activity type is required'],
      enum: [
        'USER_JOINED',
        'USER_LEFT',
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_MOVED',
        'TASK_DELETED',
        'TASK_CONFLICT',
      ],
      index: true,
    },
    taskId: {
      type: String,
      default: null,
      index: true,
    },
    taskTitle: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high-performance retrieval of newest activities & replay
activitySchema.index({ roomId: 1, timestamp: -1 });
activitySchema.index({ roomId: 1, timestamp: 1 });
activitySchema.index({ roomId: 1, activityId: 1 }, { unique: true });

export const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
export default Activity;
