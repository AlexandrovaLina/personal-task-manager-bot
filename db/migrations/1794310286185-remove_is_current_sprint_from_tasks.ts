import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveIsCurrentSprintFromTasks1794310286185
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'is_current_sprint');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'is_current_sprint',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }
}
