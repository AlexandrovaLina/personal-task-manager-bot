import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ManualEntryEntity } from './manual-entry.entity';
import { JiraService } from '../jira';
import { extractError } from 'src/common/helpers';

@Injectable()
export class ManualEntryService {
  constructor(
    private readonly logger: Logger,
    private readonly datasource: DataSource,
    private readonly jiraService: JiraService,
  ) {
    this.logger = new Logger(ManualEntryService.name);
  }

  public async upsertEntry(
    key: string,
    comment: string,
    isCurrent = false,
  ): Promise<ManualEntryEntity> {
    const manualEntryRepository =
      this.datasource.getRepository(ManualEntryEntity);

    try {
      const issue = await this.jiraService.getIssueByKey(key);
      const existing = await manualEntryRepository.findOneBy({ key });

      const entity = manualEntryRepository.create({
        id: existing?.id,
        key,
        title: issue.fields.summary,
        url: `https://workaxle.atlassian.net/browse/${key}`,
        comment,
        isCurrent,
      });

      return await manualEntryRepository.save(entity);
    } catch (error: unknown) {
      const { message, stack } = extractError(error);
      this.logger.error(
        `Failed to save manual entry ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  public async setCurrent(key: string): Promise<ManualEntryEntity | null> {
    const manualEntryRepository =
      this.datasource.getRepository(ManualEntryEntity);

    await manualEntryRepository.update({ key }, { isCurrent: true });

    return manualEntryRepository.findOneBy({ key });
  }

  public async getByKey(key: string): Promise<ManualEntryEntity | null> {
    const manualEntryRepository =
      this.datasource.getRepository(ManualEntryEntity);

    return manualEntryRepository.findOneBy({ key });
  }

  public async getAllEntries(): Promise<ManualEntryEntity[]> {
    const manualEntryRepository =
      this.datasource.getRepository(ManualEntryEntity);

    return manualEntryRepository.find({ order: { createdAt: 'ASC' } });
  }

  public async resetEntries(): Promise<void> {
    const manualEntryRepository =
      this.datasource.getRepository(ManualEntryEntity);

    await manualEntryRepository.clear();
  }
}
