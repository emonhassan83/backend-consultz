import { z } from 'zod'

const createValidationSchema = z.object({
  body: z.object({
    aboutUs: z.string({ required_error: 'about us is required' }).optional(),
    termsAndConditions: z
      .string({ required_error: 'terms and conditions us is required' })
      .optional(),
    privacyPolicy: z
      .string({ required_error: 'privacy policy us is required' })
      .optional(),
    supports: z
      .string({ required_error: 'supports us is required' })
      .optional(),
    faq: z.string({ required_error: 'supports us is required' }).optional(),
  }),
})

const updateValidationSchema = z.object({
  body: z.object({
    aboutUs: z.string({ required_error: 'about us is required' }).optional(),
    termsAndConditions: z
      .string({ required_error: 'terms and conditions us is required' })
      .optional(),
    privacyPolicy: z
      .string({ required_error: 'privacy policy us is required' })
      .optional(),
    supports: z
      .string({ required_error: 'supports us is required' })
      .optional(),
    faq: z.string({ required_error: 'supports us is required' }).optional(),
    createBy: z.string({ required_error: 'createBy is required' }).optional(),
  }),
})

const increaseMaxMembersValidation = z.object({
  body: z.object({
    maxMembers: z.number({ required_error: 'maxMembers is required' }).optional(),
  }),
})

export const contentsValidation = {
  createValidationSchema,
  updateValidationSchema,
  increaseMaxMembersValidation
}
