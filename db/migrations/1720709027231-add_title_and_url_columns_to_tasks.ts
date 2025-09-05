import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTitleAndUrlColumnsToTasks1720709027231
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'title',
        type: 'text',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'url',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'title');
    await queryRunner.dropColumn('tasks', 'url');
  }
}
