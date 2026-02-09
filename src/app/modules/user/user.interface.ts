import { Model, Types } from 'mongoose'
import { TDaysMap, TUserRole, TUserStatus } from './user.constant'

type TAvailability = {
  day: TDaysMap
  from: string
  to: string
}

type TSocialProfile = {
  type: string
  url: string
}

type TSessionDuration = {
  type: string
  duration: number
  isOffered: boolean
}

type TBankAccount = {
  bankName: string
  number: number
  sortCode: string
}

export interface TUser {
  _id: Types.ObjectId
  id: string
  firstName: string
  lastName: string
  email: string
  dob: string
  headline: string
  bio: string
  password: string
  fcmToken: string
  photoUrl?: string
  coverPhoto?: string
  phoneNumber?: string
  timeZone: string
  priceRange: string
  interests: string[]
  learningStyles: string[]
  expertise: string
  languages: string[]
  skills: string[]
  education: {
    degree: string
    certificate: string[]
    phd: string
  }
  bankDetails: TBankAccount
  socialProfiles: TSocialProfile[]
  hourlyRate: number
  availability: TAvailability[]
  sessionDurations: TSessionDuration[]
  advisingStyles: string[]
  role: TUserRole
  registerWith: string
  needsPasswordChange: boolean
  passwordChangedAt?: Date
  verification: {
    otp: string | number
    expiresAt: Date
    status: boolean
  }
  pushNotify: {
    booking: boolean
    schedule: boolean
    payment: boolean
    points: boolean
    followers: boolean
    post: boolean
    reviews: boolean
  }
  emailNotify: {
    booking: boolean
    schedule: boolean
    payment: boolean
  }
  following: number
  followers: number
  points: number
  advisingTime: number
  level: number
  avgRating: number
  ratingCount: number
  referralCode: string,
  referredBy: Types.ObjectId
  balance: number
  status: TUserStatus
  expireAt: Date
  isProfileSetup: boolean
  isDeleted: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface TReqUser {
  _id: string
  email: string
  role: TUserRole
  iat: number
  exp: number
}

export interface UserModel extends Model<TUser> {
  isUserExistsByUserName(name: string): Promise<TUser>
  isUserExistsByEmail(email: string): Promise<TUser>

  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>
}
