const KEY_PATTERN = /^[A-Z0-9_]+$/;
const IF_OPEN_PATTERN = /^#IF ([A-Z0-9_]+)$/;
const TOKEN_PATTERN = /\{\{([\s\S]*?)\}\}/g;
const IF_BLOCK_PATTERN = /\{\{#IF ([A-Z0-9_]+)\}\}([\s\S]*?)\{\{\/IF\}\}/g;
const SIMPLE_TOKEN_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;
const EDITOR_WIDGET_PATTERN = /\$\$widget\d+\s+([\s\S]*?)\$\$/g;
const MARKDOWN_METACHARACTERS = new Set("\\`*_{}[]()<>#+-.!|~".split(""));
const MARKDOWN_ESCAPE_PATTERN = /\\([\\`*_{}\[\]()<>#+.!|~\-])/g;

function hasKey(context, key) {
  return Object.prototype.hasOwnProperty.call(context, key);
}

export function escapeMarkdownValue(value) {
  const text = value == null ? "" : String(value);
  let escaped = "";
  for (const character of text) {
    escaped += MARKDOWN_METACHARACTERS.has(character) ? `\\${character}` : character;
  }
  return escaped;
}

export function unwrapEditorWidgets(markdown) {
  return String(markdown ?? "").replace(EDITOR_WIDGET_PATTERN, "$1");
}

export function normalizeEditorMarkdown(markdown) {
  return unwrapEditorWidgets(markdown).replace(
    /\*\*([^\n*]+)\*\*(?=[A-Za-z0-9])/g,
    "**$1** ",
  );
}

function validateTemplate(template, context) {
  TOKEN_PATTERN.lastIndex = 0;
  let cursor = 0;
  let openIf = null;
  let match;

  while ((match = TOKEN_PATTERN.exec(template)) !== null) {
    const betweenTokens = template.slice(cursor, match.index);
    if (betweenTokens.includes("{{") || betweenTokens.includes("}}")) {
      throw new Error("Malformed template delimiter.");
    }

    const token = match[1];
    const ifMatch = token.match(IF_OPEN_PATTERN);
    if (ifMatch) {
      if (openIf !== null) throw new Error("Nested IF blocks are not supported.");
      const key = ifMatch[1];
      if (!hasKey(context, key)) throw new Error(`Unknown template key: ${key}.`);
      openIf = key;
    } else if (token === "/IF") {
      if (openIf === null) throw new Error("Unexpected IF closing token.");
      openIf = null;
    } else if (KEY_PATTERN.test(token)) {
      if (!hasKey(context, token)) throw new Error(`Unknown template key: ${token}.`);
    } else {
      throw new Error(`Malformed template token: {{${token}}}.`);
    }

    cursor = TOKEN_PATTERN.lastIndex;
  }

  const afterTokens = template.slice(cursor);
  if (afterTokens.includes("{{") || afterTokens.includes("}}")) {
    throw new Error("Malformed template delimiter.");
  }
  if (openIf !== null) throw new Error(`Unclosed IF block: ${openIf}.`);
}

function resolveTemplate(template, context, resolveValue) {
  const source = String(template ?? "");
  const values = context && typeof context === "object" ? context : {};
  validateTemplate(source, values);

  const conditionsResolved = source.replace(
    IF_BLOCK_PATTERN,
    (_block, key, content) => Boolean(values[key]) ? content : "",
  );
  const resolved = conditionsResolved.replace(
    SIMPLE_TOKEN_PATTERN,
    (_token, key) => resolveValue(values[key]),
  );

  if (resolved.includes("{{") || resolved.includes("}}")) {
    throw new Error("Unresolved template token.");
  }
  return resolved;
}

export function resolveMarkdownTemplate(template, context) {
  return resolveTemplate(template, context, escapeMarkdownValue);
}

export function resolveTextTemplate(template, context) {
  const plainTextTemplate = String(template ?? "").replace(MARKDOWN_ESCAPE_PATTERN, "$1");
  return resolveTemplate(plainTextTemplate, context, (value) => value == null ? "" : String(value));
}
