import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const PALETTE = [
  '#6366f1', // Indigo
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#3b82f6', // Blue
];

function getRandomUserColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    userColor: {
      type: String,
      default: getRandomUserColor,
    },
  },
  {
    timestamps: true,
  }
);

// Method to compare candidate password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method to return safe JSON without passwordHash
userSchema.methods.toAuthJSON = function () {
  return {
    userId: this._id.toString(),
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    userColor: this.userColor,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
