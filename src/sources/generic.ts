import type { ResolvedEpisode, SourceAdapter } from "./base";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface FeedEntry {
  title?: string;
  link?: string;
  guid?: string;
  audioUrl?: string;
}

type TagAttributes = Record<string, string>;

const AUDIO_PATH_PATTERN = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)(?:$|\?)/i;
const AUDIO_URL_PATTERN = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)(?:$|[?#&])/i;
const RSS_LINK_TYPE_PATTERN = /application\/(?:rss\+xml|atom\+xml)|text\/xml|application\/xml/i;

export function createGenericSourceAdapter(fetchImpl: FetchLike = fetch): SourceAdapter {
  return {
    canResolve(input: string) {
      try {
        const url = new URL(input);
        return (url.protocol === "http:" || url.protocol === "https:") && !looksLikeAudioUrl(url);
      } catch {
        return false;
      }
    },
    async resolve(input: string) {
      const response = await fetchImpl(input, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch podcast page: ${response.status} ${response.statusText}`);
      }

      const directAudioResponse = resolveDirectAudioResponse(input, response);
      if (directAudioResponse) {
        return directAudioResponse;
      }

      const html = await response.text();
      return resolveGenericEpisodeFromHtml({
        inputUrl: input,
        html,
        fetchImpl,
      });
    },
  };
}

export async function resolveGenericEpisodeFromHtml(options: {
  inputUrl: string;
  html: string;
  fetchImpl: FetchLike;
}): Promise<ResolvedEpisode> {
  const canonicalUrl = extractCanonicalUrl(options.inputUrl, options.html);
  const directAudioUrl = extractAudioUrlFromHtml(canonicalUrl, options.html);
  const title = extractTitle(options.html);
  const source = new URL(canonicalUrl).hostname;

  if (directAudioUrl) {
    return buildResolvedEpisode({
      source,
      canonicalUrl,
      title,
      audioUrl: directAudioUrl,
    });
  }

  const feedLinks = extractFeedLinks(canonicalUrl, options.html);
  for (const feedLink of feedLinks) {
    const response = await options.fetchImpl(feedLink, {
      headers: {
        Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      continue;
    }

    const feedXml = await response.text();
    const entry = matchFeedEntry(parseFeedEntries(feedXml), canonicalUrl, options.inputUrl);
    if (!entry?.audioUrl) {
      continue;
    }

    return buildResolvedEpisode({
      source,
      canonicalUrl,
      title: title ?? entry.title,
      audioUrl: entry.audioUrl,
    });
  }

  throw new Error("Could not extract podcast audio from the provided page.");
}

export function extractAudioUrlFromHtml(baseUrl: string, html: string): string | undefined {
  const candidates = [
    ...extractMetaAudioCandidates(html),
    extractAudioTagSrc(html),
    extractSourceTagSrc(html),
    extractJsonLdAudioUrl(html),
  ];

  for (const candidate of candidates) {
    const resolved = resolveUrl(baseUrl, candidate);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

export function extractFeedLinks(baseUrl: string, html: string): string[] {
  const links = new Set<string>();

  for (const tag of collectTags(html, "link")) {
    const attributes = parseTagAttributes(tag);
    const rel = attributes.rel ?? "";
    const type = attributes.type ?? "";
    const href = attributes.href;

    if (!hasRelToken(rel, "alternate") || !RSS_LINK_TYPE_PATTERN.test(type)) {
      continue;
    }

    const resolved = resolveUrl(baseUrl, href);
    if (resolved) {
      links.add(resolved);
    }
  }

  return [...links];
}

export function parseFeedEntries(feedXml: string): FeedEntry[] {
  const rssItems = collectBlockMatches(feedXml, "item").map(parseRssItem);
  const atomEntries = collectBlockMatches(feedXml, "entry").map(parseAtomEntry);

  return [...rssItems, ...atomEntries].filter((entry) => Boolean(entry.audioUrl));
}

function parseRssItem(itemXml: string): FeedEntry {
  const enclosureAttributes = findFirstTagAttributes(itemXml, "enclosure");

  return {
    title: decodeXmlEntities(extractTagText(itemXml, "title")),
    link: decodeXmlEntities(extractTagText(itemXml, "link")),
    guid: decodeXmlEntities(extractTagText(itemXml, "guid")),
    audioUrl: decodeXmlEntities(enclosureAttributes?.url),
  };
}

function parseAtomEntry(entryXml: string): FeedEntry {
  const linkTags = collectTags(entryXml, "link");
  let link: string | undefined;
  let audioUrl: string | undefined;

  for (const tag of linkTags) {
    const attributes = parseTagAttributes(tag);
    if (!link && attributes.href && !hasRelToken(attributes.rel ?? "", "enclosure")) {
      link = attributes.href;
    }

    if (!audioUrl && attributes.href && hasRelToken(attributes.rel ?? "", "enclosure")) {
      audioUrl = attributes.href;
    }
  }

  return {
    title: decodeXmlEntities(extractTagText(entryXml, "title")),
    link: decodeXmlEntities(link),
    guid: decodeXmlEntities(extractTagText(entryXml, "id")),
    audioUrl: decodeXmlEntities(audioUrl),
  };
}

function matchFeedEntry(entries: FeedEntry[], ...urls: string[]): FeedEntry | undefined {
  const comparableUrls = new Set(urls.map(normalizeComparableUrl).filter(Boolean));

  return entries.find((entry) => {
    const entryUrls = [entry.link, entry.guid].map(normalizeComparableUrl).filter(Boolean);
    return entryUrls.some((entryUrl) => comparableUrls.has(entryUrl));
  });
}

function buildResolvedEpisode(options: {
  source: string;
  canonicalUrl: string;
  title?: string;
  audioUrl: string;
}): ResolvedEpisode {
  const episodeId = deriveEpisodeId(options.canonicalUrl, options.audioUrl, options.title);
  const hostName = options.source.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return {
    source: options.source,
    canonicalUrl: options.canonicalUrl,
    episodeId,
    title: options.title,
    audioUrl: options.audioUrl,
    suggestedBaseName: `${hostName}-${episodeId}`,
    audioExtension: normalizeAudioExtension(options.audioUrl),
  };
}

function resolveDirectAudioResponse(
  inputUrl: string,
  response: Response
): ResolvedEpisode | undefined {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const audioUrl = response.url || inputUrl;

  if (!looksLikeAudioResponse(audioUrl, contentType, contentDisposition)) {
    return undefined;
  }

  const audioExtension =
    normalizeAudioExtension(audioUrl) ??
    extractAudioExtensionFromContentDisposition(contentDisposition) ??
    extractAudioExtensionFromContentType(contentType) ??
    ".audio";
  const suggestedBaseName = deriveDirectAudioBaseName(audioUrl, contentDisposition);

  return {
    source: "remote-audio-url",
    canonicalUrl: inputUrl,
    episodeId: suggestedBaseName,
    audioUrl,
    suggestedBaseName,
    audioExtension,
  };
}

function extractCanonicalUrl(inputUrl: string, html: string): string {
  const canonicalLink = collectTags(html, "link")
    .map(parseTagAttributes)
    .find((attributes) => hasRelToken(attributes.rel ?? "", "canonical"))?.href;

  const canonical = canonicalLink ?? extractMetaContent(html, "og:url");
  return resolveUrl(inputUrl, canonical) ?? inputUrl;
}

function extractTitle(html: string): string | undefined {
  return (
    extractMetaContent(html, "og:title") ??
    decodeXmlEntities(extractFirstMatch(html, /<title>([\s\S]*?)<\/title>/i))?.trim()
  );
}

function extractMetaAudioCandidates(html: string): string[] {
  const properties = [
    "og:audio",
    "og:audio:secure_url",
    "twitter:player:stream",
    "twitter:audio:src",
  ];

  return properties
    .map((property) => extractMetaContent(html, property))
    .filter((value): value is string => Boolean(value));
}

function extractMetaContent(html: string, property: string): string | undefined {
  for (const tag of collectTags(html, "meta")) {
    const attributes = parseTagAttributes(tag);
    const key = attributes.property ?? attributes.name;
    if (key?.toLowerCase() !== property.toLowerCase()) {
      continue;
    }

    return decodeXmlEntities(attributes.content);
  }

  return undefined;
}

function extractAudioTagSrc(html: string): string | undefined {
  for (const tag of collectTags(html, "audio")) {
    const candidate = parseTagAttributes(tag).src;
    if (candidate) {
      return decodeXmlEntities(candidate);
    }
  }

  return undefined;
}

function extractSourceTagSrc(html: string): string | undefined {
  for (const tag of collectTags(html, "source")) {
    const attributes = parseTagAttributes(tag);
    const candidate = attributes.src;
    const type = attributes.type ?? "";
    if (!candidate) {
      continue;
    }

    if (type.toLowerCase().startsWith("audio/") || AUDIO_PATH_PATTERN.test(candidate)) {
      return decodeXmlEntities(candidate);
    }
  }

  return undefined;
}

function extractJsonLdAudioUrl(html: string): string | undefined {
  const scripts = collectScriptContents(html, "application/ld+json");

  for (const scriptContent of scripts) {
    try {
      const parsed = JSON.parse(scriptContent) as unknown;
      const candidate = findAudioUrlInJsonLd(parsed);
      if (candidate) {
        return candidate;
      }
    } catch {}
  }

  return undefined;
}

function findAudioUrlInJsonLd(value: unknown): string | undefined {
  if (typeof value === "string") {
    return AUDIO_PATH_PATTERN.test(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = findAudioUrlInJsonLd(entry);
      if (candidate) {
        return candidate;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const directCandidates = [
    typeof value.contentUrl === "string" ? value.contentUrl : undefined,
    typeof value.embedUrl === "string" ? value.embedUrl : undefined,
    typeof value.url === "string" ? value.url : undefined,
  ];

  for (const candidate of directCandidates) {
    if (candidate && AUDIO_PATH_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  const nestedCandidates = [value.audio, value.associatedMedia, value.subjectOf];
  for (const nested of nestedCandidates) {
    const candidate = findAudioUrlInJsonLd(nested);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function deriveEpisodeId(canonicalUrl: string, audioUrl: string, title?: string): string {
  const audioBaseName = basenameFromUrl(audioUrl);
  if (audioBaseName) {
    return sanitizeSlug(audioBaseName);
  }

  const pathBaseName = basenameFromUrl(canonicalUrl);
  if (pathBaseName) {
    return sanitizeSlug(pathBaseName);
  }

  if (title?.trim()) {
    return sanitizeSlug(title);
  }

  return "episode";
}

function normalizeAudioExtension(audioUrl: string): string | undefined {
  try {
    const pathname = new URL(audioUrl).pathname;
    const match = pathname.match(/(\.[A-Za-z0-9]+)$/);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

function extractAudioExtensionFromContentDisposition(
  contentDisposition: string
): string | undefined {
  const filenameMatch = contentDisposition.match(
    /filename\*?=(?:UTF-8''|["'])?([^;"'\n]+)/i
  );
  if (!filenameMatch?.[1]) {
    return undefined;
  }

  const decoded = decodeURIComponent(filenameMatch[1]).replace(/^["']|["']$/g, "");
  const extensionMatch = decoded.match(/(\.[A-Za-z0-9]+)$/);
  return extensionMatch?.[1]?.toLowerCase();
}

function extractAudioExtensionFromContentType(contentType: string): string | undefined {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();

  switch (normalized) {
    case "audio/aac":
      return ".aac";
    case "audio/flac":
      return ".flac";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/mpeg":
      return ".mp3";
    case "audio/ogg":
      return ".ogg";
    case "audio/opus":
      return ".opus";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    default:
      return undefined;
  }
}

function basenameFromUrl(input: string): string | undefined {
  try {
    const url = new URL(input);
    const pathname = url.pathname.replace(/\/+$/, "");
    const match = pathname.match(/([^/]+?)(\.[A-Za-z0-9]+)?$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function sanitizeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "episode"
  );
}

function deriveDirectAudioBaseName(audioUrl: string, contentDisposition: string): string {
  const filenameMatch = contentDisposition.match(
    /filename\*?=(?:UTF-8''|["'])?([^;"'\n]+)/i
  );
  if (filenameMatch?.[1]) {
    const decoded = decodeURIComponent(filenameMatch[1]).replace(/^["']|["']$/g, "");
    const extension = decoded.match(/(\.[A-Za-z0-9]+)$/)?.[1];
    const baseName = extension ? decoded.slice(0, -extension.length) : decoded;
    return sanitizeSlug(baseName);
  }

  return sanitizeSlug(basenameFromUrl(audioUrl) ?? "remote-audio");
}

function resolveUrl(baseUrl: string, value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeComparableUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return value.replace(/#.*$/, "");
  }
}

function extractTagText(xml: string, tagName: string): string | undefined {
  return extractFirstMatch(xml, new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
}

function extractFirstMatch(input: string, pattern: RegExp): string | undefined {
  return input.match(pattern)?.[1]?.trim();
}

function collectTags(input: string, tagName: string): string[] {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
  return [...input.matchAll(pattern)].map((match) => match[0]);
}

function collectBlockMatches(input: string, tagName: string): string[] {
  const pattern = new RegExp(
    `<${escapeRegExp(tagName)}\\b[\\s\\S]*?<\\/${escapeRegExp(tagName)}>`,
    "gi"
  );
  return [...input.matchAll(pattern)].map((match) => match[0]);
}

function collectScriptContents(html: string, type: string): string[] {
  const contents: string[] = [];

  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const fullTag = match[0];
    const openingTag = fullTag.slice(0, fullTag.indexOf(">") + 1);
    const attributes = parseTagAttributes(openingTag);
    if (attributes.type?.toLowerCase() !== type.toLowerCase()) {
      continue;
    }

    const content = match[1]?.trim();
    if (content) {
      contents.push(content);
    }
  }

  return contents;
}

function looksLikeAudioUrl(url: URL): boolean {
  const fullUrl = url.toString();
  return AUDIO_PATH_PATTERN.test(`${url.pathname}${url.search}`) || AUDIO_URL_PATTERN.test(fullUrl);
}

function looksLikeAudioResponse(
  audioUrl: string,
  contentType: string,
  contentDisposition: string
): boolean {
  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (normalizedContentType.startsWith("audio/")) {
    return true;
  }

  if (AUDIO_URL_PATTERN.test(audioUrl)) {
    return true;
  }

  if (extractAudioExtensionFromContentDisposition(contentDisposition)) {
    return true;
  }

  return normalizedContentType === "application/octet-stream";
}

function parseTagAttributes(tag: string): TagAttributes {
  const attributes: TagAttributes = {};
  const attributePattern =
    /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name) {
      attributes[name] = value;
    }
  }

  return attributes;
}

function findFirstTagAttributes(input: string, tagName: string): TagAttributes | undefined {
  const tag = collectTags(input, tagName)[0];
  return tag ? parseTagAttributes(tag) : undefined;
}

function hasRelToken(rel: string, token: string): boolean {
  return rel
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .includes(token.toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXmlEntities(value: string | undefined): string | undefined {
  return value
    ?.replace(/&amp;/g, "&")
    ?.replace(/&quot;/g, '"')
    ?.replace(/&#39;/g, "'")
    ?.replace(/&lt;/g, "<")
    ?.replace(/&gt;/g, ">");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
