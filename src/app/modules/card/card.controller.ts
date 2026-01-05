import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { CardService } from './card.service';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';

const createCard = catchAsync(async (req: Request, res: Response) => {
  const result = await CardService.createCard(req.body, req.user._id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Card added successfully',
    data: result,
  });
});

const getAllCard = catchAsync(async (req: Request, res: Response) => {
  req.query['author'] = req.user._id;
  const result = await CardService.getAllCard(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Card histories fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getCardById = catchAsync(async (req: Request, res: Response) => {
  const result = await CardService.getCardById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Card history fetched successfully',
    data: result,
  });
});

const updateCard = catchAsync(async (req: Request, res: Response) => {
  const result = await CardService.updateCard(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Card history updated successfully',
    data: result,
  });
});

const deleteCard = catchAsync(async (req: Request, res: Response) => {
  const result = await CardService.deleteCard(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Card history deleted successfully',
    data: result,
  });
});

export const CardController = {
  createCard,
  getAllCard,
  getCardById,
  updateCard,
  deleteCard,
};
