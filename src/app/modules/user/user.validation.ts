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
  duration: z.string({ required_error: 'Duration is required!' }),
  isOffered: z.boolean({ required_error: 'isOffered must be true or false' }),
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
      .min(6, { message: 'Password must be at least 6 characters' })
      .max(12, { message: 'Password cannot be more than 12 characters' }),
    dob: z.string({ required_error: 'Date of birth is required!' })
  }),
})

// ✅ Update User Validation
const updateValidationSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    contractNumber: z.string().optional(),
    dob: z.string().optional(),
    bio: z.string().optional(),
    fcmToken: z.string().optional(),
    photoUrl: z.string().optional(),
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
    status: z
      .enum(Object.values(USER_STATUS) as [string, ...string[]])
      .optional(),
    isNotify: z.boolean().optional(),
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
