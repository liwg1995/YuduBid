function normalizeChatMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const systemContent = source
    .filter((message) => message?.role === 'system')
    .map((message) => message.content)
    .filter((content) => Array.isArray(content) ? content.length > 0 : typeof content === 'string' && content.trim());
  if (!systemContent.length) return source.filter((message) => message?.role !== 'system');

  const content = systemContent.some(Array.isArray)
    ? systemContent.flatMap((part, index) => [
      ...(index ? [{ type: 'text', text: '\n\n' }] : []),
      ...(Array.isArray(part) ? part : [{ type: 'text', text: part }]),
    ])
    : systemContent.join('\n\n');
  return [
    { role: 'system', content },
    ...source.filter((message) => message?.role !== 'system'),
  ];
}

module.exports = { normalizeChatMessages };
