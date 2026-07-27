import { Model, Types } from 'mongoose'
import { TAudience, TSupportStatus } from './support.constant'

export type TSupport = {
  _id?: string
  referenceId?: string
  author: Types.ObjectId | string
  audience: TAudience
  email: string
  subject: string
  messages: string
  status: TSupportStatus
}

export interface TFeedback {
  referenceId?: string
  subject: string
  feedbackType: string
  priority: string
  relatedPageOrFeature?: string
  description: string
  expectedOutcome?: string
  businessImpact?: string[]
  additionalComments?: string
  submissionDate?: string
}

export type TSupportMessage = {
  _id?: string
  subject: string
  messages: string
}

export type TSupportModel = Model<TSupport, Record<string, unknown>>
