# Naming the game

`road-crosser` is a working title that describes the genre and nothing else. It
puts the game in the same sentence as every other Crossy Road clone, which is
the one sentence it does not belong in. This is the shortlist to replace it,
and the reasoning behind it.

## What the name has to carry

Names come from the hook, not the genre. The hook, stated plainly from what the
code actually does:

- **Coins are lives.** `LIFE_COST = 25` coins buys one life, the HUD says
  `INSERT COIN`, and peeking drains a coin a second. Looking at the board
  spends the same currency that keeps you alive.
- **The flat view lies.** Top-down hides coins under canopies, eggs under
  shelters, and the tunnel through each hedge wall — the tunnel roof matches the
  hedge exactly from above.
- **At zero coins you are stuck top-down.** That is the punished state: no
  tilt, no money, crossing on memory.

So the name should say *sight costs* or *flat and broke*, and it should sound
like a cabinet title, not a description of a genre.

## How the candidates were judged

| Test | Why |
|------|-----|
| One or two words, slug-safe | It has to work as `aaronsb/<name>` and as a page title |
| Reads as a game, not a summary | "Two And A Half" and "Nodepth" describe; they don't name |
| Survives a `"<name>" game` search | The day-to-day cost of a crowded name is being invisible |
| No live collision in games | Other categories are fine. Games are what matters |
| True to the mechanic | A name that is a lie about the game is worse than a dull one |

## Shortlist

### 1. Flat Broke — the pick

The game's lose condition, word for word. The view is flat, the pocket is
broke, and the two arrive together: spend your coins looking and you are left
top-down with nothing left to spend. It is not a pun *about* the game, it is
the state the game punishes you into, and it is in exactly the same voice as
the `INSERT COIN` HUD.

Two syllables, an idiom everyone already owns, funny without being a joke, and
it sounds like something that ships. Nothing in games is currently using it —
the search field is a Sims character, a Gary Paulsen novel and a dictionary
entry, none of which compete for a player's attention.

Against it: it says nothing about crossing or birds. A tagline handles that
("Peeking costs coins. Coins are lives."), and a name that names the *stake*
beats one that names the *genre*.

### 2. Peek Tax — runner-up

The most honest name available: looking costs you, in two words. Clean
everywhere — no game, no npm package, no notable product. Nothing in the way.

Against it: "tax" is a bloodless, product-blog sort of word, and "peek" is our
internal jargon — a player who has not read the README does not yet know the
game has a peek. It explains the game to someone who already knows it.

### 3. Overlook

The best double meaning in the whole set. To overlook is to look down over
something — the top-down camera — and to fail to notice it, which is precisely
what the flat view makes you do. One word, real word, no live game using it.

Against it: the Overlook Hotel is loud enough that a horror expectation comes
free with the name, and there is a lot of software called Overlook.

### 4. Coinsight

Invented, so completely ownable: zero collisions anywhere, and it states the
mechanic exactly — coins buy sight. Coins/insight/sight all land at once.

Against it: the seam is in an awkward place. Some readers see "coin sight",
some see "co-insight", some see "coin site". A wordmark fixes it; a spoken
recommendation does not.

### 5. Sidelong

The nicest sound of anything on the list, and literally the camera move: a
sidelong glance at a board you are meant to see from above. Free on npm, no
game using it.

Against it: it is an adjective, and a soft literary one. It suggests mood where
the game is an arcade cabinet that takes your quarters.

### 6. Peeking Duck

The joke option, taken seriously for a moment because it is not only a joke:
`makeDuck` is a real playable character, eggs and hatching are core, and the
peek is the mechanic. Memorable in one hearing.

Against it: PeekingDuck is an established computer-vision library, so the
search results are spoken for, and a pun title sets a comedy expectation the
rest of the game does not pay off.

## Ruled out, and why

| Name | Why not |
|------|---------|
| **Clutch** | Taken hard. A 2000s vehicular combat game holds the Wikipedia article, and Maverick Games — founded by the ex-Forza Horizon creative director — ships an open-world racer called CLUTCH in spring 2027, published by Focus. A driving game with a marketing budget owns "clutch game" forever |
| **Look Both Ways** | Two traffic-crossing games already on itch.io under that exact name, plus a 2022 Netflix film |
| **Flatland** | Abbott's novella is thematically perfect and therefore already used everywhere, in games and out |
| **Squint** | Good word, but there is already a Squint on itch.io, and squinting is about seeing *worse* — the game's fantasy is seeing *more*, briefly, for money |
| **Brood** | Dark connotation the game does not have, and games from StarCraft onward have worn it out |
| **Hedgerow** | Names the hedge band, which is one scenario out of nine. It undersells the game as a garden |
| **Paywall** | The joke is right there, and it is the only joke. It also reads as commentary on software, not a game |
| **Hatchline** | Fine and free, but it sounds like a logistics startup, and it names the chicks, which are a bonus system rather than the hook |
| **Tilt Toll** | Clean and accurate, but two hard T's in a row are a mouthful, and "toll" and "tilt" fight each other for stress |
| **Nodepth**, **Two And A Half** | Descriptions, not names |
| **Blind Hop**, **From Memory**, **Last Seen** | All name the memory half of the loop, which is real, but none name the cost — and "Last Seen" is a messaging-app phrase now |
| **Dead Reckoning** | Exactly the right idea — navigating from your last known fix — and completely unavailable: a 2023 Mission: Impossible film and several games |

