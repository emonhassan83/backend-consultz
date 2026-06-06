import { NextFunction, Request, Response } from 'express'
import { ZodTypeAny } from 'zod'
import catchAsync from '../utils/catchAsync'

const zodValidationRequest = (schema: ZodTypeAny) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    // validation
    await schema.parseAsync({
      body: req.body,
    })
    next()
  })
}

export default zodValidationRequest
