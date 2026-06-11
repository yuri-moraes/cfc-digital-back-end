import express from 'express';
import { Vehicle } from '../models/Vehicle.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';
import { paginate, paginatedResponse } from '../utils/paginate.js';

const router = express.Router();

router.get('/', authMiddleware, requireRole(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), async (req, res) => {
  const { page, limit, offset } = paginate(req);
  const { data, meta } = await Vehicle.list({ limit, offset });
  res.json(paginatedResponse(data, meta.total, { page, limit }));
});

router.post('/', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  const { plate, model, year } = req.body;
  const vehicle = await Vehicle.create(plate, model, Number(year));
  res.status(201).json(vehicle);
});

router.put('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  const { plate, model, year } = req.body;
  const vehicle = await Vehicle.update(req.params.id, {
    plate,
    model,
    year: year ? Number(year) : undefined,
  });
  res.json(vehicle);
});

router.delete('/:id', authMiddleware, requireRole(USER_ROLES.ADMIN), async (req, res) => {
  await Vehicle.delete(req.params.id);
  res.json({ message: 'Vehicle deleted' });
});

export default router;
