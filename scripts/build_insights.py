#!/usr/bin/env python3
"""
Kataba Insights build step.

Reads Markdown + frontmatter articles from content/insights/, renders them
into static HTML pages under insights/<slug>/index.html plus an index page
at insights/index.html, regenerates sitemap.xml, and injects/removes the
homepage and /ugs cross-link cards for the most recently published article.

This is a *build-time* step (no client-side Markdown runtime, no CMS).
Run it directly:

    python scripts/build_insights.py

server.py also calls main() once at startup so local development always
reflects the current content/insights/*.md frontmatter without a separate
manual build step.

Adding a new article: drop a new .md file (with the same frontmatter
shape) into content/insights/ and re-run the build. No new page/component
code is required.
"""
import glob
import html as html_lib
import json
import math
import os
import re
import sys
from datetime import datetime
from urllib.parse import urlparse

import markdown
from markdown.extensions.toc import TocExtension

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_DIR = os.path.join(ROOT, "content", "insights")
OUTPUT_DIR = os.path.join(ROOT, "insights")
SITE_ORIGIN = "https://kataba.ai"
WORDS_PER_MINUTE = 220

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


# ── Frontmatter parsing ──────────────────────────────────────────────────
def parse_frontmatter(raw_text):
    """Tiny, dependency-free frontmatter parser. Only supports the simple
    `key: value` / `key: "value"` shape this project's articles use -- not
    a full YAML parser, deliberately, to avoid adding a dependency for a
    handful of scalar fields."""
    lines = raw_text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        raise ValueError("Article is missing an opening '---' frontmatter fence")

    end_index = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_index = i
            break
    if end_index is None:
        raise ValueError("Article is missing a closing '---' frontmatter fence")

    fm = {}
    for line in lines[1:end_index]:
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if value.lower() == "true":
            value = True
        elif value.lower() == "false":
            value = False
        fm[key] = value

    # Normalize legacy `status: "Draft - <reason>"` into structured fields.
    if "draft" not in fm and "status" in fm:
        status = str(fm["status"])
        is_draft = status.strip().lower().startswith("draft")
        fm["draft"] = is_draft
        if is_draft and "review_status" not in fm:
            reason = status.split("-", 1)[1].strip() if "-" in status else status
            reason = reason[:-len(" before publication")] if reason.endswith(" before publication") else reason
            fm["review_status"] = reason
    fm.setdefault("draft", False)
    fm.setdefault("review_status", "")

    body = "\n".join(lines[end_index + 1:])
    return fm, body


def format_date(date_str):
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except (ValueError, TypeError):
        return date_str, date_str
    return f"{MONTH_NAMES[dt.month - 1]} {dt.day}, {dt.year}", dt.strftime("%Y-%m-%d")


def slug_from_frontmatter(fm, fallback):
    slug_field = fm.get("slug") or fallback
    return slug_field.strip("/").split("/")[-1]


# ── Reading time ─────────────────────────────────────────────────────────
def strip_tags(html_str):
    return re.sub(r"<[^>]+>", " ", html_str)


def reading_time_minutes(plain_text):
    words = len([w for w in re.split(r"\s+", plain_text.strip()) if w])
    return max(1, math.ceil(words / WORDS_PER_MINUTE)), words


# ── Sanitization (defense-in-depth for internally authored Markdown) ────
_SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b.*?</\1>", re.IGNORECASE | re.DOTALL)
_EVENT_ATTR_RE = re.compile(r'\s+on[a-z]+\s*=\s*(".*?"|\'.*?\')', re.IGNORECASE)
_JS_HREF_RE = re.compile(r'(href|src)\s*=\s*(["\'])\s*javascript:[^"\']*\2', re.IGNORECASE)


def sanitize_html(html_str):
    html_str = _SCRIPT_STYLE_RE.sub("", html_str)
    html_str = _EVENT_ATTR_RE.sub("", html_str)
    html_str = _JS_HREF_RE.sub(lambda m: f'{m.group(1)}="#"', html_str)
    return html_str


