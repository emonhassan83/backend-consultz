import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezonePlugin from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TBookingBufferRule, TBookingRules } from '../user/user.interface'

dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezonePlugin)

const DEFAULT_BUFFER_RULES: TBookingBufferRule[] = [
  { duration: 15, buffer: 5 },
  { duration: 30, buffer: 10 },
  { duration: 60, buffer: 20 },
]

const BUFFER_RULE_DURATIONS = [15, 30, 60]

export const buildBufferRulesFromSlotBufferStep = (
  slotBufferStep: number,
): TBookingBufferRule[] =>
  BUFFER_RULE_DURATIONS.map((duration) => ({
    duration,
    buffer: slotBufferStep * (duration / 15),
  }))

export const getDefaultBookingRules = (): TBookingRules => ({
  minNotice: 2,
  bookingHorizonDays: 60,
  slotBufferStep: 5,
  bufferRules: DEFAULT_BUFFER_RULES.map((rule) => ({ ...rule })),
})

export const resolveBookingRules = (expert?: {
  bookingRules?: Partial<TBookingRules> | null
}): TBookingRules => {
  const defaults = getDefaultBookingRules()
  const rules = expert?.bookingRules

  if (!rules) {
    return defaults
  }

  return {
    minNotice:
      typeof rules.minNotice === 'number'
        ? rules.minNotice
        : defaults.minNotice,
    bookingHorizonDays:
      typeof rules.bookingHorizonDays === 'number'
        ? rules.bookingHorizonDays
        : defaults.bookingHorizonDays,
    slotBufferStep:
      typeof rules.slotBufferStep === 'number' && rules.slotBufferStep >= 0
        ? rules.slotBufferStep
        : defaults.slotBufferStep,
    bufferRules: buildBufferRulesFromSlotBufferStep(
      typeof rules.slotBufferStep === 'number' && rules.slotBufferStep >= 0
        ? rules.slotBufferStep
        : defaults.slotBufferStep,
    ),
  }
}

export const getBufferForDuration = (
  rules: TBookingRules,
  duration: number,
): number => {
  const bufferRule = rules.bufferRules.find((rule) => rule.duration === duration)

  if (!bufferRule) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `No buffer rule configured for ${duration} minute session duration`,
    )
  }

  return bufferRule.buffer
}

export const parseLocalDateTimeToUtc = (
  date: string,
  time: string,
  timezone: string,
): Date => {
  const localDateTime = dayjs.tz(
    `${date} ${time}`,
    'YYYY-MM-DD HH:mm',
    timezone,
  )

  if (!localDateTime.isValid()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid booking date, time, or timezone',
    )
  }

  return localDateTime.utc().toDate()
}

export const isWithinBookingHorizon = (
  startAt: Date,
  rules: TBookingRules,
  now: Date = new Date(),
): boolean => {
  const horizonEnd = dayjs(now).add(rules.bookingHorizonDays, 'day')
  return dayjs(startAt).isBefore(horizonEnd) || dayjs(startAt).isSame(horizonEnd)
}

export const isMinNoticeSatisfied = (
  startAt: Date,
  rules: TBookingRules,
  now: Date = new Date(),
): boolean => {
  return dayjs(startAt).diff(dayjs(now), 'hour', true) >= rules.minNotice
}

type TBuildBookingIntervalInput = {
  date: string
  startTime: string
  duration: number
  timezone: string
  rules: TBookingRules
}

export const buildBookingInterval = ({
  date,
  startTime,
  duration,
  timezone,
  rules,
}: TBuildBookingIntervalInput) => {
  const localStart = dayjs.tz(
    `${date} ${startTime}`,
    'YYYY-MM-DD HH:mm',
    timezone,
  )

  if (!localStart.isValid()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid booking date, start time, or timezone',
    )
  }

  const bufferTime = getBufferForDuration(rules, duration)
  const localEnd = localStart.add(duration, 'minute')
  const localBufferEnd = localEnd.add(bufferTime, 'minute')

  return {
    date,
    startAt: localStart.utc().toDate(),
    endAt: localEnd.utc().toDate(),
    bufferEndAt: localBufferEnd.utc().toDate(),
    startTime: localStart.utc().format('HH:mm'),
    endTime: localEnd.utc().format('HH:mm'),
    bufferTime,
    localDate: localStart.format('YYYY-MM-DD'),
    localStartTime: localStart.format('HH:mm'),
    localEndTime: localEnd.format('HH:mm'),
    timezone,
  }
}
