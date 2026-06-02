import mongoose from 'mongoose';
import { z } from 'zod';

// Define the Zod validation schema
const createValidationSchema = z.object({
  body: z.object({
    blocker: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid blocker ID',
    }),
    blocked: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid blocked ID',
    }),
  }),
});

export const BlockProfileValidation = {
  createValidationSchema,
};
