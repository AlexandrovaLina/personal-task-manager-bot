export type AppConfig = {
  healthUrl: string;
  port: number;
  // Render sets RENDER=true and RENDER_GIT_COMMIT at runtime; used for the
  // post-deploy owner notification.
  isRender: boolean;
  gitCommit?: string;
};
