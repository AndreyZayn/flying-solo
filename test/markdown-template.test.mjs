import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeMarkdownValue,
  normalizeEditorMarkdown,
  resolveMarkdownTemplate,
  unwrapEditorWidgets,
} from "../public/markdown-template.mjs";

test("removes TOAST UI widget wrappers without changing placeholder syntax", () => {
  assert.equal(
    unwrapEditorWidgets("Show: $$widget0 {{EVENT_CODE}}$$ in $$widget12 {{EVENT_MONTH}}$$"),
    "Show: {{EVENT_CODE}} in {{EVENT_MONTH}}",
  );
});

test("restores spacing after bold text collapsed by WYSIWYG serialization", () => {
  assert.equal(
    normalizeEditorMarkdown("**(a) Complete Agreement.**This Agreement"),
    "**(a) Complete Agreement.** This Agreement",
  );
});

test("replaces simple uppercase placeholders with Markdown-escaped values", () => {
  const resolved = resolveMarkdownTemplate(
    "Brand: **{{BRAND_NAME}}** ({{PAYMENT_2_AMOUNT}})",
    {
      BRAND_NAME: "A *bold* [brand] <script>",
      PAYMENT_2_AMOUNT: "$1,200",
    },
  );

  assert.equal(
    resolved,
    "Brand: **A \\*bold\\* \\[brand\\] \\<script\\>** ($1,200)",
  );
});

test("keeps true IF block content and resolves its simple placeholders", () => {
  const resolved = resolveMarkdownTemplate(
    "Before\n{{#IF GRANT_ENABLED}}Grant: {{GRANT_AMOUNT}}\n{{/IF}}After",
    { GRANT_ENABLED: true, GRANT_AMOUNT: "$2,000" },
  );

  assert.equal(resolved, "Before\nGrant: $2,000\nAfter");
});

test("removes false IF block content before resolving simple placeholders", () => {
  const resolved = resolveMarkdownTemplate(
    "Before\n{{#IF GRANT_ENABLED}}Grant: {{GRANT_AMOUNT}}\n{{/IF}}After",
    { GRANT_ENABLED: false, GRANT_AMOUNT: "$0" },
  );

  assert.equal(resolved, "Before\nAfter");
});

test("supports digits and underscores in placeholder keys", () => {
  assert.equal(
    resolveMarkdownTemplate("{{PAYMENT_1_AMOUNT}}", { PAYMENT_1_AMOUNT: "$100" }),
    "$100",
  );
});

test("rejects unknown simple placeholders deterministically", () => {
  assert.throws(
    () => resolveMarkdownTemplate("{{UNKNOWN_VALUE}}", {}),
    new Error("Unknown template key: UNKNOWN_VALUE."),
  );
});

test("rejects unknown IF flags even when the block would otherwise be discarded", () => {
  assert.throws(
    () => resolveMarkdownTemplate("{{#IF UNKNOWN_FLAG}}hidden{{/IF}}", {}),
    new Error("Unknown template key: UNKNOWN_FLAG."),
  );
});

test("rejects malformed lowercase placeholders deterministically", () => {
  assert.throws(
    () => resolveMarkdownTemplate("{{brand_name}}", { brand_name: "Brand" }),
    new Error("Malformed template token: {{brand_name}}."),
  );
});

test("rejects unclosed IF blocks deterministically", () => {
  assert.throws(
    () => resolveMarkdownTemplate("{{#IF GRANT_ENABLED}}Grant", { GRANT_ENABLED: true }),
    new Error("Unclosed IF block: GRANT_ENABLED."),
  );
});

test("rejects unexpected IF closing tokens deterministically", () => {
  assert.throws(
    () => resolveMarkdownTemplate("Grant{{/IF}}", {}),
    new Error("Unexpected IF closing token."),
  );
});

test("rejects nested IF blocks", () => {
  assert.throws(
    () => resolveMarkdownTemplate(
      "{{#IF FIRST}}{{#IF SECOND}}value{{/IF}}{{/IF}}",
      { FIRST: true, SECOND: true },
    ),
    new Error("Nested IF blocks are not supported."),
  );
});

test("rejects unmatched template delimiters", () => {
  assert.throws(
    () => resolveMarkdownTemplate("{{BRAND_NAME", { BRAND_NAME: "Brand" }),
    new Error("Malformed template delimiter."),
  );
});

test("escapeMarkdownValue converts nullish values to empty strings", () => {
  assert.equal(escapeMarkdownValue(null), "");
  assert.equal(escapeMarkdownValue(undefined), "");
});
