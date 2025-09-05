import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { id, timestampts } from '../helpers';

export class AddTasks1720197683741 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tasks',
        columns: [
          id,
          {
            name: 'external_id',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'state',
            type: 'text',
            default: "'not specified'",
          },
          {
            name: 'number',
            type: 'int',
          },
          {
            name: 'comments',
            type: 'text',
            isNullable: true,
          },
          ...timestampts,
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tasks');
  }
}
