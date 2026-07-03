import { Column, Entity } from 'typeorm';

import { BaseEntity } from 'src/common';

@Entity({ name: 'meetings' })
export class MeetingEntity extends BaseEntity {
  @Column({ type: 'text', unique: true })
  public externalId: string;

  @Column({ type: 'text' })
  public subject: string;

  @Column({ type: 'timestamptz' })
  public startAt: Date;

  @Column({ type: 'timestamptz' })
  public endAt: Date;

  @Column({ type: 'text', nullable: true })
  public joinUrl?: string;

  @Column({ type: 'text', nullable: true })
  public location?: string;

  @Column({ type: 'text' })
  public contentHash: string;
}