# ── External link handling ───────────────────────────────────────────────
_LINK_RE = re.compile(r'<a\s+href="([^"]+)"([^>]*)>')


def process_links(html_str):
    def _replace(match):
        href, rest = match.group(1), match.group(2)
        parsed = urlparse(href)
        is_internal = parsed.netloc in ("", "kataba.ai", "www.kataba.ai")
        if is_internal:
            if parsed.netloc:
                new_href = (parsed.path or "/") + (("?" + parsed.query) if parsed.query else "") + (("#" + parsed.fragment) if parsed.fragment else "")
            else:
                new_href = href
            return f'<a href="{new_href}"{rest} class="body-link">'
        return (
            f'<a href="{href}"{rest} class="body-link body-link--external" '
            f'target="_blank" rel="noopener noreferrer">'
        )

    html_str = _LINK_RE.sub(_replace, html_str)
    # Add screen-reader context + visible icon right after external links' closing tag text.
    html_str = re.sub(
        r'(<a\s+[^>]*class="body-link body-link--external"[^>]*>)(.*?)(</a>)',
        lambda m: f'{m.group(1)}{m.group(2)}<span class="sr-only"> (opens in new tab)</span>{m.group(3)}',
        html_str,
        flags=re.DOTALL,
    )
    return html_str


# ── Table accessibility (scrollable wrapper + scope=col) ────────────────
def wrap_tables(html_str):
    html_str = re.sub(r"<th>", '<th scope="col">', html_str)

    def _wrap(match):
        table_html = match.group(0)
        # Use the nearest preceding heading text to make the scroll region's
        # accessible name specific rather than a generic "Scrollable table"
        # repeated for every table on the page.
        preceding = html_str[: match.start()]
        heading_match = list(re.finditer(r'<h[23][^>]*>(.*?)</h[23]>', preceding))
        label = strip_tags(heading_match[-1].group(1)).strip() if heading_match else "table"
        label = re.sub(r"^\d+\s+", "", label)
        return (
            f'<div class="article-table-wrapper" tabindex="0" role="region" '
            f'aria-label="{html_lib.escape(label)} table, scrollable horizontally">' + table_html + "</div>"
        )

    return re.sub(r"<table>.*?</table>", _wrap, html_str, flags=re.DOTALL)


# ── Structural build-time transforms specific to this article template ──
def flatten_toc(tokens):
    flat = []
    for t in tokens:
        flat.append(t)
        flat.extend(flatten_toc(t.get("children", [])))
    return flat


def find_heading_html_start(html_str, heading_id):
    m = re.search(r'<h[23] id="' + re.escape(heading_id) + r'"[^>]*>', html_str)
    return m.start() if m else None


def insert_evidence_chain(html_str):
    """Insert the CSS-native evidence-chain graphic right after the opening
    problem statement (before the first <h2>)."""
    graphic = (
        '<div class="evidence-chain" role="img" '
        'aria-label="Evidence chain: Requirement leads to Procedure, '
        'which leads to Operating evidence, which leads to Expert disposition">'
        '<span class="evidence-chain-step">Requirement</span>'
        '<span class="evidence-chain-arrow" aria-hidden="true">&rarr;</span>'
        '<span class="evidence-chain-step">Procedure</span>'
        '<span class="evidence-chain-arrow" aria-hidden="true">&rarr;</span>'
        '<span class="evidence-chain-step">Operating evidence</span>'
        '<span class="evidence-chain-arrow" aria-hidden="true">&rarr;</span>'
        '<span class="evidence-chain-step evidence-chain-step--final">Expert disposition</span>'
        "</div>"
    )
    idx = re.search(r"<h2\b", html_str)
    if not idx:
        return html_str
    return html_str[: idx.start()] + graphic + html_str[idx.start():]


