import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import uploadService from './upload.service';

const multiple = catchAsync(async (req, res) => {
  const result = await uploadService.multiple(req.files as any[]);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'multiple uploaded successfully',
    data: result,
  });
});

const single = catchAsync(async (req, res) => {
  const result = await uploadService.single(req.file);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'single uploaded successfully',
    data: result,
  });
});

const uploadController = {
  multiple,
  single,
};

export default uploadController;
