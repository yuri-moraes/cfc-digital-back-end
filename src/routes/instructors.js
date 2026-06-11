import express from 'express';
import { InstructorVehicle } from '../models/InstructorVehicle.js';
import { InstructorAvailability } from '../models/InstructorAvailability.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { USER_ROLES } from '../constants.js';

const router = express.Router({ mergeParams: true });
const { ADMIN, INSTRUCTOR } = USER_ROLES;

router.get('/:id/vehicles', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { id } = req.params;
  if (req.user.role === INSTRUCTOR && req.user.userId !== id) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  const vehicles = await InstructorVehicle.listByInstructor(id);
  res.json(vehicles);
});

router.post('/:id/vehicles', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const link = await InstructorVehicle.link(req.params.id, req.body.vehicle_id);
  res.status(201).json(link);
});

router.delete('/:id/vehicles/:vid', authMiddleware, requireRole(ADMIN), async (req, res) => {
  await InstructorVehicle.unlink(req.params.id, req.params.vid);
  res.json({ message: 'Vehicle unlinked' });
});

router.get('/:id/availability', authMiddleware, requireRole(ADMIN, INSTRUCTOR), async (req, res) => {
  const { id } = req.params;
  if (req.user.role === INSTRUCTOR && req.user.userId !== id) {
    return res.status(403).json({ error: 'Forbidden', statusCode: 403 });
  }
  const windows = await InstructorAvailability.listByInstructor(id);
  res.json(windows);
});

router.post('/:id/availability', authMiddleware, requireRole(ADMIN), async (req, res) => {
  const { vehicle_id, day_of_week, start_time, end_time } = req.body;
  const window = await InstructorAvailability.create(
    req.params.id, vehicle_id, Number(day_of_week), start_time, end_time
  );
  res.status(201).json(window);
});

router.delete('/:id/availability/:aid', authMiddleware, requireRole(ADMIN), async (req, res) => {
  await InstructorAvailability.delete(req.params.aid, req.params.id);
  res.json({ message: 'Availability window removed' });
});

export default router;
