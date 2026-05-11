export function taskTitleFormatter(taskTitle: string) {
  return taskTitle.replace(/([*_`[\]()])/g, '');
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([*_`\[\]])/g, '\\$1');
}
