# CLUTCH: Football Draft

Spin an NFL team, draft from its **2026 roster** (new coaches, free agency, trades and the 2026 draft class), and make the call. Legends from the 1990s–2020s and last year's 2025 rosters are only in **card packs**. A bright, mobile-first PWA.

## Run it
Double-click `Play CLUTCH.bat`, or run `python serve.py`, then open http://localhost:8955. Phones on the same Wi-Fi can use the LAN address it prints.

## Modes
| Mode | What it is |
|---|---|
| **Season** (main event) | Draft 12 (QB, RB, 2 WR, TE, OL, DL, LB, CB, S, K, Head Coach), then 17 games and the playoffs. Every game plays **live**: the clock runs, the score ticks up and the play-by-play scrolls by (1x/2x/4x, or skip to the end). Close primetime and playoff games stop at 2:00 for a **Clutch Call**. Optional Blind draft and 8-second Shot Clock. |
| **Daily Draft** | Same spins worldwide, one attempt, a shareable result and a streak. |
| **Gameday** | Call every play of a full game (run, quick pass, deep shot, play-action, FG or punt) and pick a defense for every opponent drive. Defenses have readable tendencies, and the game shows what they were in after each snap. Rookie, Pro or Legend opponents. |
| **Draft Duel** | You and a CPU GM (Rookie, Pro or The Shark) steal-draft from the same spins, then play a best-of-3 series, every game live. |
| **Salary Cap** | $170M to build 12. Each spot offers a star, a starter and a bargain (2 re-rolls). Then a 4-round knockout playoff run, live. |
| **Who's Better?** | Arcade: a new real career stat every round (passing, rushing and receiving yards, sacks, INTs, games, rings, Pro Bowls). Pick who has more before the timer runs out. Data in `js/stats.js` (retired legends, regular season). |
| **The Grid** (daily) | A 3×3 trivia board. Rows are teams, columns are categories (a decade, a position, 90+ rated). Name a player who fits both. 9 guesses, shareable emoji grid, practice grids. |
| **Who's That?** (daily) | A Wordle-style mystery player. Each guess shows whether team, decade, position and rating match, are close, or point higher or lower. 8 guesses. |
| **2-Minute Drill** (daily) | You're down 3–7 with 2:00 left and no timeouts. Call the plays to win it. Everyone gets the same team and situation each day. |
| **Kick It** | Arcade field goals. Lock your aim, then your power, and adjust for the wind. Each make moves you back 5 yards. You have 3 misses. |
| **Packs** | The **only** way to get cards. Buy Standard, Pro or Legend packs with coins, and duplicates level a card up. You get 150 free coins a day, and Rivals promotions pay coins. |
| **My Club** | Build a 12-man team only from cards you own (each ★ is +1 rating) and climb the Rivals ladder from Division 10 to Division 1. Three wins promote you, a loss costs a point, and promotions award packs. You can also take your club into Gameday. |
| **Friends** | Online rooms (2–4 phones, room code) run through the Firebase Realtime Database, so they work on any network, survive app switching and support rejoining. Players who drop out get CPU picks until they return. There's also Party mode on one phone. Challenge links replay your exact spins and clutch calls. |

## Navigation
Five bottom tabs: **Season** (the main game, Daily Draft, friends seasons, your season stats), **Games** (the 3 daily puzzles, Draft Duel, Salary Cap, Gameday, Kick It, Who's Better), **Club** (My Club, Packs and Binder), **Trophies** and **Me**.

## Saving
Everything saves on the device automatically: XP, coins, cards, card levels, sets, trophies, stats, the club, daily results and puzzle guesses. Runs in progress are saved too, one slot per mode (`Store.data.runs`, the `Runs` helper in `js/ui.js`). That covers:
- Season, Daily Draft, Challenge and Party: every draft pick and every week of the season, including clutch choices.
- Draft Duel: the draft and the series.
- Salary Cap: every pick and the playoff run.
- Gameday and the daily 2-Minute Drill: every snap.
- Kick It: every kick.
- Who's Better: your streak.

Close the app at any point and a **Continue** card appears on the Season tab. Opening a mode with a run in progress offers Continue or Start over. Rivals matches lock in when they start, unopened promotion packs wait in My Club, and bought packs count the moment you pay. Online rooms are live peer-to-peer, so they can't be resumed.

## Progression
Cards come only from packs bought with coins (drafting, puzzles and rewards never add cards). Version 4 wiped every binder once and shows a one-time notice (`resetNotice`). Cards matter in four ways. They build **My Club**. Duplicates level cards up to ★★★. Any owned card can be played once per draft as a **Wildcard** (Season and Gameday; not Daily, challenges or online). Completing a team-decade **set** pays 300 coins, and a whole franchise pays 1,500. Coins are earned alongside XP and spent on card packs. XP and levels unlock fields (Primetime at Lv 3, Snow at 5, Retro at 8, Golden at 12). There are 36 achievements, and a binder that holds every card you've pulled from packs.

## Files
- `js/data.js`: 32 teams × 4 legend decades (packs) plus `SEASON25` (2025 rosters, now pack-only) and `CURRENT` (2026 rosters, used for drafts and opponents). New eras are always appended so card ids stay stable. Save data migrates claimed `-now` set keys to `-25` (`dv: 3`).
- `js/engine.js`: draft (including replace mode for upgrades), team ratings, season sim, single games. Pure and deterministic.
- `js/gameday.js`: the play-calling engine. Pure and deterministic.
- `js/club.js`: My Club and the Rivals ladder.
- `js/daily.js`: The Grid, Who's That?, 2-Minute Drill, Kick It and Packs.
- `js/ui.js`: storage, icon set, pack odds, player search sheet, XP, achievements, sound, card renderer and spin wheel. `js/draft.js` holds the draft screen, `js/season.js` the season, clutch and results screens, `js/modes.js` Gameday and Who's Better, `js/app.js` the shell, tabs and boot, and `js/net.js` online rooms.
- Tests: `node test/calib.js 400` (season balance), `node test/arena.js 400` (Salary Cap and Draft Duel odds) and `node test/gameday.js 200` (play-calling balance).
- `js/arena.js`: Draft Duel and Salary Cap. `liveCard` and `playLiveMatch` in `js/season.js` play any game live.

## Balance notes
- Season (`SIM` TDK 0.055, OPP 3, POK 0.6, SPINW 0.18): spins favour weaker rosters, so an elite (94+ OVR) team comes from only about 6% of drafts. An elite team averages about 15 wins and wins the ring about 10% of the time; overall the Super Bowl is about 2%. One re-spin per game in every mode. Check with `node test/tiers.js 500`.
- Gameday vs the #1 team: smart play-calling wins 82%, random calling 55%, the auto-coordinator 47%. Reading the defense matters.
- Salary Cap (smart spending): wins the first round 72% of the time and the title about 6%. Draft Duel series win rate: 81% vs Rookie, 53% vs Pro, 32% vs The Shark.
- Easier arcade: Kick It has a slower aim, a smaller wind effect and a wider window. Who's Better starts at 10s, with a 5s minimum. Gameday Rookie opponents come from the bottom 30% of teams.
