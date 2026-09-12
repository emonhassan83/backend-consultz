import { z } from 'zod';
import { ALLOWED_KEYS, GENERAL_KEYS } from './contents.constants';

export type TGeneralKey = (typeof GENERAL_KEYS)[number];

// Get Single Content by Key
const getContentByKeyZodSchema = z.object({
  params: z.object({
    key: z.enum(ALLOWED_KEYS as unknown as [string, ...string[]], {
      message: 'Invalid setting key provided',
    }),
  }),
});

// Create or Update Single Setting
const createOrUpdateSettingZodSchema = z.object({
  params: z.object({
    key: z.enum(ALLOWED_KEYS as unknown as [string, ...string[]], {
      message: 'Invalid setting key provided',
    }),
  }),
  body: z.object({
    value: z.any(),
    name: z.string().trim().optional(),
  }),
});

// Update Multiple General Settings
const updateGeneralsZodSchema = z.object({
  body: z
    .object({
      paymentHoldDays: z
        .number()
        .min(1, 'Payment hold days must be at least 1')
        .optional(),
      platformFeePercentage: z
        .number()
        .min(0, 'Platform fee percentage cannot be negative')
        .max(100, 'Platform fee percentage cannot be greater than 100')
        .optional(),
      supportContract: z.string().optional(),
      supportEmail: z.string().email({ message: 'Invalid email' }).optional(),
      reschedulingTime: z.number().min(0).optional(),
      cancellationTime: z.number().min(0).optional(),

      // Trams and condition
      tramsAndCondition: z.string().optional(),
      privacyAndPolicy: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one general setting value must be provided',
    }),
});

export const ContentValidation = {
  getContentByKeyZodSchema,
  createOrUpdateSettingZodSchema,
  updateGeneralsZodSchema,
};
