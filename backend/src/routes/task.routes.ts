'use strict';

import express from 'express';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import controller from '../controllers/taskController';
import { listTasksQuery,
  boardQuery,
  ganttQuery,
  createTaskSchema,
  updateTaskSchema,
  updateTaskScheduleSchema,
  updateStatusSchema,
  updatePositionSchema,
  assignSchema,
  createCommentSchema,
  createDependencySchema,
  taskIdParams,
  taskCommentParams,
  taskAttachmentParams,
  taskDependencyParams,
  taskChecklistParams,
  createChecklistSchema,
  updateChecklistSchema, } from '../validators/task.validator';

const router = express.Router();

router.use(requireAuth);

// The board and gantt routes must be declared before `/:id` so the id param cannot swallow them.
router.get('/board', validate({ query: boardQuery }), controller.getBoard);
router.get('/gantt', validate({ query: ganttQuery }), controller.getGantt);

router.get('/', validate({ query: listTasksQuery }), controller.listTasks);
router.post('/', validate({ body: createTaskSchema }), controller.createTask);

router.get('/:id', validate({ params: taskIdParams }), controller.getTask);
router.patch('/:id', validate({ params: taskIdParams, body: updateTaskSchema }), controller.updateTask);
router.patch('/:id/schedule', validate({ params: taskIdParams, body: updateTaskScheduleSchema }), controller.updateSchedule);
router.delete('/:id', validate({ params: taskIdParams }), controller.deleteTask);

router.patch('/:id/status', validate({ params: taskIdParams, body: updateStatusSchema }), controller.updateStatus);
router.patch('/:id/position', validate({ params: taskIdParams, body: updatePositionSchema }), controller.updatePosition);
router.patch('/:id/assign', validate({ params: taskIdParams, body: assignSchema }), controller.assignTask);

router.get('/:id/comments', validate({ params: taskIdParams }), controller.listComments);
router.post('/:id/comments', validate({ params: taskIdParams, body: createCommentSchema }), controller.createComment);
router.delete(
  '/:id/comments/:commentId',
  validate({ params: taskCommentParams }),
  controller.deleteComment
);

router.get('/:id/attachments', validate({ params: taskIdParams }), controller.listAttachments);
router.post(
  '/:id/attachments',
  validate({ params: taskIdParams }),
  uploadSingle('file'),
  controller.uploadAttachment
);
router.delete(
  '/:id/attachments/:attachmentId',
  validate({ params: taskAttachmentParams }),
  controller.deleteAttachment
);

router.get('/:id/dependencies', validate({ params: taskIdParams }), controller.listDependencies);
router.post(
  '/:id/dependencies',
  validate({ params: taskIdParams, body: createDependencySchema }),
  controller.createDependency
);
router.delete(
  '/:id/dependencies/:dependencyId',
  validate({ params: taskDependencyParams }),
  controller.deleteDependency
);

router.get('/:id/checklists', validate({ params: taskIdParams }), controller.listChecklists);
router.post(
  '/:id/checklists',
  validate({ params: taskIdParams, body: createChecklistSchema }),
  controller.createChecklist
);
router.patch(
  '/:id/checklists/:checklistId',
  validate({ params: taskChecklistParams, body: updateChecklistSchema }),
  controller.updateChecklist
);
router.delete(
  '/:id/checklists/:checklistId',
  validate({ params: taskChecklistParams }),
  controller.deleteChecklist
);

export default router;
