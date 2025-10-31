import bcrypt from 'bcrypt'
import config from '../../config'
import { Schema, model } from 'mongoose'
import { TUser, UserModel } from './user.interface'
import {
  REGISTER_WITH,
  registerWith,
  USER_ROLE,
  USER_STATUS,
} from './user.constant'
import { generateCryptoString } from '../../utils/generateCryptoString'

// 🎓 Education
const EducationSchema = new Schema(
  {
    degree: { type: String, default: '' },
    certificate: { type: [String], default: [] },
    phd: { type: String, default: '' },
  },
  { _id: false }
)

// 📅 Availability
const AvailabilitySchema = new Schema(
  {
    day: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false }
)

// 🌐 Social Profile
const SocialProfileSchema = new Schema(
  {
    type: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
)

// ⏱ Session Duration
const SessionDurationSchema = new Schema(
  {
    type: { type: String, required: true },
    duration: { type: String, required: true },
    isOffered: { type: Boolean, default: false },
  },
  { _id: false }
)

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
    password: { type: String, required: true },

    dob: { type: String, default: '' },
    headline: { type: String, default: '' },
    bio: { type: String, default: '' },
    fcmToken: { type: String, default: null },
    photoUrl: { type: String, default: null },
    coverPhoto: { type: String, default: null },
    contractNumber: { type: String, default: null },
    timeZone: { type: String, default: 'UTC' },
    priceRange: { type: String, default: '' },

    interests: { type: [String], default: [] },
    learningStyles: { type: [String], default: [] },
    expertise: { type: String, default: '' },
    languages: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    advisingStyles: { type: [String], default: [] },

    education: { type: EducationSchema, default: {} },
    availability: { type: [AvailabilitySchema], default: [] },
    socialProfiles: { type: [SocialProfileSchema], default: [] },
    sessionDurations: { type: [SessionDurationSchema], default: [] },

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
    level: { type: Number, default: 1 },
    avgRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

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

    isNotify: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

// TTL index for expireAt
userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })

//* Hash password before saving
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds)
    )
  }
  next()
})

//* Static method: find user by username (assuming username == email or name)
userSchema.statics.isUserExistsByUserName = async function (
  name: string
): Promise<TUser | null> {
  return await this.findOne({
    $or: [{ firstName: name }, { lastName: name }, { email: name }],
  })
}

//* Static method: find user by email
userSchema.statics.isUserExistsByEmail = async function (
  email: string
): Promise<TUser | null> {
  return await this.findOne({ email })
}

//* Static method: compare passwords
userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return await bcrypt.compare(plainTextPassword, hashedPassword)
}

export const User = model<TUser, UserModel>('User', userSchema)
