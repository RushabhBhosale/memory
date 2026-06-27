import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type ExpenseType = 'expense' | 'income';

export type ExpenseDocument = Document & {
  amount: number;
  category: string;
  currency: string;
  deviceExpenseId: string;
  merchant: string;
  note: string;
  originalSmsPreview: string;
  source: 'sms' | 'manual';
  timestamp: Date;
  type: ExpenseType;
  createdAt: Date;
  updatedAt: Date;
};

const expenseSchema = new Schema<ExpenseDocument>(
  {
    amount: {
      type: Number,
      min: 0,
      required: [true, 'Amount is required']
    },
    category: {
      type: String,
      default: 'general',
      trim: true,
      index: true
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true
    },
    deviceExpenseId: {
      type: String,
      required: [true, 'Device expense id is required'],
      trim: true,
      unique: true,
      index: true
    },
    merchant: {
      type: String,
      default: 'Unknown Merchant',
      trim: true,
      index: true
    },
    note: {
      type: String,
      default: '',
      trim: true
    },
    originalSmsPreview: {
      type: String,
      default: '',
      trim: true
    },
    source: {
      type: String,
      enum: ['sms', 'manual'],
      default: 'manual',
      trim: true
    },
    timestamp: {
      type: Date,
      required: [true, 'Timestamp is required'],
      index: true
    },
    type: {
      type: String,
      enum: ['expense', 'income'],
      default: 'expense',
      trim: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

expenseSchema.index({ createdAt: -1 });
expenseSchema.index({ merchant: 'text', category: 'text', note: 'text', originalSmsPreview: 'text' });

const Expense =
  (mongoose.models.Expense as Model<ExpenseDocument> | undefined) ??
  mongoose.model<ExpenseDocument>('Expense', expenseSchema);

export default Expense;
