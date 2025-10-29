import { TUserRole } from '../user/user.constant'

export interface TRegisterUser {
  name: string
  email: string
  password: string
  role: 'admin' | 'user'
}

export interface TLoginUser {
  email: string
  password: string
  latitude?: number
  longitude?: number
  fcmToken?: string
}

export interface TGoogleLoginPayload {
  name?: string
  email: string
  role?: TUserRole
  photoUrl?: string
  token?: string // Google auth token or ID token
  fcmToken?: string
  latitude?: number
  longitude?: number
}

export interface TAppleLoginPayload {
  name?: string
  email: string
  photoUrl?: string
  role?: TUserRole
  token?: string // Apple identity token
  fcmToken?: string
  latitude?: number
  longitude?: number
}
