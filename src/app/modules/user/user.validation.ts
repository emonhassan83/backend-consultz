import { z } from 'zod'
import { DAY_MAP, USER_STATUS } from './user.constant'

// Allowed session types & their fixed durations
const SESSION_TYPES = {
  INTRODUCTION: 'Introduction',
  DISCUSSION: 'Discussion',
  DEEP_DIVE: 'Deep Dive',
} as const;

const SESSION_DURATIONS = {
  [SESSION_TYPES.INTRODUCTION]: 15,
  [SESSION_TYPES.DISCUSSION]: 30,
  [SESSION_TYPES.DEEP_DIVE]: 60,
} as const;

// 🔹 Sub-schemas
const EducationSchema = z.object({
  degree: z.string().optional(),
  certificate: z.array(z.string()).optional(),
  phd: z.string().optional(),
})

// Reusable time validation (HH:mm format, 24-hour)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
  message: 'Time must be in HH:mm format (24-hour, e.g., 09:00 or 14:30)',
})

// Availability item with strict time validation
const AvailabilitySchema = z
  .object({
    day: z.enum(Object.values(DAY_MAP) as [string, ...string[]], {
      required_error: 'Day is required!',
      invalid_type_error: 'Invalid day',
    }),
    from: timeSchema,
    to: timeSchema,
  })
  .refine(
    (data) => {
      // Convert times to minutes since midnight and compare
      const [fromH, fromM] = data.from.split(':').map(Number)
      const [toH, toM] = data.to.split(':').map(Number)

      const fromMinutes = fromH * 60 + fromM
      const toMinutes = toH * 60 + toM

      return fromMinutes < toMinutes
    },
    {
      message: '"to" time must be after "from" time',
      path: ['to'], // error appears on "to" field
    },
  )

const SocialProfileSchema = z.object({
  type: z
    .string({
      required_error: 'Social profile type is required!',
      invalid_type_error: 'Social profile type must be a string',
    })
    .min(1, 'Social profile type cannot be empty')
    .max(50, 'Social profile type is too long (max 50 characters)'),

  url: z
    .string({
      required_error: 'Social profile URL is required!',
      invalid_type_error: 'Social profile URL must be a string',
    })
    .url({
      message:
        'Please enter a valid URL (e.g., https://linkedin.com/in/username)',
    })
    .max(500, 'URL is too long (max 500 characters)'),
})

// Session duration item with strict type-duration mapping
const SessionDurationSchema = z.object({
  type: z.enum([
    SESSION_TYPES.INTRODUCTION,
    SESSION_TYPES.DISCUSSION,
    SESSION_TYPES.DEEP_DIVE,
  ], {
    required_error: 'Session type is required!',
    invalid_type_error: 'Invalid session type',
  }),

  duration: z.number({
    required_error: 'Duration is required!',
    invalid_type_error: 'Duration must be a number',
  }),

  isOffered: z.boolean({
    required_error: 'isOffered must be true or false',
    invalid_type_error: 'isOffered must be a boolean',
  }),
}).refine(
  (data) => {
    const expectedDuration = SESSION_DURATIONS[data.type as keyof typeof SESSION_DURATIONS];
    return data.duration === expectedDuration;
  },
  (data) => ({
    message: `Duration must be exactly ${SESSION_DURATIONS[data.type as keyof typeof SESSION_DURATIONS]} minutes for type "${data.type}"`,
    path: ['duration'],
  })
);

const BankAccountSchema = z.object({
  bankName: z.string().optional(),
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

    // Strict availability validation
    availability: z
      .array(AvailabilitySchema)
      .optional()
      .refine(
        (items) => {
          if (!items || items.length === 0) return true // empty is allowed
          // Prevent duplicate days
          const days = items.map((item) => item.day)
          return new Set(days).size === days.length
        },
        {
          message: 'Duplicate days are not allowed in availability',
        },
      ),

    // Strict socialProfiles validation
    socialProfiles: z
      .array(SocialProfileSchema)
      .min(0, 'Social profiles can be empty')
      .max(10, 'Maximum 10 social profiles are allowed')
      .refine(
        (profiles) => {
          // Prevent duplicate types (case-insensitive)
          const types = profiles.map((p) => p.type.toLowerCase().trim())
          return new Set(types).size === types.length
        },
        {
          message:
            'Duplicate social profile types are not allowed (case-insensitive)',
        },
      )
      .optional(),
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
