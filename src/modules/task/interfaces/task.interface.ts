import { Optional } from 'src/common';
import { TaskEntity } from '../task.entity';

export type CreateTaskPayloadData = Optional<
  TaskEntity,
  'id' | 'createdAt' | 'deletedAt' | 'updatedAt'
>;
