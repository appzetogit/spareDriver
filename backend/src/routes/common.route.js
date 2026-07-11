import express from 'express';
import { uploadImage, uploadVideo } from '../controllers/common.controller.js';
import { getCarTypes, getConditions, getTrainingVideos } from '../controllers/platform.controller.js';
import {
  getFuelTypes,
  getCarBrands,
  getCarModels,
  getVehicleCatalog,
} from '../controllers/vehicleCatalog.controller.js';
import { listActiveZones, checkZoneForPoint } from '../controllers/zone.controller.js';
import { listActiveAds } from '../controllers/ad.controller.js';
import { getSupportConfig } from '../controllers/support.controller.js';
import { getPublicLegalDocument } from '../controllers/legalDocument.controller.js';
import { upload, uploadVideo as uploadVideoMiddleware } from '../middlewares/multer.js';

const router = express.Router();

router.post('/upload', upload.single('image'), uploadImage);
router.post('/upload/video', uploadVideoMiddleware.single('video'), uploadVideo);

// Publicly available config
router.get('/vehicle-catalog', getVehicleCatalog);
router.get('/car-types', getCarTypes);
router.get('/fuel-types', getFuelTypes);
router.get('/car-brands', getCarBrands);
router.get('/car-models', getCarModels);
router.get('/conditions', getConditions);
router.get('/training-videos', getTrainingVideos);
router.get('/zones', listActiveZones);
router.get('/zones/check', checkZoneForPoint);

// Promotional ads shown on the user home (active only, sort-ordered).
router.get('/ads', listActiveAds);
router.get('/support-config', getSupportConfig);
router.get('/legal/:type', getPublicLegalDocument);

export default router;
