import { z } from 'zod'
import { DAY_MAP, USER_STATUS } from './user.constant'

// Allowed session types & their fixed durations
const SESSION_TYPES = {
  INTRODUCTION: 'Introduction',
  DISCUSSION: 'Discussion',
  DEEP_DIVE: 'Deep Dive',
} as const

const SESSION_DURATIONS = {
  [SESSION_TYPES.INTRODUCTION]: 15,
  [SESSION_TYPES.DISCUSSION]: 30,
  [SESSION_TYPES.DEEP_DIVE]: 60,
} as const

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
const AvailabilitySlotSchema = z
  .object({
    from: timeSchema, // your existing time validation (e.g. "HH:mm")
    to: timeSchema,
  })
  .refine(
    (data) => {
      const [fromH, fromM] = data.from.split(':').map(Number)
      const [toH, toM] = data.to.split(':').map(Number)
      const fromMinutes = fromH * 60 + fromM
      const toMinutes = toH * 60 + toM
      return fromMinutes < toMinutes
    },
    {
      message: '"to" time must be after "from" time',
      path: ['to'],
    },
  )

export const AvailabilitySchema = z.object({
  day: z.enum(Object.values(DAY_MAP) as [string, ...string[]], {
    message: 'Day is required!'
  }),
  slots: z
    .array(AvailabilitySlotSchema)
    .min(1, { message: 'At least one time slot is required per day' })
    .max(10, { message: 'Maximum 10 slots allowed per day' }), // optional limit
})

const SocialProfileSchema = z.object({
  type: z
    .string({
      message: 'Social profile type is required!',
    })
    .min(1, { message: 'Social profile type cannot be empty' })
    .max(50, { message: 'Social profile type is too long (max 50 characters)' }),

  url: z
    .string({
      message: 'Social profile URL is required!',
    })
    .url({
      message:
        'Please enter a valid URL (e.g., https://linkedin.com/in/username)',
    })
    .max(500, 'URL is too long (max 500 characters)'),
})

// Session duration item with strict type-duration mapping
const SessionDurationSchema = z
  .object({
    type: z.enum(
      [
        SESSION_TYPES.INTRODUCTION,
        SESSION_TYPES.DISCUSSION,
        SESSION_TYPES.DEEP_DIVE,
      ],
      {
        message: 'Session type is required!'
      },
    ),

    duration: z.number({
      message: 'Duration is required!'
    }),

    isOffered: z.boolean({
      message: 'isOffered must be true or false'
    }),
  })
  .superRefine((data, ctx) => {
    const expectedDuration =
      SESSION_DURATIONS[data.type as keyof typeof SESSION_DURATIONS]
    if (data.duration !== expectedDuration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duration must be exactly ${expectedDuration} minutes for type "${data.type}"`,
        path: ['duration'],
      })
    }
  })

// ✅ Create User Validation
const BookingBufferRuleSchema = z.object({
  duration: z
    .number({ message: 'Booking rule duration is required!' })
    .positive({ message: 'Booking rule duration must be greater than 0' }),
  buffer: z
    .number({ message: 'Booking rule buffer is required!' })
    .min(0, { message: 'Booking rule buffer cannot be negative' }),
})

const BookingRulesSchema = z.object({
  minNotice: z
    .number()
    .min(0, { message: 'Minimum notice cannot be negative' })
    .optional(),
  bookingHorizonDays: z
    .number()
    .min(1, { message: 'Booking horizon must be at least 1 day' })
    .optional(),
  slotBufferStep: z
    .number()
    .int({ message: 'Slot buffer step must be a whole number' })
    .min(0, { message: 'Slot buffer step cannot be negative' })
    .optional(),
  bufferRules: z.array(BookingBufferRuleSchema).optional(),
})

const createValidationSchema = z.object({
  body: z.object({
    firstName: z.string({ message: 'First name is required!' }),
    lastName: z.string({ message: 'Last name is required!' }),
    email: z
      .string({ message: 'Email is required!' })
      .email('Invalid email address'),
    password: z
      .string({ message: 'Password must be a string' })
      .min(8, { message: 'Password must be at least 8 characters' })
       .max(20, { message: 'Password cannot be more than 20 characters' }),
    confirmPass: z
      .string({ message: 'Confirm password is required' })
      .min(8, { message: 'Confirm password must be at least 8 characters' })
       .max(20, { message: 'Password cannot be more than 20 characters' }),
    dob: z.string({ message: 'Date of birth is required!' }),
    phoneNumber: z
      .string({ message: 'Phone number is required!' })
      .min(6, { message: 'Contact number must be at least 6 digits long' })
      .max(15, { message: 'Contact number must be at most 15 digits long' }),
    referralCode: z.string().trim().min(1).optional(),
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
    expertise: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    education: EducationSchema.optional(),

    // Strict availability validation
    availability: z.array(AvailabilitySchema).optional(),

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
    bookingRules: BookingRulesSchema.optional(),
    advisingStyles: z.array(z.string()).optional(),
    hourlyRate: z.number().optional(),
  }),
})

// Push Notification Settings Schema
const pushNotifySchema = z.object({
  bookingAndSchedule: z.boolean({
    message: 'bookingAndSchedule notification preference is required'
  }),

  scheduleRemainder: z.boolean({
    message: 'scheduleRemainder notification preference is required'
  }),

  payment: z.boolean({
    message: 'payment notification preference is required'
  }),

  points: z.boolean({
    message: 'points notification preference is required'
  }),

  followers: z.boolean({
    message: 'followers notification preference is required'
  }),

  post: z.boolean({
    message: 'post notification preference is required'
  }),

  reviews: z.boolean({
    message: 'reviews notification preference is required'
  }),
})

// Email Notification Settings Schema
const emailNotifySchema = z.object({
  booking: z.boolean({
    message: 'booking email notification preference is required'
  }),

  schedule: z.boolean({
    message: 'schedule email notification preference is required'
  }),

  payment: z.boolean({
    message: 'payment email notification preference is required'
  }),
})

const updateNotifySettingsValidation = z.object({
  body: z
    .object({
      pushNotify: pushNotifySchema,
      emailNotify: emailNotifySchema,
    })
    .strict(), // Reject any unknown fields
})

// ✅ Change Status Validation
const changeStatusValidationSchema = z.object({
  body: z.object({
    userId: z.string({ message: 'User ID is required!' }),
    status: z.enum(Object.values(USER_STATUS) as [string, ...string[]], {
      message: 'User status is required!',
    }),
  }),
})

// ✅ VAT Info Validation Schema
const useReferralCodeValidationSchema = z.object({
  body: z.object({
    referralCode: z
      .string({ message: 'Referral code is required!' })
      .trim()
      .min(1, { message: 'Referral code is required!' }),
  }),
})

const updateVatInfoValidationSchema = z.object({
  body: z.object({
    country: z
      .string()
      .length(2, { message: 'Country code must be exactly 2 characters (e.g., GB, US, DE)' })
      .toUpperCase(),
    isVatRegistered: z.boolean({
      message: 'isVatRegistered must be true or false',
    }),
    vatRegistrationNumber: z
      .string()
      .min(3, { message: 'VAT registration number is too short' })
      .max(20, { message: 'VAT registration number is too long' })
      .optional(),
  }),
})

export const UserValidation = {
  createValidationSchema,
  updateValidationSchema,
  changeStatusValidationSchema,
  useReferralCodeValidationSchema,
  updateNotifySettingsValidation,
  updateVatInfoValidationSchema,
}
