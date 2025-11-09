import mongoose from 'mongoose';
import { z } from 'zod';

// Define the Zod validation schema
const createValidationSchema = z.object({
  body: z.object({
    follower: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid follower ID',
    }),
    following: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid following ID',
    }),
  }),
});

export const FollowValidation = {
  createValidationSchema,
};
