import { execSync } from "child_process";
import { appendFileSync } from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const { TRELLO_KEY, TRELLO_TOKEN, ANTHROPIC_API_KEY } = process.env;

const BOARD_ID = "6980cd98dbe3f773d864d557";

// --- Trello helpers (native fetch) ---

function trelloUrl(path, extra = {}) {
  const params = new URLSearchParams({
    key: TRELLO_KEY,
    token: TRELLO_TOKEN,
    ...extra,
  });
  return `https://api.trello.com/1${path}?${params}`;
}

async function trelloGet(path) {
  const res = await fetch(trelloUrl(path));
  if (!res.ok) throw new Error(`Trello GET ${path} failed: ${res.status}`);
  return res.json();
}

async function trelloPost(path, body = {}) {
  const res = await fetch(trelloUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Trello POST ${path} failed: ${res.status}`);
  return res.json();
}

// --- Git ---

function getRecentCommits() {
  const log = execSync(
    `git log --since="7 days ago" --pretty=format:"%h|%s|%b|%ad" --date=short`,
    { encoding: "utf8" }
  );

  if (!log.trim()) return null;

  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, body, date] = line.split("|");
      return { hash, subject, body, date };
    })
    .filter(
      (c) =>
        c.subject.toLowerCase().includes("admin") ||
        c.body?.toLowerCase().includes("admin") ||
        c.subject.toLowerCase().includes("semester") ||
        c.subject.toLowerCase().includes("payment") ||
        c.subject.toLowerCase().includes("broadcast") ||
        c.subject.toLowerCase().includes("dashboard") ||
        c.subject.toLowerCase().includes("family") ||
        c.subject.toLowerCase().includes("media")
    );
}

// --- Claude ---

async function generateStories(commits) {
  const commitText = commits
    .map((c) => `[${c.date}] ${c.subject}${c.body ? " — " + c.body : ""}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are a technical project manager for AYDT, a dance school
registration platform. You are focused ONLY on the admin portal — the
internal tool used by AYDT staff to manage semesters, families, payments,
broadcast emails, and the media library.

Given a list of git commits, generate Trello user stories for the admin board.

Return ONLY valid JSON — no markdown, no explanation — in this format:
[
  {
    "name": "Short card title",
    "desc": "As an admin, [what was built/fixed] so that [outcome].",
    "list": "Done",
    "labels": ["Frontend" | "Backend" | "Infra" | "Payments" | "Auth" | "Email" | "SMS"]
  }
]

Group related commits into single stories where appropriate.
Omit trivial commits (version bumps, typo fixes, merge commits).`,
      messages: [
        {
          role: "user",
          content: `Here are this week's admin-related commits from the AYDT codebase:\n\n${commitText}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Claude API failed: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.content[0].text.trim());
}

// --- Trello board operations ---

async function getOrCreateList(name) {
  const lists = await trelloGet(`/boards/${BOARD_ID}/lists`);
  const existing = lists.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;

  const created = await trelloPost("/lists", {
    name,
    idBoard: BOARD_ID,
    pos: "bottom",
  });
  return created.id;
}

async function getLabelMap() {
  const labels = await trelloGet(`/boards/${BOARD_ID}/labels`);
  return Object.fromEntries(
    labels.filter((l) => l.name).map((l) => [l.name.toLowerCase(), l.id])
  );
}

async function createCard(listId, story, labelMap) {
  const card = await trelloPost("/cards", {
    idList: listId,
    name: story.name,
    desc: story.desc,
  });

  for (const label of story.labels || []) {
    const labelId = labelMap[label.toLowerCase()];
    if (labelId) {
      await trelloPost(`/cards/${card.id}/idLabels`, { value: labelId });
    }
  }

  return card;
}

// --- Main ---

async function run() {
  console.log("Reading AYDT git history (admin commits)...");
  const commits = getRecentCommits();

  if (!commits || commits.length === 0) {
    console.log("No admin-related commits in the past 7 days. Nothing to sync.");
    return;
  }

  console.log(`Found ${commits.length} commits. Sending to Claude...`);
  const stories = await generateStories(commits);
  console.log(`Claude generated ${stories.length} stories.`);

  const labelMap = await getLabelMap();

  for (const story of stories) {
    const listId = await getOrCreateList(story.list || "Done");
    const card = await createCard(listId, story, labelMap);
    console.log(`Created card: ${card.name}`);
  }

  appendChangelog(stories);
  console.log("Admin board sync complete.");
}

function appendChangelog(stories) {
  const date = new Date().toISOString().split("T")[0];
  const lines = stories.map((s) => `- ${s.name}`).join("\n");
  const entry = `\n## ${date} — Admin Board Sync\n${lines}\n`;
  appendFileSync("CHANGELOG.md", entry, "utf8");
}

run().catch((err) => {
  console.error("Admin sync failed:", err.message);
  process.exit(1);
});
