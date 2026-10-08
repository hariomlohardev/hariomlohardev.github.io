/* Shared article metadata. Runs in Node builds/functions and in the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SEO = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var SITE = 'https://hariomlohardev.github.io';
  var descriptions = {
    'python-basics-arithmetic-operators-string-methods': 'Learn Python arithmetic operators, operator precedence and string methods with code examples, FAQs and a practice file by Hariom Lohar.',
    'python-basics-variables-data-types': 'Learn Python variables, data types, type checking, conversions and user input with examples and practice exercises by Hariom Lohar.',
    'learn-python-day-0': 'Set up Python, VS Code, Git and a GitHub account for Hariom Lohar’s beginner Python course. Day 0 covers the tools needed before the first lesson.',
    'learn-python-week-1': 'Start learning Python functions and variables with Hariom Lohar’s Week 1 guide, CS50P lecture links, explanations, FAQs and a practice notebook.'
  };
  var articleTitles = {
    'learn-python-day-0': 'Learn Python Day 0: Setup Guide',
    'learn-python-week-1': 'Learn Python Week 1: Functions & Variables'
  };
  function titleForPost(p) { return (articleTitles[p.slug] || p.title || p.slug || 'Post') + ' — Hariom Lohar'; }
  function plain(s) {
    return String(s || '').replace(/^---[\s\S]*?---\s*/, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]*>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/[#*_`~]+/g, '').replace(/\s+/g, ' ').trim();
  }
  function clip(s, n) {
    s = plain(s);
    if (s.length <= n) return s;
    var cut = s.slice(0, n - 1);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)) + '…';
  }
  function descriptionFor(p) {
    return clip(p.description || descriptions[p.slug] || (p.title + ' — ' + plain(p.html || p.raw)), 160);
  }
  function absoluteImage(value, fallback) {
    try {
      var u = new URL(value || fallback || '/og/blog.png', SITE + '/');
      return /^https?:$/.test(u.protocol) ? u.href : SITE + '/og/blog.png';
    } catch (_) { return SITE + '/og/blog.png'; }
  }
  function isoDate(value) {
    if (!value) return '';
    var s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00+05:30';
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  function normalizePost(p) {
    var pub = isoDate(p.date || p.created_at);
    var mod = isoDate(p.updated_at || p.dateModified || p.date || p.created_at);
    if (pub && mod && mod < pub) mod = pub;
    return Object.assign({}, p, {
      title: String(p.title || p.slug || 'Post'), description: String(p.description || ''),
      seoDescription: descriptionFor(p), tags: Array.isArray(p.tags) ? p.tags : [],
      url: SITE + '/blog/p/' + encodeURIComponent(p.slug) + '/',
      image: absoluteImage(p.cover || p.image, '/og/blog.png'),
      datePublished: pub, dateModified: mod,
      wordCount: Number(p.wordCount || p.word_count) || plain(p.html || p.raw).split(/\s+/).filter(Boolean).length,
      readingMinutes: Number(p.readingMinutes || p.reading_minutes) || 3
    });
  }
  function postNodes(post) {
    var p = normalizePost(post), page = p.url + '#webpage';
    var article = {
      '@type': 'BlogPosting', '@id': p.url + '#article', headline: p.title,
      description: p.seoDescription, url: p.url, mainEntityOfPage: { '@id': page },
      author: { '@id': SITE + '/#person' }, publisher: { '@id': SITE + '/#person' },
      image: p.image, inLanguage: 'en-IN', wordCount: p.wordCount,
      keywords: p.tags.join(', '), isPartOf: { '@id': SITE + '/#website' }
    };
    if (p.datePublished) article.datePublished = p.datePublished;
    if (p.dateModified) article.dateModified = p.dateModified;
    return [
      { '@type': 'WebPage', '@id': page, url: p.url, name: p.title,
        description: p.seoDescription, inLanguage: 'en-IN', isPartOf: { '@id': SITE + '/#website' },
        mainEntity: { '@id': p.url + '#article' }, breadcrumb: { '@id': p.url + '#breadcrumb' } },
      { '@type': 'BreadcrumbList', '@id': p.url + '#breadcrumb', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog' },
        { '@type': 'ListItem', position: 3, name: p.title, item: p.url }
      ] }, article
    ];
  }
  function safeJson(value, space) { return JSON.stringify(value, null, space).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function indexableTrick(t) { return String(t.id) !== '1'; } // Published UI fixture; retained visibly, excluded from search.
  function applyPost(doc, post) {
    var current = doc.querySelector('meta[property="og:image"]');
    var p = normalizePost(Object.assign({ image: current && current.content }, post));
    doc.title = titleForPost(p);
    function meta(attr, name, value) {
      var el = doc.querySelector('meta[' + attr + '="' + name + '"]');
      if (!el) { el = doc.createElement('meta'); el.setAttribute(attr, name); doc.head.appendChild(el); }
      el.setAttribute('content', value);
    }
    meta('name', 'description', p.seoDescription);
    meta('property', 'og:title', doc.title); meta('property', 'og:description', p.seoDescription);
    meta('property', 'og:image', p.image); meta('property', 'og:image:alt', p.title);
    meta('name', 'twitter:title', doc.title); meta('name', 'twitter:description', p.seoDescription);
    meta('name', 'twitter:image', p.image); meta('name', 'twitter:image:alt', p.title);
    if (p.datePublished) meta('property', 'article:published_time', p.datePublished);
    if (p.dateModified) meta('property', 'article:modified_time', p.dateModified);
    var ld = doc.getElementById('postStructuredData');
    if (ld) {
      var graph = JSON.parse(ld.textContent);
      graph['@graph'] = graph['@graph'].filter(function(n) { return n['@type'] === 'Person' || n['@type'] === 'WebSite'; }).concat(postNodes(p));
      ld.textContent = safeJson(graph);
    }
  }
  return { SITE: SITE, plain: plain, clip: clip, descriptionFor: descriptionFor, titleForPost: titleForPost, normalizePost: normalizePost,
    postNodes: postNodes, safeJson: safeJson, isoDate: isoDate, indexableTrick: indexableTrick, applyPost: applyPost };
});