def wrap_gap_statement_comparison(html_str):
    pattern = re.compile(
        r'<p><strong>Too vague:</strong>(.*?)</p>\s*'
        r'<p><strong>Reviewable:</strong>(.*?)</p>',
        re.DOTALL,
    )

    def _replace(match):
        vague, reviewable = match.group(1), match.group(2)
        return (
            '<div class="gap-statement-compare">'
            '<div class="gap-statement-card gap-statement-card--vague">'
            '<p class="gap-statement-label">Too vague</p>'
            f"<p>{vague.strip()}</p></div>"
            '<div class="gap-statement-card gap-statement-card--reviewable">'
            '<p class="gap-statement-label">Reviewable</p>'
            f"<p>{reviewable.strip()}</p></div>"
            "</div>"
        )

    return pattern.sub(_replace, html_str)


_STEP_HEADING_RE = re.compile(r'(<h3 id="([^"]+)"[^>]*>)(\d+)\.\s*(.+?)(</h3>)')


def style_workflow_step_numbers(html_str):
    def _replace(match):
        open_tag, heading_id, num, title, close_tag = match.groups()
        return (
            f'<h3 id="{heading_id}" class="workflow-step-heading">'
            f'<span class="workflow-step-num">{int(num):02d}</span>'
            f'<span class="workflow-step-title">{title}</span></h3>'
        )

    return _STEP_HEADING_RE.sub(_replace, html_str)


def insert_inline_cta(html_str, toc_flat):
    target = next((t for t in toc_flat if t["name"] == "The minimum viable gap matrix"), None)
    if not target:
        return html_str
    start = find_heading_html_start(html_str, target["id"])
    if start is None:
        return html_str
    next_h2 = re.search(r"<h2\b", html_str[start + 10:])
    if not next_h2:
        return html_str
    insert_at = start + 10 + next_h2.start()
    cta = (
        '<aside class="article-inline-cta" aria-labelledby="inline-cta-heading">'
        '<h3 id="inline-cta-heading">Could this workflow be tested on one procedure family?</h3>'
        "<p>Kataba can begin with one facility, a limited approved corpus, explicit "
        "deliverables and acceptance criteria agreed before the work begins.</p>"
        '<a href="/ugs#poc" class="btn btn-primary" data-analytics-cta="inline">'
        "See the bounded UGS POC</a>"
        "</aside>"
    )
    return html_str[:insert_at] + cta + html_str[insert_at:]


def append_final_cta(html_str):
    cta = (
        '<aside class="article-final-cta" aria-labelledby="final-cta-heading">'
        '<h3 id="final-cta-heading">Have one UGS procedure or evidence workflow worth testing?</h3>'
        "<p>Start with one approved corpus and one defined technical question. The result "
        "should be measurable before either side considers a broader deployment.</p>"
        '<div class="article-final-cta-actions">'
        # btn-invert (white pill, black text), not btn-primary (black bg) --
        # this CTA sits on the same black .article-final-cta panel, so the
        # site's normal black-background button would be invisible here.
        '<a href="/ugs#cta" class="btn btn-invert btn-lg" data-analytics-cta="final-primary">'
        "Discuss a bounded UGS POC</a>"
        '<a href="/ugs" class="article-final-cta-secondary" data-analytics-cta="final-secondary">'
        "Explore Kataba for UGS</a>"
        "</div></aside>"
    )
    return html_str + cta


# ── Markdown rendering ────────────────────────────────────────────────────
def render_markdown(body_md):
    md = markdown.Markdown(
        extensions=["extra", "sane_lists", TocExtension(anchorlink=False, permalink=False, slugify=slugify)],
        output_format="html5",
    )
    html_str = md.convert(body_md)
    toc_flat = flatten_toc(md.toc_tokens)
    return html_str, toc_flat


def slugify(value, separator):
    value = re.sub(r"[\u2018\u2019\u201c\u201d\u2013\u2014]", "", value)
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE).strip().lower()
    return re.sub(r"[\s_-]+", separator, value)


