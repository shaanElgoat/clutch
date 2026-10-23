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
| **Who's Better?** | Arcade mode: tap the higher-rated of two players before the timer runs out. Pairs get closer as your streak grows. |
| **The Grid** (daily) | A 3×3 trivia board. Rows are teams, columns are categories (a decade, a position, 90+ rated). Name a player who fits both. 9 guesses, shareable emoji grid, practice grids. |
| **Who's That?** (daily) | A Wordle-style mystery player. Each guess shows whether team, decade, position and rating match, are close, or point higher or lower. 8 guesses. |
| **2-Minute Drill** (daily) | You're down 3–7 with 2:00 left and no timeouts. Call the plays to win it. Everyone gets the same team and situation each day. |
| **Kick It** | Arcade field goals. Lock your aim, then your power, and adjust for the wind. Each make moves you back 5 yards. You have 3 misses. |
| **Packs** | Coins come from playing any mode. Open Standard, Pro or Legend packs with a flip reveal, get a free pack daily, and duplicates turn into coins. |
| **My Club** | Build a 12-man team only from cards you own (each ★ is +1 rating) and climb the Rivals ladder from Division 10 to Division 1. Three wins promote you, a loss costs a point, and promotions award packs. You can also take your club into Gameday. |
| **Friends** | Online steal-draft rooms (2–4 phones, room code) or Party mode on one phone, both with CPU rivals. Challenge links replay your exact spins and clutch calls. |

## Navigation
Five bottom tabs: **Season** (the main game, Daily Draft, friends seasons, your season stats), **Games** (the 3 daily puzzles, Draft Duel, Salary Cap, Gameday, Kick It, Who's Better), **Club** (My Club, Packs and Binder), **Trophies** and **Me**.

## Progression
Cards matter in four ways. They build **My Club**. Duplicates level cards up to ★★★. Any owned card can be played once per draft as a **Wildcard** (Season and Gameday; not Daily, challenges or online). Completing a team-decade **set** pays 300 coins, and a whole franchise pays 1,500. Coins are earned alongside XP and spent on card packs. XP and levels unlock fields (Primetime at Lv 3, Snow at 5, Retro at 8, Golden at 12). There are 36 achievements, and a card binder collects every player you draft (about 3,600 cards).

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
- Season (`SIM.OPP` 1.5, playoff CPU boost `PO_BOOST` +4/+8/+12/+17), strong draft: about 13.6 wins, 99% playoffs, about 13% reach the Super Bowl, about 2% win it, 0.2% perfect. The ring is meant to be almost impossible.
- Gameday vs the #1 team: smart play-calling wins 82%, random calling 55%, the auto-coordinator 47%. Reading the defense matters.
- Salary Cap (smart spending): wins the first round 72% of the time and the title about 6%. Draft Duel series win rate: 81% vs Rookie, 53% vs Pro, 32% vs The Shark.
- Easier arcade: Kick It has a slower aim, a smaller wind effect and a wider window. Who's Better starts at 10s, with a 5s minimum. Gameday Rookie opponents come from the bottom 30% of teams.
