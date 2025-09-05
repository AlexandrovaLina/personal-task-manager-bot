import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  public id: string;

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  public createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  public updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', precision: 3 })
  public deletedAt?: Date;
}
