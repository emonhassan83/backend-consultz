import { z } from 'zod'

const verifyOtpZodSchema = z.object({
  body: z.object({
    otp: z
      .string({ message: 'otp is required' })
      .length(4, { message: 'otp must be exactly 4 characters long' }),
  }),
})

const resentOtpInEmail = z.object({
  body: z.object({
    email: z
      .string({
        message: 'Email is required',
      })
      .email(),
  }),
})

const resentOtpInPhone = z.object({
  body: z.object({
    phoneNumber: z
      .string({
        message: 'Phone number is required',
      })
      .min(6, { message: 'Contact number must be at least 6 digits long' })
      .max(15, { message: 'Contact number must be at most 15 digits long' }),
  }),
})

export const resentOtpValidations = {
  resentOtpInEmail,
  verifyOtpZodSchema,
  resentOtpInPhone,
}
