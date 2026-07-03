import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { join } from 'path';

const SCRIPT_TIMEOUT_MS = 30_000;

@Injectable()
export class ScriptRunnerService {
  private readonly logger = new Logger(ScriptRunnerService.name);
  private readonly scriptsDir = join(process.cwd(), 'scripts');

  constructor(private readonly configService: ConfigService) {}

  async runScript(scriptName: string, args: string[] = []): Promise<string> {
    const scriptPath = join(this.scriptsDir, scriptName);

    const env: Record<string, string> = {
      ...process.env,
      JIRA_EMAIL: this.configService.get<string>('JIRA_EMAIL'),
      JIRA_API_TOKEN: this.configService.get<string>('JIRA_API_TOKEN'),
      JIRA_BASE_URL: this.configService.get<string>(
        'JIRA_BASE_URL',
        'https://workaxle.atlassian.net',
      ),
      JIRA_USER_ACCOUNT_ID: this.configService.get<string>(
        'JIRA_USER_ACCOUNT_ID',
        '',
      ),
    };

    return new Promise((resolve, reject) => {
      execFile(
        'python3',
        [scriptPath, ...args],
        { env, timeout: SCRIPT_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) {
            this.logger.error(
              `Script ${scriptName} failed: ${error.message}`,
              stderr,
            );
            const output = stdout?.trim();
            if (output) {
              resolve(output);
              return;
            }
            reject(new Error('Не удалось получить данные из Jira'));
            return;
          }

          resolve(stdout.trim());
        },
      );
    });
  }
}
