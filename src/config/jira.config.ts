import { registerAs } from '@nestjs/config';
import { JiraConfig } from './interfaces';

export default registerAs('jira', (): JiraConfig => {
  return {
    baseUrl: 'https://workaxle.atlassian.net/rest/api/3',
    siteUrl: process.env.JIRA_BASE_URL ?? 'https://workaxle.atlassian.net',
    authToken: Buffer.from(
      `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`,
    ).toString('base64'),
    projectKey: 'WA',
    userAccountId: process.env.JIRA_USER_ACCOUNT_ID ?? '',
  };
});
