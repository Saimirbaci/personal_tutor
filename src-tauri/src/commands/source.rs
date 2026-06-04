//! URL / paper import — fetch an article or research paper, extract clean
//! readable text + title, and (optionally) draft a short teaching brief.
//!
//! The HTML→text extraction is a pure, testable helper (`extract_readable`)
//! backed by `scraper` selectors so it can be unit-tested without the network
//! or a Tauri `AppHandle`. The command layer handles fetching, SSRF-style URL
//! validation, body-size capping, token-budget truncation, and the optional
//! background `collect_completion` call for the teaching brief.

use std::net::IpAddr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use scraper::{ElementRef, Html, Selector};
use url::Url;

use crate::ai::{AiMessage, ProviderConfig};

/// Hard cap on the downloaded response body so an oversized page can't exhaust
/// memory (5 MB of HTML is far more than any article needs).
const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;
/// Token-safe budget for the extracted text handed to the LLM (~12k chars).
const MAX_CONTENT_CHARS: usize = 12_000;
/// Length of the plain-text preview returned for UI display.
const EXCERPT_CHARS: usize = 280;
/// Desktop browser-ish UA — some sites reject non-browser agents outright.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) PersonalTutor/0.5 Safari/537.36";

/// Tags whose text is almost always boilerplate (chrome, scripts) — any block
/// nested under one of these is dropped from the extracted content.
const BOILERPLATE_TAGS: [&str; 6] = ["nav", "footer", "header", "aside", "script", "style"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSourceRequest {
    pub url: String,
    pub config: ProviderConfig,
    /// When true, also generate a short AI teaching brief via `collect_completion`.
    #[serde(default)]
    pub generate_brief: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSummary {
    pub url: String,
    pub title: String,
    pub byline: Option<String>,
    /// Short plain-text preview of the body (for the CTA / chip).
    pub excerpt: String,
    /// Cleaned, possibly-truncated readable body fed to the tutor.
    pub content: String,
    pub word_count: usize,
    /// True when the body exceeded `MAX_CONTENT_CHARS` and was clipped.
    pub truncated: bool,
    pub teaching_brief: Option<String>,
}

/// Pure result of HTML extraction — all owned `String`s so it can cross the
/// `spawn_blocking` boundary (scraper's `Html` is not `Send`).
#[derive(Debug, Clone, PartialEq)]
pub struct ExtractedSource {
    pub title: String,
    pub byline: Option<String>,
    pub content: String,
}

/// Tauri command: fetch a URL, extract readable text, optionally draft a brief.
#[tauri::command]
pub async fn fetch_and_summarize_url(
    request: FetchSourceRequest,
) -> Result<SourceSummary, String> {
    let url = validate_public_url(&request.url)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| "Failed to initialize the fetcher.".to_string())?;

    let resp = client
        .get(url.clone())
        .send()
        .await
        .map_err(|_| "Couldn't reach that URL. Check the link and your connection.".to_string())?;

    if !resp.status().is_success() {
        return Err(format!("The source returned HTTP {}.", resp.status().as_u16()));
    }

    let bytes = read_capped(resp, MAX_BODY_BYTES).await?;
    let html = String::from_utf8_lossy(&bytes).into_owned();

    let base = url.to_string();
    let extracted = tokio::task::spawn_blocking(move || extract_readable(&html, &base))
        .await
        .map_err(|_| "Failed to parse the source page.".to_string())?;

    let (content, truncated) = truncate_content(&extracted.content, MAX_CONTENT_CHARS);

    if content.trim().is_empty() {
        return Err(
            "Couldn't extract readable text from this page. It may require JavaScript or be a PDF."
                .to_string(),
        );
    }

    let word_count = content.split_whitespace().count();
    let excerpt = make_excerpt(&content, EXCERPT_CHARS);

    let teaching_brief = if request.generate_brief {
        // Best-effort — a missing API key or provider error must not fail the
        // whole import; the teaching flow works from `content` alone.
        generate_teaching_brief(&extracted.title, &content, request.config)
            .await
            .ok()
    } else {
        None
    };

    Ok(SourceSummary {
        url: url.to_string(),
        title: extracted.title,
        byline: extracted.byline,
        excerpt,
        content,
        word_count,
        truncated,
        teaching_brief,
    })
}

/// Drains a response body into memory, stopping once `cap` bytes are reached.
async fn read_capped(resp: reqwest::Response, cap: usize) -> Result<Vec<u8>, String> {
    use futures_util::StreamExt;

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Failed while downloading the source.".to_string())?;
        if buf.len() + chunk.len() > cap {
            let remaining = cap.saturating_sub(buf.len());
            buf.extend_from_slice(&chunk[..remaining]);
            break;
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(buf)
}

/// Asks the configured provider for a concise teaching brief of the source.
async fn generate_teaching_brief(
    title: &str,
    content: &str,
    config: ProviderConfig,
) -> Result<String, String> {
    let system = "You are a study assistant. Given a source article or research paper, write a \
        concise teaching brief (4-6 sentences) capturing the core thesis, the key contributions, \
        and why it matters. Use plain prose with no preamble or headings."
        .to_string();
    let user = format!("Title: {title}\n\nSource content:\n{content}");
    let messages = vec![AiMessage {
        role: "user".to_string(),
        content: user,
    }];

    crate::commands::ai::collect_completion(messages, Some(system), config, Some(45)).await
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/// Validates that a URL is safe to fetch: http/https only, and not pointing at
/// localhost or a private/loopback/link-local address (basic SSRF guard).
pub fn validate_public_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "That doesn't look like a valid URL.".to_string())?;

    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http and https URLs are supported.".to_string()),
    }

    let host = url
        .host_str()
        .ok_or_else(|| "The URL has no host.".to_string())?
        .to_lowercase();

    if is_blocked_host(&host) {
        return Err("Refusing to fetch a local or private network address.".to_string());
    }

    Ok(url)
}

