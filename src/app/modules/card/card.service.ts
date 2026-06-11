import QueryBuilder from '../../builder/QueryBuilder'
import { ICard } from './card.interface'
import { User } from '../user/user.model'
import AppError from '../../errors/AppError'
import httpStatus from 'http-status'
import { Card } from './card.models'
import mongoose from 'mongoose'
import { getCardStatus } from './card.utils'

const createCard = async (payload: ICard, userId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. user wise validation
    const author = await User.findById(userId).session(session)
    if (!author || author.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found or deleted!')
    }

    // 2. card validation prevent
    const existingCard = await Card.findOne({
      author: userId,
      cardNumber: payload.cardNumber,
      isDeleted: false,
    }).session(session)
    if (existingCard) {
      throw new AppError(
        httpStatus.CONFLICT,
        'This card is already saved. Please use a different card.',
      )
    }

    // 3. Expire date format (MM/YY format)
    const [monthStr, yearStr] = payload.expiryDate.split('/')
    const month = parseInt(monthStr, 10)
    const year = parseInt(yearStr, 10)

    if (!monthStr || !yearStr || isNaN(month) || isNaN(year)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid expiry date format. Use MM/YY',
      )
    }
    if (month < 1 || month > 12) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid month in expiry date')
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const minYear = currentYear
    const maxYear = currentYear + 30

    if (year < minYear - 2000 || year > maxYear - 2000) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Expiry year must be between ${minYear} and ${maxYear}`,
      )
    }

    // Check full expiry
    const expiryDate = new Date(2000 + year, month, 0)
    expiryDate.setHours(23, 59, 59, 999)
    if (expiryDate < now) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This card has already expired',
      )
    }

    // If save default then update previous one
    if (payload.setAsDefault) {
      await Card.updateMany(
        { author: userId, setAsDefault: true },
        { setAsDefault: false },
        { session },
      )
    }

    //created
    payload.author = new mongoose.Types.ObjectId(userId)
    const [newCard] = await Card.create([payload], { session })

    if (!newCard) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to save card. Please try again',
      )
    }

    await session.commitTransaction()
    return newCard
  } catch (error: any) {
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'Card creation failed',
        )
  } finally {
    session.endSession()
  }
}

const getAllCard = async (query: Record<string, any>) => {
  const CardModel = new QueryBuilder(Card.find({ isDeleted: false }), query)
    .search([''])
    .filter()
    .paginate()
    .sort()

  const cards: any = await CardModel.modelQuery
  const meta = await CardModel.countTotal()

  const data = cards.map((card: any) => {
    const cardObj = card.toObject()
    return {
      ...cardObj,
      status: getCardStatus(cardObj.expiryDate),
    }
  })

  return { data, meta }
}

const getDefaultCard = async (userId: string) => {
  const card = await Card.findOne({
    author: userId,
    setAsDefault: true,
    isDeleted: false,
  })
  if (!card) return null

  return {
    ...card.toObject(),
    status: getCardStatus(card.expiryDate),
  }
}

const setAsDefault = async (cardId: string, userId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the card and verify ownership
    const card = await Card.findOne({
      _id: cardId,
      author: userId,
      isDeleted: false,
    }).session(session)

    if (!card) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Card not found or does not belong to you',
      )
    }

    // 2. If it's already default → no need to do anything
    if (card.setAsDefault) {
      await session.commitTransaction()
      return card
    }

    // 3. Unset all other default cards of this user
    await Card.updateMany(
      {
        author: userId,
        _id: { $ne: cardId }, // exclude the current card
        setAsDefault: true,
      },
      { setAsDefault: false },
      { session },
    )

    // 4. Set current card as default
    const updatedCard = await Card.findByIdAndUpdate(
      cardId,
      { setAsDefault: true },
      { returnDocument: 'after', session },
    )

    if (!updatedCard) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to update card',
      )
    }

    await session.commitTransaction()
    return updatedCard
  } catch (error: any) {
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'Operation failed',
        )
  } finally {
    session.endSession()
  }
}

const deleteCard = async (id: string) => {
  const card = await Card.findById(id)
  if (!card || card?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Card not found!')
  }

  const result = await Card.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { returnDocument: 'after' },
  )
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Card history deleted failed !')
  }

  return result
}

export const CardService = {
  createCard,
  getAllCard,
  getDefaultCard,
  setAsDefault,
  deleteCard,
}
