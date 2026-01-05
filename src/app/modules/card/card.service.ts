import QueryBuilder from '../../builder/QueryBuilder'
import { ICard } from './card.interface'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import { Card } from './card.models'
import mongoose from 'mongoose'

const createCard = async (payload: ICard, userId: string) => {
  // 1. Validate Author
  const author = await User.findById(userId)
  if (!author || author.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Author not found!')
  }

  // set author
  payload.author = new mongoose.Types.ObjectId(userId)

  // Create Card
  const card = await Card.create(payload)
  if (!card) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card creation failed!')
  }

  return card
}

const getAllCard = async (query: Record<string, any>) => {
  const CardModel = new QueryBuilder(
    Card.find({ isDeleted: false }).populate([
      { path: 'author', select: 'firstName lastName photoUrl email' },
    ]),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()

  const data: any = await CardModel?.modelQuery
  const meta = await CardModel?.countTotal()

  return { data, meta }
}

const getCardById = async (id: string) => {
  const result = await Card.findById(id).populate([
    { path: 'author', select: 'firstName lastName photoUrl email' },
  ])
  if (!result || result.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card history not found!')
  }

  return result
}

const updateCard = async (id: string, payload: Partial<ICard>) => {
  const card = await Card.findById(id)
  if (!card || card.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card not found!')
  }

  const updatedCard = await Card.findByIdAndUpdate(id, payload, {
    new: true,
  })
  if (!updatedCard) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card updated failed !')
  }

  return updatedCard
}

const deleteCard = async (id: string) => {
  const card = await Card.findById(id)
  if (!card || card.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card not found!')
  }

  const result = await Card.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  )
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card history deleted failed !')
  }

  return result
}

export const CardService = {
  createCard,
  getAllCard,
  getCardById,
  updateCard,
  deleteCard,
}
