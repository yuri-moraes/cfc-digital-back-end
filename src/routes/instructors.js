import express from 'express';
import { InstructorVehicle } from '../models/InstructorVehicle.js';
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

export default router;
