import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ExpenseAccountDocument = Document & {
  passwordHash: string;
  passwordSalt: string;
  userId: string;
  username: string;
  usernameNormalized: string;
  createdAt: Date;
  updatedAt: Date;
};

const expenseAccountSchema = new Schema<ExpenseAccountDocument>(
  {
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    passwordSalt: {
      type: String,
      required: true,
      select: false
    },
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    username: {
      type: String,
      required: true,
      trim: true
    },
    usernameNormalized: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

const ExpenseAccount =
  (mongoose.models.ExpenseAccount as Model<ExpenseAccountDocument> | undefined) ??
  mongoose.model<ExpenseAccountDocument>('ExpenseAccount', expenseAccountSchema);

export default ExpenseAccount;
