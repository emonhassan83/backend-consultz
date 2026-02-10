import { z } from 'zod'
import { WITHDRAW_STATUS } from './withdraw.constant'

const updateValidationSchema = z.object({
  body: z.object({
    status: z.enum(Object.values(WITHDRAW_STATUS) as [string, ...string[]], {
      required_error: 'Withdraw status is required!',
    }),
  }),
})

export const WithdrawValidation = {
  updateValidationSchema,
}
