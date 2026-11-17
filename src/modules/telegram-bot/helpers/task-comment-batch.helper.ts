export interface TaskCommentSegment {
  taskNumber: number;
  rawComment: string;
  // Offset of rawComment within the original message text — needed to map
  // Telegram entities (bold/links/...) onto this segment's comment.
  commentOffset: number;
}

// The first segment keeps the lenient legacy format (`123:text` is fine).
const FIRST_HEADER_REGEX = /^(\d+):/;
// Further segments start on a new line with `<number>:` followed by
// whitespace or end of text, so times like `10:30` inside a comment
// don't get mistaken for a new ticket.
const NEXT_HEADER_REGEX = /\n(\d+):(?=\s|$)/g;

interface SegmentHeader {
  taskNumber: number;
  start: number;
  bodyStart: number;
}

export function splitTaskCommentBatch(text: string): TaskCommentSegment[] {
  const first = text.match(FIRST_HEADER_REGEX);
  if (!first) return [];

  const headers: SegmentHeader[] = [
    { taskNumber: Number(first[1]), start: 0, bodyStart: first[0].length },
  ];

  for (const match of text.matchAll(NEXT_HEADER_REGEX)) {
    const start = match.index + 1; // skip the leading '\n'
    headers.push({
      taskNumber: Number(match[1]),
      start,
      bodyStart: match.index + match[0].length,
    });
  }

  return headers.map((header, i) => {
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].start : text.length;
    const body = text.slice(header.bodyStart, bodyEnd);
    const leadingWhitespace = body.length - body.trimStart().length;

    return {
      taskNumber: header.taskNumber,
      rawComment: body.trim(),
      commentOffset: header.bodyStart + leadingWhitespace,
    };
  });
}