## Putting the crossing back in

Adding "crossing" re-imports the exact problem this shortlist was built to
dodge: it is the genre word, and the genre is the least distinctive thing about
the game. One framing rescues it — **stop using it as a category and use it as
a place.** "Crossing" in "Animal Crossing" is a category. "Crossing" in
*Flat Broke Crossing* is a dot on a map, the way American rail towns are named:
Harpers Ferry, Council Bluffs, Pilot Knob. A place name is specific by
construction, which is what a category name can never be.

### Flat Broke Crossing — the combination to take

The lose condition survives intact, the genre arrives for free, and the game
gains a setting it did not have before. The title card becomes a town sign.
The attract screen can post a population that drops as you lose chicks. The
levels stop being levels and start being the outskirts of somewhere.

It also passes the test that matters for a long name: it shortens well. Nobody
will say all three words twice — in conversation it is "Flat Broke," which is
the better half. The full title does the explaining on a store page; the short
one does the work everywhere else.

Cost: five syllables, and any `___ Crossing` borrows a little air from Animal
Crossing. For a hopper with a chicken in it, that reads as a genre signal
rather than a debt.

### Level Crossing — the tightest single phrase

Three meanings stacked in two words, all of them true:

1. The railway term for a road crossing a rail line at grade — the game has
   rail bands, and trains that arrive from beyond the tilted view.
2. Crossing a level, which is the loop.
3. **Level** as in flat. The view you are stuck in when the coins run out.

Nothing else on either list does three at once, and no game holds the exact
title. The cost is that the phrase belongs to the real world: searching it
returns Wikipedia and railway safety campaigns forever, and you would never
outrank them. Compare **Grade Crossing**, the American term for the same
thing — a less crowded search, but "grade" does not carry the flat/level pun,
which is the whole reason the phrase was interesting.

### Exact Change — the toll booth read

The sign on the road, the coins in the slot, and the knife-edge economy of
25 coins a life, in two words that sound like an arcade cabinet. Clear of
games, clear on npm. It is the best *money plus road* name available.

Cost: it drops the flat. It names the currency and the crossing but says
nothing about the view, which is the half of the hook that is actually novel.

### Ruled out from this batch

| Name | Why not |
|------|---------|
| **Double Cross** | Deception plus crossing, and the deception is literal — the tunnel roof matches the hedge exactly from above, so the flat view really does double-cross you. Taken: 13AM Games' 2019 action platformer on Steam, Switch and Xbox |
| **Toll Bridge**, **Turnpike** | Honest, and inert. A turnpike is a road you drive along, not one you cross |
| **Coin Crossing** | Says both halves and sounds like an Animal Crossing riff, which is the association to avoid, not lean on |
| **Flat Out** | "Flat out broke" and "flat out" as full speed, but Bugbear's FlatOut racing series has owned it since 2004 |

## Recommendation

**Flat Broke Crossing** as the title, **Flat Broke** as what everyone actually
calls it. It keeps the one name that states the lose condition, and buys back
the genre clarity that the short name gives up.

If you want one tight phrase instead of three words, **Level Crossing** is the
cleverest thing on either list and the hardest to ever find in a search. That
trade is the whole decision.

If it goes in, the rename touches: repo name, `package.json` `name` and
`homepage`, the `<title>` in `index.html`, the title card and attract screen,
README, and the GitHub Pages URL.

## Checks run

| Check | Result |
|-------|--------|
| npm registry | `sidelong`, `peektax`, `tilttoll`, `hatchline`, `nodepth`, `flatbroke`, `tollroad`, `blindhop`, `flatbrokecrossing`, `brokecrossing`, `levelcrossing`, `exactchange`, `gradecrossing` unregistered; `clutch`, `squint`, `brood`, `flatland`, `hedgerow`, `overlook`, `oblique`, `askew`, `lastseen` taken (all irrelevant to a browser game, noted for completeness) |
| `github.com/aaronsb/*` | No collision with any shortlisted name across the 134 repos on the account |
| itch.io / Steam | Collisions found for Clutch, Look Both Ways, Squint, Double Cross, FlatOut. Flat Broke, Flat Broke Crossing, Level Crossing, Exact Change, Peek Tax, Sidelong, Overlook and Coinsight came back clear |
| `"<name>" game` attention test | Clutch is unwinnable and Level Crossing is unwinnable against the real-world term. Flat Broke, Flat Broke Crossing, Exact Change, Peek Tax and Coinsight have effectively empty fields |

**Still to do by hand:** the USPTO search in classes 9 and 41. `tmsearch.uspto.gov`
is blocked by this environment's egress policy, so it could not be run here.
Expect registrations for a phrase like "Flat Broke" in unrelated classes —
that is normal and usually fine; class 9 (downloadable software) and class 41
(entertainment services) are the two that matter.
