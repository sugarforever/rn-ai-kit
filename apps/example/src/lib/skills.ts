import { SkillEngine, type SkillDefinition } from '@pi-ai-rn/skill-engine';

export const skillEngine = new SkillEngine();

const hnCopilotSkill: SkillDefinition = {
  id: 'hn-copilot',
  name: 'HN Copilot',
  description: 'Hacker News assistant — sync top stories, search, and analyze trends',
  allowedDomains: ['hacker-news.firebaseio.com'],
  systemPrompt: `# HN Copilot

You are a Hacker News assistant. Use tools to fetch and query live HN data.

## Workflow
1. Call sync_top_stories first to fetch the latest stories
2. Use the query tool to answer questions with SQL

## Tables (after sync)
- stories: id INTEGER PRIMARY KEY, title TEXT, url TEXT, score INTEGER, by TEXT, time INTEGER, descendants INTEGER (comment count)

## Example Queries
- Top stories by score: SELECT * FROM stories ORDER BY score DESC LIMIT 10
- Stories about a topic: SELECT * FROM stories WHERE title LIKE '%AI%' ORDER BY score DESC
- Most discussed: SELECT * FROM stories ORDER BY descendants DESC LIMIT 10
- By author: SELECT * FROM stories WHERE by = 'username'`,
  tools: [
    {
      name: 'sync_top_stories',
      description: 'Fetch the current top 30 stories from Hacker News and store them in SQLite',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of stories to fetch (default 30, max 100)' },
        },
      },
      execute: `async ({ limit }) => {
  const count = Math.min(limit || 30, 100);

  // Get top story IDs
  const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const allIds = await idsRes.json();
  const ids = allIds.slice(0, count);

  // Create table
  await sqlite.exec('CREATE TABLE IF NOT EXISTS stories (id INTEGER PRIMARY KEY, title TEXT, url TEXT, score INTEGER, by TEXT, time INTEGER, descendants INTEGER)');

  // Fetch each story
  let synced = 0;
  for (const id of ids) {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json');
    const item = await res.json();
    if (item && item.type === 'story') {
      await sqlite.exec(
        'INSERT OR REPLACE INTO stories (id, title, url, score, by, time, descendants) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.title, item.url || '', item.score, item.by, item.time, item.descendants || 0]
      );
      synced++;
    }
  }

  return { synced, total_available: allIds.length };
}`,
    },
    {
      name: 'query',
      description: 'Run a read-only SQL query against the HN stories database',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL SELECT query' },
        },
        required: ['sql'],
      },
      execute: `async ({ sql }) => {
  if (!sql.trim().toUpperCase().startsWith('SELECT') && !sql.trim().toUpperCase().startsWith('WITH')) {
    return { error: 'Only SELECT queries allowed' };
  }
  const rows = await sqlite.query(sql);
  return { rows, count: rows.length };
}`,
    },
  ],
};

// Register the skill on import
skillEngine.registerSkill(hnCopilotSkill);
