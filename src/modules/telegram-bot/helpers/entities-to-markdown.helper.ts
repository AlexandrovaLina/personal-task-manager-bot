import * as TelegramBot from 'node-telegram-bot-api';

const WRAP_MAP: Partial<
  Record<TelegramBot.MessageEntity['type'], [string, string]>
> = {
  bold: ['<b>', '</b>'],
  italic: ['<i>', '</i>'],
  code: ['<code>', '</code>'],
  pre: ['<pre>', '</pre>'],
  strikethrough: ['<s>', '</s>'],
  underline: ['<u>', '</u>'],
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function entitiesToHtml(
  text: string,
  entities?: TelegramBot.MessageEntity[],
  baseOffset = 0,
): string {
  if (!entities?.length) return escapeHtml(text);

  const relevant = entities
    .filter((e) => {
      const start = e.offset;
      const end = e.offset + e.length;
      return start >= baseOffset && end <= baseOffset + text.length;
    })
    .sort((a, b) => a.offset - b.offset || b.length - a.length);

  if (!relevant.length) return escapeHtml(text);

  let result = '';
  let cursor = 0;

  for (const entity of relevant) {
    const relStart = entity.offset - baseOffset;
    const relEnd = relStart + entity.length;
    const fragment = escapeHtml(text.slice(relStart, relEnd));

    result += escapeHtml(text.slice(cursor, relStart));

    const wrap = WRAP_MAP[entity.type];
    if (wrap) {
      result += wrap[0] + fragment + wrap[1];
    } else if (entity.type === 'text_link') {
      result += `<a href="${entity.url}">${fragment}</a>`;
    } else {
      result += fragment;
    }

    cursor = relEnd;
  }

  result += escapeHtml(text.slice(cursor));
  return result;
}
