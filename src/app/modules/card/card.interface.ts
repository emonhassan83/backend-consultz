import { Model, Types } from 'mongoose';

export interface ICard {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  holderName: string;
  cardNumber: string;
  expiryDate: string;
  cvc: string;
  isDeleted: boolean;
}

export type ICardModel = Model<ICard, Record<string, unknown>>;
