import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsCurrentSprintToTasks1783075442709
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'is_current_sprint');
  }
}
