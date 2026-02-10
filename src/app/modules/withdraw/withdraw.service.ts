import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { Withdraw } from './withdraw.model'
import { TWithdrawStatus } from './withdraw.constant'

const getAllWithdrawsFromDB = async (query: Record<string, unknown>) => {
  const WithdrawQuery = new QueryBuilder(
    Withdraw.find().populate([
      { path: 'user', select: 'firstName lastName email photoUrl' },
    ]),
    query,
  )
    .search([])
    .filter()
    .sort()
    .paginate()
    .fields()

  const result = await WithdrawQuery.modelQuery
  const meta = await WithdrawQuery.countTotal()

  return {
    meta,
    result,
  }
}

const getAWithdrawFromDB = async (id: string) => {
  const result = await Withdraw.findById(id).populate([
    { path: 'user', select: 'firstName lastName email photoUrl' },
    {
      path: 'booking',
      populate: [
      {
        path: 'user',
        select: 'firstName lastName email photoUrl',
      },
      {
        path: 'slot',
        select: 'date time',
      },
    ],
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found')
  }

  return result
}

const updateWithdrawFromDB = async (
  id: string,
  payload: { status: TWithdrawStatus },
) => {
  const { status } = payload

  const withdraw = await Withdraw.findById(id)
  if (!withdraw) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found')
  }

  const result = await Withdraw.findByIdAndUpdate(
    id,
    { status },
    {
      new: true,
    },
  )
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdraw status not updated')
  }

  return result
}

export const WithdrawService = {
  getAllWithdrawsFromDB,
  getAWithdrawFromDB,
  updateWithdrawFromDB,
}
