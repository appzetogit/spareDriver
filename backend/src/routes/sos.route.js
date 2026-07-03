import express from 'express';
import {
  createSos,
  updateSosLocation,
  resolveSos,
  getActiveSosForTrip,
} from '../controllers/sos.controller.js';
import { protectUserOrDriver, protectStaff, restrictTo } from '../middlewares/authMiddleware.js';
import { ROUTE_ROLES } from '../constants/staffPermissions.js';
import {
  sosCreateRateLimiter,
  sosLocationRateLimiter,
} from '../middlewares/rateLimit.js';

const { ALL_STAFF } = ROUTE_ROLES;
const router = express.Router();

router.post('/', protectUserOrDriver, sosCreateRateLimiter, createSos);
router.post('/location', protectUserOrDriver, sosLocationRateLimiter, updateSosLocation);
router.get('/trip/:tripId/active', protectUserOrDriver, getActiveSosForTrip);
router.patch('/:id/resolve', protectStaff, restrictTo(...ALL_STAFF), resolveSos);

export default router;