def strip_duplicate_h1(body_md, title):
    lines = body_md.split("\n")
    for i, line in enumerate(lines):
        if line.strip():
            if line.strip().lstrip("#").strip() == title.strip():
                del lines[i]
            break
    return "\n".join(lines)


# ── Article model ─────────────────────────────────────────────────────────
class Article:
    def __init__(self, fm, body_md, source_path):
        self.fm = fm
        self.source_path = source_path
        self.title = fm.get("title", "Untitled")
        self.meta_title = fm.get("meta_title", self.title)
        self.meta_description = fm.get("meta_description", fm.get("excerpt", ""))
        self.excerpt = fm.get("excerpt", "")
        self.author = fm.get("author", "Kataba")
        self.category = fm.get("category", "")
        self.category_label = fm.get("category_label", self.category.upper())
        self.breadcrumb_label = fm.get("breadcrumb_label", self.category)
        self.card_label = fm.get("card_label", "INSIGHT")
        self.draft = bool(fm.get("draft", False))
        self.review_status = fm.get("review_status", "")
        self.date_raw = fm.get("date", "")
        self.date_modified_raw = fm.get("date_modified", self.date_raw)
        self.date_display, self.date_iso = format_date(self.date_raw)
        self.date_modified_display, self.date_modified_iso = format_date(self.date_modified_raw)
        self.slug = slug_from_frontmatter(fm, os.path.splitext(os.path.basename(source_path))[0])
        self.url_path = f"/insights/{self.slug}"
        self.canonical_url = f"{SITE_ORIGIN}{self.url_path}"

        body_md = strip_duplicate_h1(body_md, self.title)
        raw_html, toc_flat = render_markdown(body_md)

        plain_text = strip_tags(raw_html)
        self.reading_minutes, self.word_count = reading_time_minutes(plain_text)

        processed = raw_html
        processed = wrap_gap_statement_comparison(processed)
        processed = style_workflow_step_numbers(processed)
        processed = wrap_tables(processed)
        processed = insert_evidence_chain(processed)
        # process_links must run before inserting the CTA asides below --
        # those already have hardcoded, correct classes/attributes and
        # shouldn't be re-matched by the generic <a href> rewrite.
        processed = process_links(processed)
        processed = insert_inline_cta(processed, toc_flat)
        processed = append_final_cta(processed)
        processed = sanitize_html(processed)
        self.body_html = processed

        self.toc = [t for t in toc_flat if t["level"] in (2, 3) and t["name"] not in ("Sources",)]


def load_articles():
    articles = []
    for path in sorted(glob.glob(os.path.join(CONTENT_DIR, "*.md"))):
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        fm, body_md = parse_frontmatter(raw)
        articles.append(Article(fm, body_md, path))
    articles.sort(key=lambda a: a.date_iso, reverse=True)
    return articles


# ── HTML templates ────────────────────────────────────────────────────────
def render_toc_html(toc):
    if not toc:
        return ""
    items = []
    for t in toc:
        cls = "toc-link" if t["level"] == 2 else "toc-link toc-link--sub"
        items.append(f'<li><a href="#{t["id"]}" class="{cls}">{html_lib.escape(t["name"])}</a></li>')
    return "<ol class=\"toc-list\">" + "".join(items) + "</ol>"


def render_breadcrumb(article=None):
    if article:
        crumbs = [("Home", "/"), ("Insights", "/insights"), (article.breadcrumb_label or "Insights", None)]
    else:
        crumbs = [("Home", "/"), ("Insights", None)]
    parts = []
    for label, href in crumbs:
        if href:
            parts.append(f'<a href="{href}">{html_lib.escape(label)}</a>')
        else:
            parts.append(f'<span aria-current="page">{html_lib.escape(label)}</span>')
    return '<nav class="breadcrumb" aria-label="Breadcrumb">' + ' <span class="breadcrumb-sep" aria-hidden="true">/</span> '.join(parts) + "</nav>"


