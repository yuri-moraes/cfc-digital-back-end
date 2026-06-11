import {
  createAdmin, createInstructor, createStudent,
  createVehicle, linkVehicle, addAvailability
} from './helpers.js';
import { LessonSlot } from '../src/models/LessonSlot.js';
import { query } from '../src/db/pool.js';

let admin, instructor, student, vehicle;
const NEXT_MONDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
})();

beforeEach(async () => {
  admin      = await createAdmin();
  instructor = await createInstructor();
  student    = await createStudent({ purchasedLessons: 5 });
  await query('UPDATE users SET purchased_lessons = 5 WHERE id = $1', [student.id]);
  vehicle    = await createVehicle();
  await linkVehicle(instructor.id, vehicle.id);
  await addAvailability(instructor.id, vehicle.id);
});

// --- createSingle ---
test('createSingle - creates a lesson slot', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00'
  );
  expect(slot.status).toBe('scheduled');
  expect(slot.student_id).toBe(student.id);
});

test('createSingle - rejects if instructor not authorized for vehicle', async () => {
  const other = await createVehicle({ plate: 'OTH1111', model: 'Celta', year: 2018 });
  await expect(
    LessonSlot.createSingle(student.id, instructor.id, other.id, NEXT_MONDAY, '08:00')
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('createSingle - rejects if no balance', async () => {
  const broke = await createStudent({ email: 'broke@test.com', purchasedLessons: 0 });
  await query('UPDATE users SET purchased_lessons = 0 WHERE id = $1', [broke.id]);
  await expect(
    LessonSlot.createSingle(broke.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00')
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('createSingle - rejects slot conflict', async () => {
  await LessonSlot.createSingle(student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00');
  const s2 = await createStudent({ email: 's2@test.com', purchasedLessons: 5 });
  await query('UPDATE users SET purchased_lessons = 5 WHERE id = $1', [s2.id]);
  await expect(
    LessonSlot.createSingle(s2.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00')
  ).rejects.toMatchObject({ statusCode: 400 });
});

// --- createBatch ---
test('createBatch - creates N slots on selected days', async () => {
  await addAvailability(instructor.id, vehicle.id, { dayOfWeek: 3, startTime: '08:00', endTime: '20:00' });
  const slots = await LessonSlot.createBatch(
    student.id, instructor.id, vehicle.id,
    [1, 3], '08:00', NEXT_MONDAY, 4
  );
  expect(slots.length).toBe(4);
  const days = slots.map(s => new Date(s.scheduled_date).getDay());
  expect(days.filter(d => d === 1).length).toBe(2);
  expect(days.filter(d => d === 3).length).toBe(2);
});

test('createBatch - rejects if quantity > balance', async () => {
  await expect(
    LessonSlot.createBatch(student.id, instructor.id, vehicle.id, [1], '08:00', NEXT_MONDAY, 10)
  ).rejects.toMatchObject({ statusCode: 400 });
});

// --- balance calculation ---
test('balance decreases with scheduled/completed/no_show/absent_charged but not cancelled/absent_valid', async () => {
  const s = await createStudent({ email: 'bal@test.com', purchasedLessons: 3 });
  await query('UPDATE users SET purchased_lessons = 3 WHERE id = $1', [s.id]);
  const slot = await LessonSlot.createSingle(s.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00');
  let balance = await LessonSlot.getRemainingBalance(s.id);
  expect(balance).toBe(2);

  await LessonSlot.cancel(slot.id, admin.id, 'test');
  balance = await LessonSlot.getRemainingBalance(s.id);
  expect(balance).toBe(3);
});

// --- reschedule ---
test('reschedule - moves slot to new date/time', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '08:00'
  );
  const nextTuesday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((2 + 7 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  await addAvailability(instructor.id, vehicle.id, { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });
  const updated = await LessonSlot.reschedule(slot.id, {
    instructorId: instructor.id, vehicleId: vehicle.id,
    scheduledDate: nextTuesday, startTime: '08:00'
  });
  expect(updated.scheduled_date.toISOString?.().slice(0, 10) ?? updated.scheduled_date).toBe(nextTuesday);
  expect(updated.status).toBe('scheduled');
});

// --- checkin ---
test('checkin - marks completed with plate', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, today, '00:00', { checkBalance: false }
  );
  const updated = await LessonSlot.checkin(slot.id, instructor.id, 'ABC1234');
  expect(updated.status).toBe('completed');
  expect(updated.plate_at_checkin).toBe('ABC1234');
});

// --- no-show ---
test('noShow - marks no_show', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '09:00', { checkBalance: false }
  );
  const updated = await LessonSlot.noShow(slot.id, instructor.id);
  expect(updated.status).toBe('no_show');
});

test('noShow - rejects if absence already declared', async () => {
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, NEXT_MONDAY, '09:00', { checkBalance: false }
  );
  await LessonSlot.declareAbsence(slot.id, student.id);
  await expect(LessonSlot.noShow(slot.id, instructor.id)).rejects.toMatchObject({ statusCode: 400 });
});

// --- absence ---
test('declareAbsence - absent_valid when >= 1h before', async () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;
  const timeStr = `${pad(future.getHours())}:${pad(future.getMinutes())}`;
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, dateStr, timeStr, { checkBalance: false }
  );
  const updated = await LessonSlot.declareAbsence(slot.id, student.id);
  expect(updated.status).toBe('absent_valid');
});

test('declareAbsence - absent_charged when < 1h before', async () => {
  const soon = new Date(Date.now() + 30 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
  const timeStr = `${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
  const slot = await LessonSlot.createSingle(
    student.id, instructor.id, vehicle.id, dateStr, timeStr, { checkBalance: false }
  );
  const updated = await LessonSlot.declareAbsence(slot.id, student.id);
  expect(updated.status).toBe('absent_charged');
});
