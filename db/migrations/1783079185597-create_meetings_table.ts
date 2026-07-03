import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { id, timestampts } from '../helpers';

export class CreateMeetingsTable1783079185597 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'meetings',
        columns: [
          id,
          {
            name: 'external_id',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'subject',
            type: 'text',
          },
          {
            name: 'start_at',
            type: 'timestamptz',
          },
          {
            name: 'end_at',
            type: 'timestamptz',
          },
          {
            name: 'join_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'location',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'content_hash',
            type: 'text',
          },
          ...timestampts,
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('meetings');
  }
}
