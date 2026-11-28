import { z } from 'zod'
import { phoneNumberSchema } from '../../utils/phoneSchema'

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
    phoneNumber: phoneNumberSchema(),
  }),
})

const changeSignupEmail = z.object({
  body: z.object({
    newEmail: z.string({ message: 'New email is required' }).email(),
  }),
})

export const resentOtpValidations = {
  changeSignupEmail,
  resentOtpInEmail,
  verifyOtpZodSchema,
  resentOtpInPhone,
}
