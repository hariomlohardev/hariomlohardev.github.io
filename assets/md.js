/**
 * assets/md.js — the one markdown renderer.
 *
 * Five near-identical copies used to drift apart; everything now calls this:
 *   Node    — scripts/generate-blog.js, generate-projects.js, generate-tricks.js,
 *             api/admin/posts.js            via require('.../assets/md.js')
 *   Browser — admin/blog/edit.html, admin/tricks/edit.html   via window.MD
 *
 * The source text is escaped before a single tag is produced, so raw HTML typed
 * into a post body renders as text instead of running. `>` is deliberately left
 * alone: blockquote syntax needs it and a bare `>` cannot open a tag.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // for attributes and anywhere a value is dropped into markup verbatim
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // for the markdown source itself — only & and < , see the header note
  function escSource(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  // a block that opens with a block-level tag can still end with plain text
  // (a list followed by a sign-off line) — wrap that tail so it gets .prose p spacing.
  function tailP(b) {
    var m = b.match(/^([\s\S]*<\/(?:ul|ol|blockquote|pre|h[1-6])>)([\s\S]*)$/);
    if (!m || !m[2].trim()) return b;
    return m[1] + '\n<p>' + m[2].trim().replace(/\n/g, '<br />\n') + '</p>';
  }

  // a link to an uploaded file (…?download=name) reads as a download chip, not a bare
  // link. amp; too, because the source is escaped before links are parsed.
  function linkTag(text, href) {
    if (/[?&](?:amp;)?download=/.test(href)) {
      return '<a class="dl-file" href="' + href + '" download rel="noopener">' + text + '</a>';
    }
    return '<a href="' + href + '" rel="noopener">' + text + '</a>';
  }

  // images are sized by the page's own `.prose img` / `.p-prose img` rules — no
  // inline style here, or a page can no longer override its own spacing
  function mdToHtml(md) {
    var s = escSource(md).replace(/\r\n/g, '\n');

    // fenced code first, so nothing below rewrites it (already escaped above)
    var codes = [];
    s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (m, lang, code) {
      var i = codes.length;
      codes.push('<pre><code class="lang-' + lang + '">' + code.replace(/\s+$/, '') + '</code></pre>');
      return '__CODE_' + i + '__';
    });
    s = s.replace(/`([^`]+?)`/g, function (m, c) { return '<code>' + c + '</code>'; });

    s = s.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // images before links, so ![alt](url) is not read as a link
    s = s.replace(/!\[([^\]]*?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,
      '<img src="$2" alt="$1" loading="lazy" decoding="async" />');
    s = s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|mailto:[^\s)]+)\)/g,
      function (m, t, h) { return linkTag(t, h); });

    s = s.replace(/^>[ \t]?(.*)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/<\/blockquote>\n<blockquote>/g, '<br />\n');

    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, '$1<em>$2</em>$3');
    s = s.replace(/^[ \t]*(?:\*\*\*|---|___)[ \t]*$/gm, '<hr />');

    s = s.split('\n').map(function (l) {
      if (/^[ \t]*[-*+][ \t]+/.test(l)) return l.replace(/^[ \t]*[-*+][ \t]+(.+)/, '<li>$1</li>');
      if (/^[ \t]*\d+\.[ \t]+/.test(l)) return l.replace(/^[ \t]*\d+\.[ \t]+(.+)/, '<li>$1</li>');
      return l;
    }).join('\n');
    // keep the blank line that followed a list — without it the next block gets
    // glued on and tailP wraps it, which is how <p><pre> used to happen
    s = s.replace(/(?:<li>.*<\/li>\n?)+/g, function (m) {
      return '<ul>\n' + m.trim() + '\n</ul>' + (/\n$/.test(m) ? '\n' : '');
    });

    var out = s.split(/\n{2,}/).map(function (b) {
      b = b.trim();
      if (!b) return '';
      if (/^<(?:h[1-6]|pre|ul|ol|hr|blockquote|img)/.test(b) || b.indexOf('__CODE_') === 0) return tailP(b);
      return '<p>' + b.replace(/\n/g, '<br />\n') + '</p>';
    }).join('\n\n');

    codes.forEach(function (html, i) { out = out.replace('__CODE_' + i + '__', html); });
    return out;
  }

  return {
    mdToHtml: mdToHtml,
    tailP: tailP,
    linkTag: linkTag,
    escHtml: escHtml,
    escSource: escSource
  };
});
