import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const skillsRoot = new URL("../skills/", import.meta.url);
const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("SKILL.md is missing YAML frontmatter.");
  }

  return match[1];
}

function extractField(frontmatter, fieldName) {
  const pattern = new RegExp(`^\\s*${fieldName}:\\s*["']?(.+?)["']?\\s*$`, "m");
  const match = frontmatter.match(pattern);

  if (!match) {
    throw new Error(`Missing required frontmatter field: ${fieldName}`);
  }

  return match[1];
}

function extractDisplayName(openAiYaml) {
  const match = openAiYaml.match(/^  display_name:\s*"(.+)"\s*$/m);
  return match?.[1];
}

async function listSkillMatrix() {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    const relativeDir = `skills/${entry.name}`;
    const skillPath = join(skillsRoot.pathname, entry.name, "SKILL.md");
    let skillMarkdown;

    try {
      skillMarkdown = await readFile(skillPath, "utf8");
    } catch {
      continue;
    }

    const frontmatter = extractFrontmatter(skillMarkdown);
    const slug = extractField(frontmatter, "name");
    const version = extractField(frontmatter, "version");

    if (!semverPattern.test(version)) {
      throw new Error(
        `${relativeDir}/SKILL.md metadata.version must be semver; received "${version}".`
      );
    }

    let displayName = slug;
    let clawhubSlug = slug;
    const openAiYamlPath = join(
      skillsRoot.pathname,
      entry.name,
      "agents",
      "openai.yaml"
    );

    try {
      const openAiYaml = await readFile(openAiYamlPath, "utf8");
      displayName = extractDisplayName(openAiYaml) ?? slug;
    } catch {
      // Default to the slug when the UI metadata file is absent.
    }

    const clawhubJsonPath = join(
      skillsRoot.pathname,
      entry.name,
      "agents",
      "clawhub.json"
    );

    try {
      const clawhubConfig = JSON.parse(await readFile(clawhubJsonPath, "utf8"));
      if (typeof clawhubConfig.slug === "string" && clawhubConfig.slug.length > 0) {
        clawhubSlug = clawhubConfig.slug;
      }
    } catch {
      // Default to the skill slug when there is no ClawHub override file.
    }

    skills.push({
      clawhub_slug: clawhubSlug,
      display_name: displayName,
      path: `./${relativeDir}`,
      slug,
      version,
    });
  }

  return { include: skills };
}

process.stdout.write(JSON.stringify(await listSkillMatrix()));
