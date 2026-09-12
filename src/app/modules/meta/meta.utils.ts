import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import { User } from '../user/user.model'
import { PAYMENT_STATUS } from '../payment/payment.constant'
import { Payment } from '../payment/payment.model'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const MS_IN_DAY = 24 * 60 * 60 * 1000

type TDashboardFilterType =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_quarter'
  | 'monthly'
  | 'weekly'
  | 'custom'

type TPaymentBucket = {
  label: string
  key: string
  grossBookingValue: number
  platformCommission: number
  platformVat: number
  platformTotalDeduction: number
  expertPayout: number
  refundedAmount: number
  netRevenueAfterRefund: number
}

const round2 = (value: number) => Number((value || 0).toFixed(2))

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const getDateLabel = (dateKey: string) => dayjs(dateKey).format('MMM DD')

const getMonthLabel = (monthKey: string) => {
  const monthIndex = parseInt(monthKey.slice(5, 7), 10) - 1
  return MONTHS[monthIndex] || monthKey
}

const buildDayBuckets = (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  const buckets: { key: string; label: string }[] = []
  let cursor = start.startOf('day')
  const last = end.startOf('day')

  while (cursor.isSame(last) || cursor.isBefore(last)) {
    const key = cursor.format('YYYY-MM-DD')
    buckets.push({ key, label: getDateLabel(key) })
    cursor = cursor.add(1, 'day')
  }

  return buckets
}

const buildMonthBuckets = (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  const buckets: { key: string; label: string }[] = []
  let cursor = start.startOf('month')
  const last = end.startOf('month')

  while (cursor.isSame(last) || cursor.isBefore(last)) {
    const key = cursor.format('YYYY-MM')
    buckets.push({ key, label: getMonthLabel(key) })
    cursor = cursor.add(1, 'month')
  }

  return buckets
}

const resolveDashboardDateFilter = (query: Record<string, unknown>) => {
  const filterType = query.filterType as TDashboardFilterType | undefined
  const timezoneName = (query.timezone as string) || 'UTC'
  const now = dayjs().tz(timezoneName)
  const selectedYear = parsePositiveInt(
    query.year || query.revenue_year || query.earning_year,
    now.year(),
  )

  let start = dayjs.tz(`${selectedYear}-01-01`, 'YYYY-MM-DD', timezoneName)
  let end = start.endOf('year')
  let bucketType: 'day' | 'month' = 'month'

  switch (filterType) {
    case 'last_7_days':
      start = now.subtract(6, 'day').startOf('day')
      end = now.endOf('day')
      bucketType = 'day'
      break

    case 'last_30_days':
      start = now.subtract(29, 'day').startOf('day')
      end = now.endOf('day')
      bucketType = 'day'
      break

    case 'this_quarter': {
      const quarterStartMonth = Math.floor(now.month() / 3) * 3
      start = now.month(quarterStartMonth).startOf('month')
      end = start.add(2, 'month').endOf('month')
      bucketType = 'month'
      break
    }

    case 'monthly': {
      const month = Math.min(
        Math.max(parsePositiveInt(query.month, now.month() + 1), 1),
        12,
      )
      start = dayjs.tz(
        `${selectedYear}-${String(month).padStart(2, '0')}-01`,
        'YYYY-MM-DD',
        timezoneName,
      )
      end = start.endOf('month')
      bucketType = 'day'
      break
    }

    case 'weekly': {
      const weekStart = query.weekStart
        ? dayjs.tz(String(query.weekStart), 'YYYY-MM-DD', timezoneName)
        : now.startOf('week')
      start = weekStart.startOf('day')
      end = start.add(6, 'day').endOf('day')
      bucketType = 'day'
      break
    }

    case 'custom': {
      const customStart = query.startDate
        ? dayjs.tz(String(query.startDate), 'YYYY-MM-DD', timezoneName)
        : start
      const customEnd = query.endDate
        ? dayjs.tz(String(query.endDate), 'YYYY-MM-DD', timezoneName)
        : end
      start = customStart.startOf('day')
      end = customEnd.endOf('day')
      const days = Math.floor((end.valueOf() - start.valueOf()) / MS_IN_DAY) + 1
      bucketType = days <= 31 ? 'day' : 'month'
      break
    }

    default:
      break
  }

  if (end.isBefore(start)) {
    end = start.endOf(bucketType)
  }

  const buckets =
    bucketType === 'day'
      ? buildDayBuckets(start, end)
      : buildMonthBuckets(start, end)

  return {
    startDate: start.toDate(),
    endDate: end.toDate(),
    bucketType,
    timezoneName,
    buckets,
  }
}