fn is_blocked_host(host: &str) -> bool {
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return true;
    }
    // `Url::host_str` returns IPv6 literals bracketed (e.g. "[::1]") — strip the
    // brackets so they parse as an `IpAddr`.
    let bare = host.strip_prefix('[').and_then(|h| h.strip_suffix(']')).unwrap_or(host);
    if let Ok(ip) = bare.parse::<IpAddr>() {
        return is_private_ip(&ip);
    }
    false
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                // unique local fc00::/7
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                // link local fe80::/10
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

/// Extracts a readable title, byline, and body text from raw HTML.
///
/// Pure and `Send`-safe (returns owned strings) so it runs inside
/// `spawn_blocking` and is trivially unit-testable with static HTML.
pub fn extract_readable(html: &str, _base_url: &str) -> ExtractedSource {
    let doc = Html::parse_document(html);
    ExtractedSource {
        title: select_title(&doc),
        byline: select_byline(&doc),
        content: select_content(&doc),
    }
}

fn select_title(doc: &Html) -> String {
    if let Some(t) = first_attr(doc, r#"meta[property="og:title"]"#, "content") {
        return t;
    }
    for sel in ["title", "h1"] {
        if let Ok(selector) = Selector::parse(sel) {
            if let Some(el) = doc.select(&selector).next() {
                let t = normalize_ws(&el.text().collect::<String>());
                if !t.is_empty() {
                    return t;
                }
            }
        }
    }
    "Untitled".to_string()
}

fn select_byline(doc: &Html) -> Option<String> {
    for query in [
        r#"meta[name="author"]"#,
        r#"meta[property="article:author"]"#,
    ] {
        if let Some(a) = first_attr(doc, query, "content") {
            return Some(a);
        }
    }
    None
}

