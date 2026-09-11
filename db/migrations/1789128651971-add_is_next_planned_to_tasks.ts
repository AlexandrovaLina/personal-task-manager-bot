import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsNextPlannedToTasks1789128651971
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'is_next_planned',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'is_next_planned');
  }
}
