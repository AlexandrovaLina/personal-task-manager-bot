import { Column, Entity } from 'typeorm';

import { BaseEntity } from 'src/common';

@Entity({ name: 'tasks' })
export class TaskEntity extends BaseEntity {
  @Column({ type: 'text', unique: true })
  public externalId: string;

  @Column({ type: 'text' })
  public title: string;

  @Column({ type: 'text' })
  public url: string;

  @Column({ type: 'text', default: 'not specified' })
  public state: string;

  @Column({ type: 'int' })
  public number: number;

  @Column({ type: 'text', nullable: true })
  public comments?: string;
}
