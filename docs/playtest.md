# Playtest URLs

While `PLAYTEST_URL` in `src/config.js` is `true`, the page reads options from the query string so a level can be reached without playing up to it. Set the flag to `false` for a release build and every parameter is ignored.

Base URL locally: `http://localhost:5173/` (from `make dev`). On the published site the same parameters work after `https://aaronsb.github.io/road-crosser/`.

## Parameters

| Parameter | Values | Effect |
|-----------|--------|--------|
| `start` | flag | Skip the title and coin slot, start with 4 lives |
| `battle` | flag | Like `start`, then go straight to the Air-Sea Battle |
| `level` | 1–99 | Start on this level (sky, scenery and difficulty follow the level table) |
| `force` | `road` `river` `runway` `rail` `grass` `hedge` `meadow` | Every band on the board is this scenario |
| `gauntlet` | `road` `river` `runway` `rail` | A gauntlet level of this hazard, with its faster music and bonus |
| `sky` | `day` `sunset` `night` `rain` | Override the level's sky |
| `scenery` | `forest` `residential` `city` `parking` | Override the level's scenery theme |
| `chars` | ids, comma separated | Roster. Two ids gives co-op. Ids: `chicken` `goose` `duck` `frog` `cat` `pig` `robot` |
| `coins` | 0–9999 | Coin balance after start (peeks and continues draw on it) |
| `lives` | 0–99 | Lives after start |
| `god` | flag | No deaths |
| `debug` | flag | Open the debug panel (backquote toggles it anyway) |
| `touch` | flag | Show the touch control bar on a desktop |

Flags are present-or-absent: `?god` and `?god=1` are the same.

Without `start` the options are staged and the title still shows; insert a coin as usual and they apply when the run begins. `force`, `sky`, `scenery` and `god` also persist across levels until changed in the debug panel.

## Recipes

| What to test | URL |
|--------------|-----|
| Plain level 1 as a player sees it | `/` |
| Level 3 night city | `/?start&level=3` |
| Level 8 difficulty curve on roads only | `/?start&level=8&force=road&god` |
| River traffic with divers at high difficulty | `/?start&level=7&force=river&coins=50` |
| Runway planes at night with headlights | `/?start&force=runway&sky=night&god` |
| Rail crossings, all three train types | `/?start&force=rail&god&coins=50` |
| Hedge tunnels and the peek economy | `/?start&force=hedge&coins=20` |
| Hunting maze in the parking theme | `/?start&force=grass&scenery=parking&coins=30` |
| Road gauntlet with the fast music | `/?start&level=4&gauntlet=road` |
| Rain river gauntlet | `/?start&gauntlet=river&sky=rain&god` |
| Co-op goose and cat | `/?start&chars=goose,cat` |
| Character select with the pig preselected | `/?chars=pig` |
| Straight into a night battle | `/?battle&level=3` |
| Battle at high difficulty | `/?battle&level=9` |
| Continue screen economics | `/?start&lives=1&coins=60` then die |
| Game over with an empty pocket | `/?start&lives=1&coins=0` then die |
| Touch controls on a desktop | `/?start&touch` |
| Odd-weather opener, forced | `/?start&sky=sunset` |

## Verifying from the shell

`make smoke S=<scenario>` and `make shots` drive the same builds headlessly; see `scripts/smoke.mjs` for the scenario list.
