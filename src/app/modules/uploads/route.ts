import { Router } from 'express';
import multer, { memoryStorage } from 'multer';
import uploadController from './upload.controller';

const router = Router();
const storage = memoryStorage();
const upload = multer({ storage });

router.post(
  '/multiple',
  upload.fields([
    { name: 'files', maxCount: 100 },
  ]),
  uploadController.multiple,
);

router.post('/single', upload.single('file'), uploadController.single);

export const uploadRouter = router;
