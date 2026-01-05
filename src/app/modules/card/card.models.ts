import mongoose, { Schema } from 'mongoose';
import { ICard, ICardModel } from './card.interface';

const cardSchema: Schema<ICard> = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    holderName: {
      type: String,
      required: true,
    },
    cardNumber: {
      type: String,
      required: true,
    },
    expiryDate: {
      type: String,
      required: true,
    },
    cvc: {
      type: String,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  { timestamps: true },
);

export const Card = mongoose.model<ICard, ICardModel>(
  'Card',
  cardSchema,
);
