import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { id, timestampts } from '../helpers';

export class CreateManualEntriesTable1787047803799
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'manual_entries',
        columns: [
          id,
          {
            name: 'key',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'title',
            type: 'text',
          },
          {
            name: 'url',
            type: 'text',
          },
          {
            name: 'comment',
            type: 'text',
          },
          ...timestampts,
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('manual_entries');
  }
}
