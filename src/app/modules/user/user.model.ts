import bcrypt from 'bcrypt'
import config from '../../config'
import { Schema, model } from 'mongoose'
import { TUser, UserModel } from './user.interface'
import {
  DAY_MAP,
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
      required: false, // remove required
      default: 0,
    },
    isOffered: { type: Boolean, default: false },
  },
  { _id: false },
)

// 🏦 Bank Account
const BankAccountSchema = new Schema(
  {
    bankName: { type: String, default: '' },
    number: { type: Number, default: null },
    sortCode: { type: String, default: '' },
  },
  { _id: false },
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

    // availability field
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
            _id: false, // ← disables _id for every slot
          },
          _id: false, // ← disables _id for every day object
        },
      ],
      default: [],
    },
    socialProfiles: { type: [SocialProfileSchema], default: [] },
    sessionDurations: { type: [SessionDurationSchema], default: [] },

    bankDetails: { type: BankAccountSchema, default: {} },
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
      bookingAndSchedule: {
        type: Boolean,
        default: true,
      },
      scheduleRemainder: {
        type: Boolean,
        default: true,
      },
      payment: {
        type: Boolean,
        default: true,
      },
      points: {
        type: Boolean,
        default: true,
      },
      followers: {
        type: Boolean,
        default: true,
      },
      post: {
        type: Boolean,
        default: true,
      },
      reviews: {
        type: Boolean,
        default: true,
      },
    },
    emailNotify: {
      booking: {
        type: Boolean,
        default: true,
      },
      schedule: {
        type: Boolean,
        default: true,
      },
      payment: {
        type: Boolean,
        default: true,
      },
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    isTopExpert: {
      type: Boolean,
      default: false,
    },
    isProfileSetup: {
      type: Boolean,
      default: false,
    },
    profileCompletionBonusClaimed: {
      type: Boolean,
      default: false,
    },
    socialProofBonusClaimed: {
      type: Boolean,
      default: false,
    },
    isPhoneOtpVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
)

// TTL index for expireAt
userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })
userSchema.index({ referralCode: 1 })

//* Hash password before saving
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    )
  }
  next()
})

// ====================== AVAILABILITY CHANGE DETECTION ======================

userSchema.pre('save', async function (next) {
  if (this.isModified('availability')) {
    const oldUser = await this.model('User')
      .findById(this._id)
      .select('availability')
      .lean() as TUser | null;

    const oldAvailability = oldUser?.availability || [];
    const newAvailability = this.get('availability') || [];

    const hasChanged = JSON.stringify(oldAvailability) !== JSON.stringify(newAvailability);

    if (hasChanged) {
      (this as any).regenerateSlotsAfterSave = true;
    }
  }
  next();
});

userSchema.post('save', async function (doc: any) {
  if (doc.regenerateSlotsAfterSave === true) {
    const expertId = doc._id.toString();

    // Non-blocking regeneration
    setImmediate(async () => {
      try {
        await regenerateSlotsForExpert(expertId);
        console.log(`[Slot Regeneration] Completed for expert: ${expertId}`);
      } catch (err) {
        console.error(`[Slot Regeneration] Failed for expert ${expertId}:`, err);
      }
    });

    // Clean flag
    doc.regenerateSlotsAfterSave = false;
  }
});

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
