import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsOnCxlBoardToTasks1790775843138
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'is_on_cxl_board',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tasks', 'is_on_cxl_board');
  }
}
