import express from 'express';
import {
  createSupportTicket,
  getMySupportTickets,
  getSupportTicketById,
  getSupportConfig,
} from '../controllers/support.controller.js';
import { protectUserOrDriver } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/config', getSupportConfig);
router.post('/', protectUserOrDriver, createSupportTicket);
router.get('/my-tickets', protectUserOrDriver, getMySupportTickets);
router.get('/:id', protectUserOrDriver, getSupportTicketById);

export default router;
