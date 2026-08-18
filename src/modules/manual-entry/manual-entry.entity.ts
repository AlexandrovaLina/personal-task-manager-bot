import { Column, Entity } from 'typeorm';

import { BaseEntity } from 'src/common';

@Entity({ name: 'manual_entries' })
export class ManualEntryEntity extends BaseEntity {
  @Column({ type: 'text', unique: true })
  public key: string;

  @Column({ type: 'text' })
  public title: string;

  @Column({ type: 'text' })
  public url: string;

  @Column({ type: 'text' })
  public comment: string;

  @Column({ type: 'boolean', default: false })
  public isCurrent: boolean;
}
