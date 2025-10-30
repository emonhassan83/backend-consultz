import { Model, Types } from 'mongoose'
import { TRegisterWith, TUserRole, TUserStatus } from './user.constant'

type IAvailability  = {
  day: string
  from: string
  to: string
}

export interface TUser {
  _id: Types.ObjectId
  id: string
  firstName: string
  lastName: string
  email: string
  dob: string
  bio: string
  password: string
  fcmToken: string
  photoUrl?: string
  coverPhoto?: string
  contractNumber?: string
  timeZone: string
  priceRange: string
  interests: string[]
  learningStyles: string[]
  expertise: string
  languages: string[]
  skills: string[]
  education: {
    degree: string
    certification: string[]
    phd: string
  }
  availability: IAvailability[]
  role: TUserRole
  registerWith: TRegisterWith
  needsPasswordChange: boolean
  passwordChangedAt?: Date
  verification: {
    otp: string | number
    expiresAt: Date
    status: boolean
  }
  points: number
  level: number
  avgRating: number
  ratingCount: number
  status: TUserStatus
  expireAt: Date
  isNotify: boolean
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
