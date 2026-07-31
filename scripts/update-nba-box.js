const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BDL_API_KEY = process.env.BDL_API_KEY;
const NBA_TEAM = process.env.NBA_TEAM || "LAL";
const BDL_BASE = "https://api.balldontlie.io/v1";

const TEAM_EMOJI = {
  ATL: "🦅", BOS: "☘️", BKN: "🏙️", CHA: "🐝", CHI: "🐂",
  CLE: "⚔️", DAL: "🐴", DEN: "⛏️", DET: "🏎️", GSW: "🌉",
  HOU: "🚀", IND: "🏎️", LAC: "⛵", LAL: "👑", MEM: "🐻",
  MIA: "🔥", MIL: "🦌", MIN: "🐺", NOP: "⚜️", NYK: "🗽",
  OKC: "⚡", ORL: "✨", PHI: "🔔", PHX: "☀️", POR: "🌹",
  SAC: "👑", SAS: "🤠", TOR: "🦖", UTA: "🎵", WAS: "🧙",
};

const NBA_TEAM_IDS = {
  ATL: 1610612737, BOS: 1610612738, BKN: 1610612751, CHA: 1610612766,
  CHI: 1610612741, CLE: 1610612739, DAL: 1610612742, DEN: 1610612743,
  DET: 1610612765, GSW: 1610612744, HOU: 1610612745, IND: 1610612754,
  LAC: 1610612746, LAL: 1610612747, MEM: 1610612763, MIA: 1610612748,
  MIL: 1610612749, MIN: 1610612750, NOP: 1610612740, NYK: 1610612752,
  OKC: 1610612760, ORL: 1610612753, PHI: 1610612755, PHX: 1610612756,
  POR: 1610612757, SAC: 1610612758, SAS: 1610612759, TOR: 1610612761,
  UTA: 1610612762, WAS: 1610612764,
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTeam(teamAbbr) {
  const { data } = await axios.get(`${BDL_BASE}/teams`, {
    headers: { Authorization: BDL_API_KEY },
  });
  return data.data.find(
    (t) => t.abbreviation.toUpperCase() === teamAbbr.toUpperCase()
  );
}

async function fetchRecentGames(teamId, count = 5) {
  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 180);

  const { data } = await axios.get(`${BDL_BASE}/games`, {
    headers: { Authorization: BDL_API_KEY },
    params: {
      "team_ids[]": teamId,
      start_date: pastDate.toISOString().split("T")[0],
      end_date: today.toISOString().split("T")[0],
      per_page: 50,
    },
  });

  return data.data
    .filter((g) => g.status === "Final")
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, count);
}

async function fetchSeasonRecord(teamId) {
  const currentYear = new Date().getFullYear();
  const season = new Date().getMonth() >= 9 ? currentYear : currentYear - 1;

  const { data } = await axios.get(`${BDL_BASE}/games`, {
    headers: { Authorization: BDL_API_KEY },
    params: {
      "team_ids[]": teamId,
      seasons: [season],
      per_page: 100,
    },
  });

  const finalGames = data.data.filter((g) => g.status === "Final");
  let wins = 0;
  let losses = 0;

  for (const game of finalGames) {
    const isHome = game.home_team.id === teamId;
    const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
    const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
    if (teamScore > oppScore) wins++;
    else losses++;
  }

  return { wins, losses, season };
}

function formatGameResult(game, teamId) {
  const isHome = game.home_team.id === teamId;
  const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
  const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
  const opponent = isHome ? game.visitor_team : game.home_team;
  const won = teamScore > oppScore;
  const prefix = isHome ? "vs" : "@";
  const result = won ? "W" : "L";
  const dateStr = new Date(game.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${won ? "✅" : "❌"} ${result} ${String(teamScore).padStart(3)}-${String(oppScore).padEnd(3)} ${prefix} ${opponent.abbreviation.padEnd(3)} (${dateStr})`;
}

function generateBarChart(percent, size) {
  const syms = "░▏▎▍▌▋▊▉█";
  const frac = Math.floor((size * 8 * percent) / 100);
  const barsFull = Math.floor(frac / 8);
  if (barsFull >= size) return syms.substring(8, 9).repeat(size);
  const semi = frac % 8;
  return [syms.substring(8, 9).repeat(barsFull), syms.substring(semi, semi + 1)]
    .join("")
    .padEnd(size, syms.substring(0, 1));
}

async function main() {
  console.log(`🏀 Fetching NBA data for ${NBA_TEAM}...`);

  const team = await fetchTeam(NBA_TEAM);
  if (!team) {
    console.error(`Team ${NBA_TEAM} not found`);
    process.exit(1);
  }

  const emoji = TEAM_EMOJI[team.abbreviation] || "🏀";

  const recentGames = await fetchRecentGames(team.id, 5);
  await delay(15000);
  const record = await fetchSeasonRecord(team.id);

  const winPct =
    record.wins + record.losses > 0
      ? ((record.wins / (record.wins + record.losses)) * 100).toFixed(1)
      : "0.0";

  const lines = [];
  lines.push(`${emoji} ${team.full_name} (${team.abbreviation})`);
  lines.push(`   ${team.conference} Conference · ${team.division} Division`);
  lines.push("");

  if (record.wins + record.losses > 0) {
    lines.push(
      `📊 ${record.season}-${record.season + 1} Record: ${record.wins}W - ${record.losses}L (${winPct}%)`
    );
    lines.push(`   ${generateBarChart(parseFloat(winPct), 25)}`);
    lines.push("");
  }

  if (recentGames.length > 0) {
    lines.push("📅 Recent Games:");
    for (const game of recentGames) {
      lines.push(`   ${formatGameResult(game, team.id)}`);
    }
  } else {
    lines.push("📅 No recent games found");
  }

  const nbaContent = lines.join("\n");
  console.log(nbaContent);

  // Update README.md between markers
  const readmePath = path.join(__dirname, "..", "README.md");
  let readme = fs.readFileSync(readmePath, "utf8");

  const startMarker = "<!-- NBA-BOX:START -->";
  const endMarker = "<!-- NBA-BOX:END -->";
  const startIdx = readme.indexOf(startMarker);
  const endIdx = readme.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error("NBA-BOX markers not found in README.md");
    process.exit(1);
  }

  const before = readme.substring(0, startIdx + startMarker.length);
  const after = readme.substring(endIdx);
  const newReadme = `${before}\n\`\`\`\n${nbaContent}\n\`\`\`\n${after}`;

  // Update logo URL
  const nbaId = NBA_TEAM_IDS[team.abbreviation] || 0;
  const logoRegex = /(<img src="https:\/\/cdn\.nba\.com\/logos\/nba\/)\d+(\/global\/L\/logo\.svg")/;
  const finalReadme = newReadme.replace(logoRegex, `$1${nbaId}$2`);

  fs.writeFileSync(readmePath, finalReadme, "utf8");
  console.log("✅ README.md updated!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