fn select_content(doc: &Html) -> String {
    let block_sel = match Selector::parse("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote") {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    // Prefer a main-content container; fall back to the whole document.
    let root = ["article", "main", r#"[role="main"]"#]
        .iter()
        .find_map(|q| Selector::parse(q).ok().and_then(|sel| doc.select(&sel).next()));

    let mut blocks: Vec<String> = Vec::new();
    match root {
        Some(container) => {
            for el in container.select(&block_sel) {
                collect_block(&el, &block_sel, &mut blocks);
            }
        }
        None => {
            for el in doc.select(&block_sel) {
                collect_block(&el, &block_sel, &mut blocks);
            }
        }
    }

    blocks.join("\n\n")
}

fn collect_block(el: &ElementRef, block_sel: &Selector, out: &mut Vec<String>) {
    if has_boilerplate_ancestor(el) {
        return;
    }
    // Prefer leaf blocks: skip containers that themselves hold block elements,
    // so a `<li><p>…</p></li>` contributes the paragraph once, not twice.
    if el.select(block_sel).next().is_some() {
        return;
    }
    let text = normalize_ws(&el.text().collect::<String>());
    if text.chars().count() >= 2 {
        out.push(text);
    }
}

fn has_boilerplate_ancestor(el: &ElementRef) -> bool {
    el.ancestors().any(|a| {
        a.value()
            .as_element()
            .map(|e| BOILERPLATE_TAGS.contains(&e.name()))
            .unwrap_or(false)
    })
}

fn first_attr(doc: &Html, selector: &str, attr: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    let el = doc.select(&sel).next()?;
    let value = el.value().attr(attr)?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Clips `content` to at most `max_chars`, returning the (possibly clipped)
/// text and whether truncation occurred.
pub fn truncate_content(content: &str, max_chars: usize) -> (String, bool) {
    if content.chars().count() <= max_chars {
        return (content.to_string(), false);
    }
    let clipped: String = content.chars().take(max_chars).collect();
    (clipped, true)
}

fn make_excerpt(content: &str, max_chars: usize) -> String {
    let collapsed = normalize_ws(content);
    if collapsed.chars().count() <= max_chars {
        return collapsed;
    }
    let head: String = collapsed.chars().take(max_chars).collect();
    format!("{}…", head.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ARTICLE_HTML: &str = r#"
        <html>
          <head>
            <title>Scaling Laws for Neural Language Models</title>
            <meta name="author" content="Jane Researcher">
          </head>
          <body>
            <nav><a href="/">Home</a><a href="/about">About the junk menu</a></nav>
            <header>Site banner boilerplate</header>
            <article>
              <h1>Scaling Laws</h1>
              <p>Model performance scales predictably with compute and data.</p>
              <ul><li>Compute is a key axis of the power law.</li></ul>
              <script>var tracking = 'should not appear';</script>
            </article>
            <footer>Copyright boilerplate footer text</footer>
          </body>
        </html>
    "#;

    #[test]
    fn extracts_title_byline_and_body() {
        let s = extract_readable(ARTICLE_HTML, "https://example.com/paper");
        assert_eq!(s.title, "Scaling Laws for Neural Language Models");
        assert_eq!(s.byline.as_deref(), Some("Jane Researcher"));
        assert!(s.content.contains("scales predictably with compute"));
        assert!(s.content.contains("key axis of the power law"));
    }

    #[test]
    fn strips_script_nav_header_footer() {
        let s = extract_readable(ARTICLE_HTML, "https://example.com");
        assert!(!s.content.contains("should not appear"), "script leaked");
        assert!(!s.content.contains("junk menu"), "nav leaked");
        assert!(!s.content.contains("Site banner"), "header leaked");
        assert!(!s.content.contains("Copyright boilerplate"), "footer leaked");
    }

    #[test]
    fn falls_back_to_h1_then_untitled() {
        let no_title = "<html><body><h1>Just A Heading</h1><p>Body.</p></body></html>";
        assert_eq!(extract_readable(no_title, "").title, "Just A Heading");

        let nothing = "<html><body><p>Body only.</p></body></html>";
        assert_eq!(extract_readable(nothing, "").title, "Untitled");
    }

    #[test]
    fn prefers_og_title_when_present() {
        let html = r#"<html><head>
            <meta property="og:title" content="OG Headline">
            <title>Tab Title</title></head><body><p>x</p></body></html>"#;
        assert_eq!(extract_readable(html, "").title, "OG Headline");
    }

    #[test]
    fn validates_url_scheme_and_host() {
        assert!(validate_public_url("https://arxiv.org/abs/2001.08361").is_ok());
        assert!(validate_public_url("http://example.com/post").is_ok());

        assert!(validate_public_url("file:///etc/passwd").is_err());
        assert!(validate_public_url("ftp://example.com/x").is_err());
        assert!(validate_public_url("not a url").is_err());
    }

    #[test]
    fn rejects_local_and_private_hosts() {
        assert!(validate_public_url("http://localhost:8080/").is_err());
        assert!(validate_public_url("http://127.0.0.1/").is_err());
        assert!(validate_public_url("http://192.168.1.10/admin").is_err());
        assert!(validate_public_url("http://10.0.0.5/").is_err());
        assert!(validate_public_url("http://169.254.169.254/latest/meta-data/").is_err());
        assert!(validate_public_url("http://[::1]/").is_err());
        assert!(validate_public_url("http://myrouter.local/").is_err());
    }

    #[test]
    fn truncation_flags_only_when_over_budget() {
        let (out, truncated) = truncate_content("short text", 100);
        assert!(!truncated);
        assert_eq!(out, "short text");

        let long = "x".repeat(50);
        let (out, truncated) = truncate_content(&long, 10);
        assert!(truncated);
        assert_eq!(out.chars().count(), 10);
    }

    #[test]
    fn excerpt_is_bounded_and_collapsed() {
        let content = "  lots   of\n\n  whitespace   here  ".to_string();
        let ex = make_excerpt(&content, 280);
        assert_eq!(ex, "lots of whitespace here");

        let long = "word ".repeat(200);
        let ex = make_excerpt(&long, 50);
        assert!(ex.chars().count() <= 51); // 50 + ellipsis
        assert!(ex.ends_with('…'));
    }
}
