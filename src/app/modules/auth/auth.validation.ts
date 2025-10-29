import { z } from 'zod'

const loginValidationSchema = z.object({
  body: z.object({
    email: z.string(),
    password: z
      .string({
        invalid_type_error: 'Password must be a string',
      })
      .min(6, { message: 'Password must be at least 6 characters' })
      .max(12, { message: 'Password cannot be more than 12 characters' }),
      fcmToken: z.string().optional(),
  }),
})

const changePasswordValidationSchema = z.object({
  body: z.object({
    oldPassword: z
      .string({
        required_error: 'Old password is required',
      })
      .min(6, { message: 'Password must be at least 6 characters' })
      .max(12, { message: 'Password cannot be more than 12 characters' }),
    newPassword: z
      .string({ required_error: 'Password is required' })
      .min(6, { message: 'Password must be at least 6 characters' })
      .max(12, { message: 'Password cannot be more than 12 characters' }),
  }),
})

const googleZodValidationSchema = z.object({
  body: z.object({
    token: z.string({
      required_error: 'token is required!',
    }),
  }),
})

const appleZodValidationSchema = z.object({
  body: z.object({
    token: z.string({
      required_error: 'token is required!',
    }),
  }),
})

const refreshTokenValidationSchema = z.object({
  cookies: z.object({
    refreshToken: z.string({
      required_error: 'Refresh token is required!',
    }),
  }),
})

const forgetPasswordValidationSchema = z.object({
  body: z.object({
    email: z.string({
      required_error: 'User email is required!',
    }),
  }),
})

const resetPasswordValidationSchema = z.object({
  body: z.object({
    email: z.string({
      required_error: 'User email is required!',
    }),
    newPassword: z
      .string({
        required_error: 'User new password is required!',
      })
      .min(6, { message: 'Password must be at least 6 characters' })
      .max(12, { message: 'Password cannot be more than 12 characters' }),
    confirmPassword: z
      .string({
        required_error: 'User confirm password is required!',
      })
      .min(6, { message: 'Password must be at least 6 characters' })
      .max(12, { message: 'Password cannot be more than 12 characters' }),
  }),
})

export const AuthValidation = {
  loginValidationSchema,
  changePasswordValidationSchema,
  refreshTokenValidationSchema,
  forgetPasswordValidationSchema,
  resetPasswordValidationSchema,
  googleZodValidationSchema,
  appleZodValidationSchema,
}
