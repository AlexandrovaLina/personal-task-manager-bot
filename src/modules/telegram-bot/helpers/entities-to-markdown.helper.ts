import * as TelegramBot from 'node-telegram-bot-api';

type EntityType =
  | TelegramBot.MessageEntity['type']
  | 'blockquote'
  | 'expandable_blockquote';

const WRAP_MAP: Partial<Record<EntityType, [string, string]>> = {
  bold: ['<b>', '</b>'],
  italic: ['<i>', '</i>'],
  code: ['<code>', '</code>'],
  pre: ['<pre>', '</pre>'],
  strikethrough: ['<s>', '</s>'],
  underline: ['<u>', '</u>'],
  spoiler: ['<tg-spoiler>', '</tg-spoiler>'],
  blockquote: ['<blockquote>', '</blockquote>'],
  expandable_blockquote: ['<blockquote expandable>', '</blockquote>'],
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface TagInsertion {
  pos: number;
  isClose: boolean;
  entityLength: number;
  tag: string;
}

function buildInsertions(
  entities: TelegramBot.MessageEntity[],
  baseOffset: number,
): TagInsertion[] {
  const insertions: TagInsertion[] = [];

  for (const entity of entities) {
    const relStart = entity.offset - baseOffset;
    const relEnd = relStart + entity.length;

    const wrap = WRAP_MAP[entity.type as EntityType];
    if (wrap) {
      insertions.push({
        pos: relStart,
        isClose: false,
        entityLength: entity.length,
        tag: wrap[0],
      });
      insertions.push({
        pos: relEnd,
        isClose: true,
        entityLength: entity.length,
        tag: wrap[1],
      });
    } else if (entity.type === 'text_link') {
      insertions.push({
        pos: relStart,
        isClose: false,
        entityLength: entity.length,
        tag: `<a href="${entity.url}">`,
      });
      insertions.push({
        pos: relEnd,
        isClose: true,
        entityLength: entity.length,
        tag: '</a>',
      });
    }
  }

  insertions.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.isClose !== b.isClose) return a.isClose ? -1 : 1;
    if (!a.isClose) return b.entityLength - a.entityLength;
    return a.entityLength - b.entityLength;
  });

  return insertions;
}

export function entitiesToHtml(
  text: string,
  entities?: TelegramBot.MessageEntity[],
  baseOffset = 0,
): string {
  if (!entities?.length) return escapeHtml(text);

  const relevant = entities.filter((e) => {
    const start = e.offset;
    const end = e.offset + e.length;
    return start >= baseOffset && end <= baseOffset + text.length;
  });

  if (!relevant.length) return escapeHtml(text);

  const insertions = buildInsertions(relevant, baseOffset);

  let result = '';
  let cursor = 0;

  for (const ins of insertions) {
    if (ins.pos > cursor) {
      result += escapeHtml(text.slice(cursor, ins.pos));
      cursor = ins.pos;
    }
    result += ins.tag;
  }

  result += escapeHtml(text.slice(cursor));
  return result;
}
