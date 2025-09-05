import { registerAs } from '@nestjs/config';
import { JiraConfig } from './interfaces';

export default registerAs('jira', (): JiraConfig => {
  return {
    baseUrl: 'https://workaxle.atlassian.net/rest/api/3',
    authToken: Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`,
    ).toString('base64'),
    projectKey: 'WA',
  };
});
