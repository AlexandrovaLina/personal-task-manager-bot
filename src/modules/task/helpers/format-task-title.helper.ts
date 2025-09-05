export function taskTitleFormatter(taskTitle: string) {
  return taskTitle.replace(/([*_`[\]()])/g, '');
}
