import bcrypt from 'bcrypt'
import config from '../../config'
import { Schema, model } from 'mongoose'
import { TUser, UserModel } from './user.interface'
import {
  DAY_MAP,
  DEVICE_TYPE,
  REGISTER_WITH,
  registerWith,
  USER_ROLE,
  USER_STATUS,
} from './user.constant'
import { generateCryptoString } from '../../utils/generateCryptoString'
import { generateReferralCode } from '../../utils/generateReferralCode'
import { regenerateSlotsForExpert } from './user.service'

// 🎓 Education
const EducationSchema = new Schema(
  {
    degree: { type: String, default: '' },
    certificate: { type: [String], default: [] },
    phd: { type: String, default: '' },
  },
  { _id: false },
)

// 🌐 Social Profile
const SocialProfileSchema = new Schema(
  {
    type: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
)

// ⏱ Session Duration
const SessionDurationSchema = new Schema(
  {
    type: { type: String, required: true },
    duration: { type: Number, required: true },
    offeredPrice: {
      type: Number,
      required: false,
      default: 0,
    },
    isOffered: { type: Boolean, default: false },
  },
  { _id: false },
)

// Booking Rules
const DEFAULT_BOOKING_BUFFER_RULES = [
  { duration: 15, buffer: 5 },
  { duration: 30, buffer: 10 },
  { duration: 60, buffer: 20 },
]

const buildBookingBufferRules = (slotBufferStep = 5) =>
  [15, 30, 60].map((duration) => ({
    duration,
    buffer: slotBufferStep * (duration / 15),
  }))

const BookingBufferRuleSchema = new Schema(
  {
    duration: { type: Number, required: true, min: 1 },
    buffer: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const BookingRulesSchema = new Schema(
  {
    minNotice: { type: Number, default: 2, min: 0 },
    bookingHorizonDays: { type: Number, default: 60, min: 1 },
    slotBufferStep: { type: Number, default: 5, min: 0 },
    bufferRules: {
      type: [BookingBufferRuleSchema],
      default: () => DEFAULT_BOOKING_BUFFER_RULES,
    },
  },
  { _id: false },
)

// ✅ Module-level Map to survive between pre and post hooks
const availabilityChangeMap = new Map<string, string>()

// ===== User Schema =====
const userSchema = new Schema<TUser, UserModel>(
  {
    id: {
      type: String,
      unique: true,
      default: () => generateCryptoString(10),
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false },

    dob: { type: String, default: '' },
    headline: { type: String, default: '' },
    bio: { type: String, default: '' },
    fcmToken: { type: String, default: null },
    voipToken: { type: String, default: null },
    deviceType: {
      type: String,
      enum: Object.values(DEVICE_TYPE),
    },
    photoUrl: { type: String, default: null },
    coverPhoto: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    timeZone: { type: String, default: 'UTC' },
    priceRange: { type: String, default: '' },

    interests: { type: [String], default: [] },
    learningStyles: { type: [String], default: [] },
    expertise: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    advisingStyles: { type: [String], default: [] },

    education: { type: EducationSchema, default: {} },

    availability: {
      type: [
        {
          day: {
            type: String,
            enum: Object.values(DAY_MAP),
            required: true,
          },
          slots: {
            type: [
              {
                from: { type: String, required: true },
                to: { type: String, required: true },
              },
            ],
            _id: false,
          },
          _id: false,
        },
      ],
      default: [],
    },
    socialProfiles: { type: [SocialProfileSchema], default: [] },
    sessionDurations: { type: [SessionDurationSchema], default: [] },
    bookingRules: {
      type: BookingRulesSchema,
      default: () => ({
        minNotice: 2,
        bookingHorizonDays: 60,
        slotBufferStep: 5,
        bufferRules: buildBookingBufferRules(5),
      }),
    },
    hourlyRate: { type: Number, default: 0 },

    role: {
      type: String,
      enum: Object.values(USER_ROLE),
      default: USER_ROLE.consult,
    },
    registerWith: {
      type: String,
      enum: registerWith,
      default: REGISTER_WITH.credentials,
    },
    needsPasswordChange: { type: Boolean, default: true },
    passwordChangedAt: { type: Date, default: null },

    verification: {
      otp: { type: Schema.Types.Mixed, default: 0 },
      expiresAt: { type: Date, default: null },
      status: { type: Boolean, default: false },
    },

    following: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    advisingTime: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    avgRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    stripeAccountId: { type: String, default: null },
    referralCode: { type: String, default: () => generateReferralCode() },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    country: { type: String, default: '' },
    vatRegistrationNumber: { type: String, default: null },
    isVatRegistered: { type: Boolean, default: false },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.active,
    },

    expireAt: {
      type: Date,
      default: () => {
        const expireAt = new Date()
        return expireAt.setMinutes(expireAt.getMinutes() + 30)
      },
    },
    pushNotify: {
      bookingAndSchedule: { type: Boolean, default: true },
      scheduleRemainder: { type: Boolean, default: true },
      payment: { type: Boolean, default: true },
      points: { type: Boolean, default: true },
      followers: { type: Boolean, default: true },
      post: { type: Boolean, default: true },
      reviews: { type: Boolean, default: true },
    },
    emailNotify: {
      booking: { type: Boolean, default: true },
      schedule: { type: Boolean, default: true },
      payment: { type: Boolean, default: true },
    },
    stripeCustomerId: { type: String, default: null },
    isTopExpert: { type: Boolean, default: false },
    isProfileSetup: { type: Boolean, default: false },
    profileCompletionBonusClaimed: { type: Boolean, default: false },
    socialProofBonusClaimed: { type: Boolean, default: false },
    isPhoneOtpVerified: { type: Boolean, default: false },
    lastNoShowBonusAt: {
      type: Date,
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

// TTL index
userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })
userSchema.index({ referralCode: 1 })

userSchema.pre('validate', function () {
  if (!this.bookingRules) {
    return
  }

  const slotBufferStep = this.bookingRules.slotBufferStep ?? 5
  this.bookingRules.bufferRules = buildBookingBufferRules(slotBufferStep)
})

// ====================== AVAILABILITY CHANGE DETECTION ======================

userSchema.pre('save', async function () {
  // Hash password if modified
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    )
  }

  // ✅ Store old availability in module-level Map before save
  if (this.isModified('availability') && !this.isNew) {
    const oldDoc = (await this.model('User')
      .findById(this._id)
      .select('availability')
      .lean()) as TUser | null

    availabilityChangeMap.set(
      this._id.toString(),
      JSON.stringify(oldDoc?.availability || []),
    )
  }
})

userSchema.post('save', async function (doc: any) {
  const userId = doc._id.toString()
  const oldAvailability = availabilityChangeMap.get(userId)

  // Not in map means availability was not modified
  if (oldAvailability === undefined) return

  // ✅ Cleanup immediately
  availabilityChangeMap.delete(userId)

  const newAvailability = JSON.stringify(doc.availability || [])
  if (oldAvailability === newAvailability) {
    console.log('[Availability Hook] Content unchanged — skipping regeneration')
    return
  }

  console.log(
    '[Availability Hook] ✅ Change detected — triggering slot regeneration',
  )

  setImmediate(async () => {
    try {
      await regenerateSlotsForExpert(userId)
      console.log(`[Slot Regeneration] ✅ Completed for expert: ${userId}`)
    } catch (err: any) {
      console.error(
        `[Slot Regeneration] ❌ Failed for expert ${userId}:`,
        err.message,
      )
    }
  })
})

//* Static method: find user by email
userSchema.statics.isUserExistsByEmail = async function (
  email: string,
): Promise<TUser | null> {
  return await this.findOne({ email })
}

//* Static method: compare passwords
userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(plainTextPassword, hashedPassword)
}

export const User = model<TUser, UserModel>('User', userSchema)