export const getDashboardPaymentOverview = async (
  query: Record<string, unknown>,
) => {
  const filter = resolveDashboardDateFilter(query)
  const dateFormat = filter.bucketType === 'day' ? '%Y-%m-%d' : '%Y-%m'

  const rawBuckets = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: filter.startDate, $lte: filter.endDate },
        status: { $in: [PAYMENT_STATUS.paid, PAYMENT_STATUS.refunded] },
        isDeleted: false,
      },
    },
    {
      $lookup: {
        from: 'refunds',
        let: { paymentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$payment', '$$paymentId'] },
                  { $eq: ['$status', 'succeeded'] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: '$amount' },
            },
          },
        ],
        as: 'refundSummary',
      },
    },
    {
      $addFields: {
        grossForCalc: { $ifNull: ['$grossBookingValue', '$amount'] },
        refundedAmount: {
          $ifNull: [{ $arrayElemAt: ['$refundSummary.amount', 0] }, 0],
        },
      },
    },
    {
      $addFields: {
        retainedAmount: {
          $max: [0, { $subtract: ['$grossForCalc', '$refundedAmount'] }],
        },
      },
    },
    {
      $addFields: {
        retainedRatio: {
          $cond: [
            { $gt: ['$grossForCalc', 0] },
            { $divide: ['$retainedAmount', '$grossForCalc'] },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: dateFormat,
            date: '$createdAt',
            timezone: filter.timezoneName,
          },
        },
        grossBookingValue: {
          $sum: '$grossForCalc',
        },
        refundedAmount: { $sum: '$refundedAmount' },
        platformCommission: {
          $sum: { $multiply: ['$platformCommission', '$retainedRatio'] },
        },
        platformVat: {
          $sum: { $multiply: ['$platformVat', '$retainedRatio'] },
        },
        platformTotalDeduction: {
          $sum: {
            $multiply: [
              { $ifNull: ['$platformTotalDeduction', '$platformTotal'] },
              '$retainedRatio',
            ],
          },
        },
        expertPayout: {
          $sum: {
            $multiply: [
              { $ifNull: ['$expertPayout', '$consultAmount'] },
              '$retainedRatio',
            ],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const bucketMap = new Map<string, TPaymentBucket>(
    rawBuckets.map((bucket: any) => [
      bucket._id,
      {
        key: bucket._id,
        label:
          filter.bucketType === 'day'
            ? getDateLabel(bucket._id)
            : getMonthLabel(bucket._id),
        grossBookingValue: bucket.grossBookingValue || 0,
        platformCommission: bucket.platformCommission || 0,
        platformVat: bucket.platformVat || 0,
        platformTotalDeduction: bucket.platformTotalDeduction || 0,
        expertPayout: bucket.expertPayout || 0,
        refundedAmount: bucket.refundedAmount || 0,
        netRevenueAfterRefund:
          (bucket.grossBookingValue || 0) - (bucket.refundedAmount || 0),
      },
    ]),
  )

  const buckets = filter.buckets.map((bucket) => {
    const data = bucketMap.get(bucket.key)

    return {
      key: bucket.key,
      label: bucket.label,
      grossBookingValue: round2(data?.grossBookingValue || 0),
      platformCommission: round2(data?.platformCommission || 0),
      platformVat: round2(data?.platformVat || 0),
      platformTotalDeduction: round2(data?.platformTotalDeduction || 0),
      expertPayout: round2(data?.expertPayout || 0),
      refundedAmount: round2(data?.refundedAmount || 0),
      netRevenueAfterRefund: round2(data?.netRevenueAfterRefund || 0),
    }
  })

  const totals = buckets.reduce(
    (acc, bucket) => {
      acc.grossBookingValue += bucket.grossBookingValue
      acc.platformCommission += bucket.platformCommission
      acc.platformVat += bucket.platformVat
      acc.platformTotalDeduction += bucket.platformTotalDeduction
      acc.expertPayout += bucket.expertPayout
      acc.refundedAmount += bucket.refundedAmount
      acc.netRevenueAfterRefund += bucket.netRevenueAfterRefund
      return acc
    },
    {
      grossBookingValue: 0,
      platformCommission: 0,
      platformVat: 0,
      platformTotalDeduction: 0,
      expertPayout: 0,
      refundedAmount: 0,
      netRevenueAfterRefund: 0,
    },
  )

  return {
    totalEarnings: round2(totals.netRevenueAfterRefund),
    grossBookingValue: round2(totals.grossBookingValue),
    refundedAmount: round2(totals.refundedAmount),
    netRevenueAfterRefund: round2(totals.netRevenueAfterRefund),
    totalCommission: round2(totals.platformCommission),
    platformCommission: round2(totals.platformCommission),
    platformVat: round2(totals.platformVat),
    platformTotalDeduction: round2(totals.platformTotalDeduction),
    expertPayout: round2(totals.expertPayout),
    revenueVsCommission: buckets.map((bucket) => ({
      month: bucket.label,
      revenue: bucket.grossBookingValue,
      commission: bucket.platformCommission,
      refunded: bucket.refundedAmount,
      netRevenue: bucket.netRevenueAfterRefund,
    })),
    earningOverview: buckets.map((bucket) => ({
      month: bucket.label,
      total: bucket.netRevenueAfterRefund,
    })),
  }
}

export const getRevenueVsCommission = async (year: number) => {
  const overview = await getDashboardPaymentOverview({ year })

  return {
    totalCommission: overview.totalCommission,
    monthlyData: overview.revenueVsCommission,
  }
}

export const getEarningOverview = async (year: number) => {
  const overview = await getDashboardPaymentOverview({ year })

  return {
    totalEarnings: overview.totalEarnings,
    grossBookingValue: overview.grossBookingValue,
    refundedAmount: overview.refundedAmount,
    netRevenueAfterRefund: overview.netRevenueAfterRefund,
    consultAmount: overview.expertPayout,
    expertPayout: overview.expertPayout,
    platformCommission: overview.platformCommission,
    platformVat: overview.platformVat,
    platformTotalDeduction: overview.platformTotalDeduction,
    monthlyData: overview.earningOverview,
  }
}

export const getUserOverview = async (year: number, role?: string | null) => {
  const yearStart = dayjs.utc(`${year}-01-01`, 'YYYY-MM-DD').toDate()
  const yearEnd = dayjs.utc(`${year}-12-31`, 'YYYY-MM-DD').endOf('day').toDate()

  const matchConditions: any = {
    createdAt: { $gte: yearStart, $lte: yearEnd },
    status: USER_STATUS.active,
    isDeleted: false,
    role: { $nin: [USER_ROLE.admin] },
  }

  if (role) {
    matchConditions.role = role
  }

  const monthlyUsers = await User.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  return MONTHS.map((month, index) => {
    const data = monthlyUsers.find((m: any) => m._id === index + 1)
    return {
      month,
      count: data ? data.count : 0,
    }
  })
}
