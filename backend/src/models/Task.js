import mongoose from 'mongoose';

const userReferenceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    userColor: { type: String, default: '#6366f1' },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    taskId: {
      type: String,
      required: [true, 'Task ID is required'],
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
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: 140,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 800,
    },
    status: {
      type: String,
      enum: ['TODO', 'IN_PROGRESS', 'DONE'],
      default: 'TODO',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM',
    },
    position: {
      type: Number,
      default: 0,
    },
    version: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: userReferenceSchema,
      required: true,
    },
    updatedBy: {
      type: userReferenceSchema,
      required: true,
    },
    assignedTo: {
      type: userReferenceSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast, securely scoped queries by room and position
taskSchema.index({ roomId: 1, taskId: 1 }, { unique: true });
taskSchema.index({ roomId: 1, position: 1 });
taskSchema.index({ roomId: 1, status: 1, position: 1 });

export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
export default Task;
