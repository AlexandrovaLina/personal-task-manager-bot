import { TableColumnOptions } from 'typeorm';

const id: TableColumnOptions = {
  name: 'id',
  type: 'uuid',
  isPrimary: true,
  isGenerated: true,
  generationStrategy: 'uuid',
};

const timestampts: TableColumnOptions[] = [
  {
    name: 'created_at',
    type: 'timestamptz',
    precision: 3,
    default: 'now()',
  },
  {
    name: 'updated_at',
    type: 'timestamptz',
    precision: 3,
    default: 'now()',
  },
  {
    name: 'deleted_at',
    type: 'timestamptz',
    precision: 3,
    isNullable: true,
  },
];

export { id, timestampts };
