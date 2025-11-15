import { z } from 'zod'
import { USER_STATUS } from './user.constant'

// 🔹 Sub-schemas
const EducationSchema = z.object({
  degree: z.string().optional(),
  certificate: z.array(z.string()).optional(),
  phd: z.string().optional(),
})

const AvailabilitySchema = z.object({
  day: z.string({ required_error: 'Day is required!' }),
  from: z.string({ required_error: 'From time is required!' }),
  to: z.string({ required_error: 'To time is required!' }),
})

const SocialProfileSchema = z.object({
  type: z.string({ required_error: 'Social profile type is required!' }),
  url: z.string({ required_error: 'Social profile URL is required!' }),
})

const SessionDurationSchema = z.object({
  type: z.string({ required_error: 'Session type is required!' }),
  duration: z.number({ required_error: 'Duration is required!' }),
  isOffered: z.boolean({ required_error: 'isOffered must be true or false' }),
})

const BankAccountSchema = z.object({
  holderName: z.string().optional(),
  number: z.number().optional(),
  sortCode: z.string().optional(),
})

// ✅ Create User Validation
const createValidationSchema = z.object({
  body: z.object({
    firstName: z.string({ required_error: 'First name is required!' }),
    lastName: z.string({ required_error: 'Last name is required!' }),
    email: z
      .string({ required_error: 'Email is required!' })
      .email('Invalid email address'),
    password: z
      .string({ invalid_type_error: 'Password must be a string' })
      .min(8, { message: 'Password must be at least 8 characters' })
      .max(16, { message: 'Password cannot be more than 16 characters' }),
    confirmPass: z
      .string({ required_error: 'Confirm password is required' })
      .min(8, { message: 'Confirm password must be at least 8 characters' })
      .max(16, {
        message: 'Confirm password cannot be more than 16 characters',
      }),
    dob: z.string({ required_error: 'Date of birth is required!' }),
    phoneNumber: z.string({ required_error: 'Phone number is required!' }),
  }),
})

// ✅ Update User Validation
const updateValidationSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phoneNumber: z.string().optional(),
    dob: z.string().optional(),
    bio: z.string().optional(),
    coverPhoto: z.string().optional(),
    timeZone: z.string().optional(),
    priceRange: z.string().optional(),
    interests: z.array(z.string()).optional(),
    learningStyles: z.array(z.string()).optional(),
    expertise: z.string().optional(),
    languages: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    education: EducationSchema.optional(),
    availability: z.array(AvailabilitySchema).optional(),
    socialProfiles: z.array(SocialProfileSchema).optional(),
    sessionDurations: z.array(SessionDurationSchema).optional(),
    advisingStyles: z.array(z.string()).optional(),
    hourlyRate: z.number().optional(),
    bankDetails: BankAccountSchema.optional(),
  }),
})

// ✅ Change Status Validation
const changeStatusValidationSchema = z.object({
  body: z.object({
    userId: z.string({ required_error: 'User ID is required!' }),
    status: z.enum(Object.values(USER_STATUS) as [string, ...string[]], {
      required_error: 'User status is required!',
    }),
  }),
})

export const UserValidation = {
  createValidationSchema,
  updateValidationSchema,
  changeStatusValidationSchema,
}