def render_breadcrumb_jsonld(article):
    items = [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE_ORIGIN + "/"},
        {"@type": "ListItem", "position": 2, "name": "Insights", "item": SITE_ORIGIN + "/insights"},
        {"@type": "ListItem", "position": 3, "name": article.breadcrumb_label},
    ]
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def render_article_jsonld(article):
    return {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "headline": article.title,
        "description": article.meta_description,
        "datePublished": article.date_iso,
        "dateModified": article.date_modified_iso,
        "author": {"@type": "Organization", "name": article.author, "url": SITE_ORIGIN + "/"},
        "publisher": {
            "@type": "Organization",
            "name": "Kataba",
            "url": SITE_ORIGIN + "/",
            "logo": {"@type": "ImageObject", "url": f"{SITE_ORIGIN}/assets/kataba-logo-mark.png"},
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": article.canonical_url},
        "image": f"{SITE_ORIGIN}/assets/insights-{article.slug}-og.png",
    }


HEAD_META_ROBOTS_DRAFT = '\n  <meta name="robots" content="noindex, nofollow" />'

ARTICLE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{meta_title}</title>
  <meta name="description" content="{meta_description}" />{robots_tag}
  <link rel="canonical" href="{canonical_url}" />
  <link rel="icon" href="data:," />

  <meta property="og:type" content="article" />
  <meta property="og:url" content="{canonical_url}" />
  <meta property="og:title" content="{meta_title}" />
  <meta property="og:description" content="{meta_description}" />
  <meta property="og:image" content="{og_image}" />
  <meta property="article:published_time" content="{date_iso}" />
  <meta property="article:modified_time" content="{date_modified_iso}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{meta_title}" />
  <meta name="twitter:description" content="{meta_description}" />
  <meta name="twitter:image" content="{og_image}" />

  <link rel="stylesheet" href="/assets/site.css" />
  <link rel="stylesheet" href="/assets/insights.css" />
  <script type="application/ld+json">{article_jsonld}</script>
  <script type="application/ld+json">{breadcrumb_jsonld}</script>
</head>
<body data-analytics-slug="{slug}" data-analytics-category="{category}">
  <a href="#main" class="skip-link">Skip to main content</a>
  <nav class="site-nav">
    <div class="nav-inner">
      <a href="/" class="logo">
        <div class="logo-mark">K</div>
        Kataba
      </a>
      <div class="nav-links">
        <a href="/insights" class="nav-link">Insights</a>
        <a href="/ugs" class="nav-link">UGS</a>
        <a href="/ugs#cta" class="btn btn-primary">Discuss a Pilot</a>
      </div>
    </div>
  </nav>

  <main id="main">
    <article class="insight-article">
      <header class="insight-article-header">
        {breadcrumb}
        <p class="eyebrow insight-category">{category_label}</p>
        <h1>{title}</h1>
        <p class="insight-excerpt">{excerpt}</p>
        <p class="insight-meta">{author} &middot; {date_display} &middot; {reading_minutes} min read</p>
      </header>

      <div class="insight-layout">
        <nav class="insight-toc" aria-label="Table of contents">
          <details class="insight-toc-details" open>
            <summary>On this page</summary>
            {toc_html}
          </details>
        </nav>
        <div class="insight-body">
          {body_html}
        </div>
      </div>
    </article>
  </main>

  <footer>
    <div class="footer-inner">
      <a href="/" class="logo" style="text-decoration:none;">
        <div class="logo-mark">K</div>
        Kataba
      </a>
      <span class="footer-copy">AI knowledge retrieval for geoscience, subsurface, and technical energy teams.</span>
      <nav class="footer-links" aria-label="Footer">
        <a href="/insights">Insights</a>
        <a href="/ugs">UGS Solution</a>
        <a href="mailto:hello@kataba.ai">Contact</a>
      </nav>
    </div>
    <p class="footer-disclaimer">Kataba supports technical evidence review and does not provide legal advice or make autonomous regulatory-compliance determinations.</p>
  </footer>

  <script src="/assets/site.js"></script>
  <script src="/assets/insights.js"></script>
</body>
</html>
"""

INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Technical Insights | Kataba</title>
  <meta name="description" content="Practical, source-linked technical articles on UGS evidence workflows, procedure gap analysis, and applied AI for geoscience and technical energy teams." />
  <link rel="canonical" href="https://kataba.ai/insights" />
  <link rel="icon" href="data:," />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://kataba.ai/insights" />
  <meta property="og:title" content="Technical Insights | Kataba" />
  <meta property="og:description" content="Practical, source-linked technical articles on UGS evidence workflows, procedure gap analysis, and applied AI for geoscience and technical energy teams." />
  <link rel="stylesheet" href="/assets/site.css" />
  <link rel="stylesheet" href="/assets/insights.css" />
</head>
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <nav class="site-nav">
    <div class="nav-inner">
      <a href="/" class="logo">
        <div class="logo-mark">K</div>
        Kataba
      </a>
      <div class="nav-links">
        <a href="/insights" class="nav-link" aria-current="page">Insights</a>
        <a href="/ugs" class="nav-link">UGS</a>
        <a href="/ugs#cta" class="btn btn-primary">Discuss a Pilot</a>
      </div>
    </div>
  </nav>

  <main id="main">
    <header class="insights-index-header">
      {breadcrumb}
      <h1>Technical Insights</h1>
      <p class="insights-index-intro">Practical, source-linked articles on underground natural gas storage evidence workflows, procedure gap analysis, and where applied AI can and cannot help technical and compliance teams.</p>
    </header>

    <section class="insights-index-list" aria-label="Articles">
      {cards_html}
    </section>
  </main>

  <footer>
    <div class="footer-inner">
      <a href="/" class="logo" style="text-decoration:none;">
        <div class="logo-mark">K</div>
        Kataba
      </a>
      <span class="footer-copy">AI knowledge retrieval for geoscience, subsurface, and technical energy teams.</span>
      <nav class="footer-links" aria-label="Footer">
        <a href="/insights" aria-current="page">Insights</a>
        <a href="/ugs">UGS Solution</a>
        <a href="mailto:hello@kataba.ai">Contact</a>
      </nav>
    </div>
    <p class="footer-disclaimer">Kataba supports technical evidence review and does not provide legal advice or make autonomous regulatory-compliance determinations.</p>
  </footer>

  <script src="/assets/site.js"></script>
  <script src="/assets/insights.js"></script>
</body>
</html>
"""


def render_index_card(article):
    return f"""<article class="insight-card">
      <p class="eyebrow">{article.category_label}</p>
      <h2><a href="{article.url_path}">{html_lib.escape(article.title)}</a></h2>
      <p class="insight-card-excerpt">{html_lib.escape(article.excerpt)}</p>
      <p class="insight-card-meta">{article.date_display} &middot; {article.reading_minutes} min read</p>
      <a href="{article.url_path}" class="insight-card-link" data-analytics-cta="index-card">Read the article &rarr;</a>
    </article>"""


def build():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    articles = load_articles()
    published = [a for a in articles if not a.draft]

    for article in articles:
        out_dir = os.path.join(OUTPUT_DIR, article.slug)
        os.makedirs(out_dir, exist_ok=True)
        html_out = ARTICLE_TEMPLATE.format(
            meta_title=html_lib.escape(article.meta_title),
            meta_description=html_lib.escape(article.meta_description),
            robots_tag=HEAD_META_ROBOTS_DRAFT if article.draft else "",
            canonical_url=article.canonical_url,
            og_image=f"{SITE_ORIGIN}/assets/insights-{article.slug}-og.png",
            date_iso=article.date_iso,
            date_modified_iso=article.date_modified_iso,
            article_jsonld=json.dumps(render_article_jsonld(article)),
            breadcrumb_jsonld=json.dumps(render_breadcrumb_jsonld(article)),
            slug=article.slug,
            category=article.category,
            breadcrumb=render_breadcrumb(article),
            category_label=html_lib.escape(article.category_label),
            title=html_lib.escape(article.title),
            excerpt=html_lib.escape(article.excerpt),
            author=html_lib.escape(article.author),
            date_display=article.date_display,
            reading_minutes=article.reading_minutes,
            toc_html=render_toc_html(article.toc),
            body_html=article.body_html,
        )
        with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(html_out)

    cards_html = "\n      ".join(render_index_card(a) for a in published) or (
        '<p class="insights-index-empty">More technical articles are coming soon.</p>'
    )
    index_html = INDEX_TEMPLATE.format(breadcrumb=render_breadcrumb(), cards_html=cards_html)
    with open(os.path.join(OUTPUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html)

    write_sitemap(published)
    update_cross_links(published)

    return articles, published


# ── sitemap.xml regeneration (preserves the two existing static URLs) ────
def write_sitemap(published):
    urls = [
        ("https://kataba.ai/", "1.0"),
        ("https://kataba.ai/ugs", "0.9"),
        ("https://kataba.ai/insights", "0.7"),
    ]
    for a in published:
        urls.append((a.canonical_url, "0.6"))

    entries = "\n".join(
        f"  <url>\n    <loc>{url}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>{priority}</priority>\n  </url>"
        for url, priority in urls
    )
    sitemap = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{entries}\n</urlset>\n'
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap)


# ── Homepage / UGS cross-link card injection ─────────────────────────────
HOMEPAGE_MARKER_START = "<!-- INSIGHTS:LATEST:START -->"
HOMEPAGE_MARKER_END = "<!-- INSIGHTS:LATEST:END -->"
UGS_MARKER_START = "<!-- INSIGHTS:RELATED:START -->"
UGS_MARKER_END = "<!-- INSIGHTS:RELATED:END -->"


def _replace_between(text, start_marker, end_marker, new_inner):
    pattern = re.compile(re.escape(start_marker) + r".*?" + re.escape(end_marker), re.DOTALL)
    replacement = start_marker + new_inner + end_marker
    if pattern.search(text):
        return pattern.sub(replacement, text)
    return text


def update_cross_links(published):
    if not published:
        latest_html = ""
        related_html = ""
    else:
        latest = published[0]
        card_inner = f"""
          <p class="eyebrow">{latest.card_label}</p>
          <h3><a href="{latest.url_path}">{html_lib.escape(latest.title)}</a></h3>
          <p>{html_lib.escape(latest.excerpt)}</p>
          <p class="insight-card-meta">{latest.date_display} &middot; {latest.reading_minutes} min read</p>
          <a href="{latest.url_path}" class="insight-card-link" data-analytics-cta="homepage-latest-insight">Read the procedure gap-analysis workflow &rarr;</a>
        """
        # Homepage: nested inline inside the existing #ugs-feature section.
        latest_html = f'\n        <div class="insight-crosslink-card">{card_inner}</div>\n        '
        # /ugs page: its own top-level section between other UGS sections.
        related_html = f"""
<section id="ugs-related-insight" class="ugs-section ugs-section--tight">
  <div class="insight-crosslink-card insight-crosslink-card--ugs">{card_inner}</div>
</section>
"""

    for rel_path, start, end, inner in (
        ("index.html", HOMEPAGE_MARKER_START, HOMEPAGE_MARKER_END, latest_html),
        (os.path.join("ugs", "index.html"), UGS_MARKER_START, UGS_MARKER_END, related_html),
    ):
        full_path = os.path.join(ROOT, rel_path)
        if not os.path.exists(full_path):
            continue
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        updated = _replace_between(content, start, end, inner)
        if updated != content:
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(updated)


def main():
    articles, published = build()
    print(f"[build_insights] Rendered {len(articles)} article(s), {len(published)} published.")
    for a in articles:
        flag = "DRAFT" if a.draft else "published"
        print(f"  - {a.slug} [{flag}] {a.reading_minutes} min, {a.word_count} words")


if __name__ == "__main__":
    sys.path.insert(0, ROOT)
    main()
