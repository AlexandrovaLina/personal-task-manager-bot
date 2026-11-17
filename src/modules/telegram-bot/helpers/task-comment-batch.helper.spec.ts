import { splitTaskCommentBatch } from './task-comment-batch.helper';

describe('splitTaskCommentBatch', () => {
  it('returns nothing when the text does not start with <number>:', () => {
    expect(splitTaskCommentBatch('hello')).toEqual([]);
    expect(splitTaskCommentBatch('WA-123: text')).toEqual([]);
  });

  it('parses a single ticket, including the legacy no-space form', () => {
    expect(splitTaskCommentBatch('123: сделал ревью')).toEqual([
      { taskNumber: 123, rawComment: 'сделал ревью', commentOffset: 5 },
    ]);
    expect(splitTaskCommentBatch('123:текст')).toEqual([
      { taskNumber: 123, rawComment: 'текст', commentOffset: 4 },
    ]);
  });

  it('keeps a multi-line comment for a single ticket', () => {
    const [segment] = splitTaskCommentBatch('123: строка 1\nстрока 2');
    expect(segment.rawComment).toBe('строка 1\nстрока 2');
  });

  it('splits several tickets, each on its own line', () => {
    const text = '123: сделал ревью\n456: жду QA\nвторая строка';
    const segments = splitTaskCommentBatch(text);

    expect(segments.map((s) => [s.taskNumber, s.rawComment])).toEqual([
      [123, 'сделал ревью'],
      [456, 'жду QA\nвторая строка'],
    ]);
    for (const s of segments) {
      expect(
        text.slice(s.commentOffset, s.commentOffset + s.rawComment.length),
      ).toBe(s.rawComment);
    }
  });

  it('treats an empty segment as a clear request', () => {
    const segments = splitTaskCommentBatch('123:\n456: текст');
    expect(segments.map((s) => [s.taskNumber, s.rawComment])).toEqual([
      [123, ''],
      [456, 'текст'],
    ]);
  });

  it('does not split on times like 10:30 at the start of a line', () => {
    const segments = splitTaskCommentBatch('123: созвон\n10:30 перенесли');
    expect(segments).toHaveLength(1);
    expect(segments[0].rawComment).toBe('созвон\n10:30 перенесли');
  });
});
