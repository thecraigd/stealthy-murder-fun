# Clean Slate

A cute, cel-shaded stealth sandbox in the spirit of Hitman, built with three.js. It runs in the browser on desktop and mobile.

Ten years ago you were **Rook**, the Syndicate's best "cleaner". Then they framed your little brother for a job you did. Tonight the three people responsible are partying on the Baron's island estate, **Gullcrest Key**. Take them down, harm no innocents, recover the ledger that proves your brother's innocence, and get off the island.

## The island

One hand-built level, designed to be replayed and learned:

- **The manor**: foyer (with a frisking doorman), ballroom with a stage, bar and a suspiciously wobbly chandelier, gallery, lounge, restroom, kitchen, staff quarters, security office, the Baron's study with a safe, and an aquarium with a shark called Mr. Nibbles.
- **Grounds**: the cliff-top terrace, a spa with a hot tub and massage room, the pool, Brick's gym and sauna, a garden party with a DJ, a rose garden and gazebo, a tall hedge maze, a glass greenhouse, the lighthouse, the cargo dock with a crane, the boathouse and a smuggler's cove.
- About 45 NPCs, each on a daily routine: guests, guards, waiters, chefs, gardeners, dockhands and three targets.

## Targets and ways to deal with them

Eavesdrop on gossip to discover **opportunities**. These are guided, multi-step "accidents" you can track with an on-screen marker.

| Target | Opportunities |
| --- | --- |
| Baron Silas Crowe | Drop the chandelier during his toast. Push him into the shark tank at feeding time. Poison his 60-year-old whiskey. |
| Madame Odette Vex | Poison her martini while it "breathes". Knock the radio into her hot tub. Loosen the cliff railing she leans on. Take her massage appointment yourself. Topple the gallery statue. |
| Brick Mallory | Loosen the bench-press safety pins. Lock him in the sauna and crank the heat. Drop the crane's load on him. Poison his protein shake. |

You can also snipe any of them from the lighthouse (with a bullet-cam), use rat poison to send a target running to a toilet and drown them there, or do it the old-fashioned way.

## Stealth toolkit

- **Disguises**: knock someone out and take their clothes, or find spare uniforms. Each zone tells you who's allowed in. **Enforcers** (★ in Sense mode) recognise strangers in their own uniform.
- **Blending in**: each disguise has 🎭 work spots: chop onions, polish glasses, stand guard, prune roses, or hit the dance floor. While you're doing the job, Enforcers don't look twice.
- **Suspicion meters** fill above heads. Guards warn trespassers, then attack. Illegal acts like takedowns, dragging bodies, tampering, or holding weapons are seen instantly.
- **Bodies**: drag them into dumpsters, closets, laundry baskets, bushes, the sea, or the shark tank. Bodies that get found raise the alarm. Bodies from "accidents" only cause gossip.
- **Distractions and tools**: coins, banana peels, frying pans, frozen fish, baguettes, firecrackers, wrenches, crowbars, lockpicks, keycards, poisons (deathcap, pufferfish toxin, rat poison) and a pistol for emergencies.
- **Chaos and recovery**: if you're spotted, guards shoot (with a visible aim delay) and radio for help. Break line of sight, hide, and change disguise, and the search eventually dies down. Push your luck too far and you get got.
- **Sense** shows people through walls, colour-coded by role.
- Vision cones, noise rings, kill-cams, slow-mo, and an adaptive spy-jazz soundtrack that shifts between calm, suspicious, search and combat.

## Replayability

- 40 challenges and a mastery XP track (saved in your browser).
- Mastery unlocks five more starting locations (kitchen, cargo yard, spa, security office, lighthouse) and extra starting items.
- At the end of each run you get a rating, from *Clean Slate* (never seen, no bodies found, no innocents harmed) down to *Still a Thug*.

## Controls

**Touch (landscape recommended)**

- Drag on the left side of the screen to move. Push the stick to the edge to run.
- ✋ is the main context action. ☠ is the alternate action.
- Tap the item button to use your item. Drag from it to aim a throw.
- 🥷 toggles sneaking. Hold 👁 to use Sense.
- Drag on the right side to rotate the camera, and pinch to zoom. Tap the minimap to enlarge it.

**Keyboard & mouse**

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Shift | Run |
| C | Sneak |
| E | Action |
| F | Alt action |
| Space | Use item |
| Click | Use / throw at cursor |
| T | Throw |
| 1–9 / Q | Select item |
| 0 | Empty hands |
| G | Drop item |
| Tab / V (hold) | Sense |
| Z / X, right-drag | Rotate camera |
| Wheel | Zoom |
| M | Big map |
| Esc | Pause |

## Running locally

There's no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

The repo includes `.github/workflows/pages.yml`, which publishes the site on every push to `main`. Enable it once:

1. Go to the repository **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the Actions tab).

Alternatively, choose **Deploy from a branch** with `main` and `/ (root)`. The site is plain static files, so that works too.

## Troubleshooting

Some phone GPUs mishandle one of the rendering tricks and draw a blank (white or black) view. The game checks for this itself: after the first frames it samples the picture, and if it's blank it switches optional effects off, works out which one is to blame, and remembers the fix for that device. If that isn't enough it restarts once in a safe graphics mode.

- **Settings → Blank screen? → Use safe graphics** forces safe mode by hand. Open the URL with `?safe` to do the same.
- **Settings → Graphics report** (or open the URL with `?debug`) shows the GPU, what the check found and any shader errors. A screenshot of it is the most useful bug report.
- Open the URL with `?gfxreset` to forget a saved fix.
- **"3D graphics are switched off for this page"**: after a graphics-driver crash, Chrome blocks WebGL for that site until the browser restarts. Close Chrome completely (on Android, swipe it away in recent apps) and reopen the game. It starts in safe mode after a crash.
- PowerVR GPUs (e.g. the Pixel 10) have driver bugs with GPU-skinned meshes, so on those the characters are posed on the CPU instead. `?cpuskin` forces this anywhere.

## Tech notes

- three.js r180 is vendored in `vendor/` (MIT licence, see `vendor/THREE_LICENSE`). Nothing is fetched from npm at runtime.
- Everything is procedural: the island, props and characters are built from primitives in code, with no model files.
  - Each character is a single rigidly-skinned mesh with an ink outline and procedural animation.
  - The toon materials include a screen-space cutaway, so walls between the camera and Rook dither away.
  - The ocean shader draws Wind Waker-style foam from a baked distance field.
- All sound effects and music are synthesized with the Web Audio API.
- AI uses a 0.5 m navigation grid with A* and string-pulling. Movement and sight lines use exact colliders, including 2.5D low cover: crouch behind hedges and counters to hide.
- Resolution scales down automatically if the frame rate drops. A graphics quality setting is in the menu.

### Code map

| Path | Contents |
| --- | --- |
| `src/core/` | Materials, geometry batching, collision/sight/navigation, input, audio, graphics self-check |
| `src/game/level.js`, `props.js`, `terrain.js` | The island |
| `src/game/character.js`, `outfits.js` | Characters and disguises |
| `src/game/npc.js`, `cast.js` | AI and the cast's routines and gossip |
| `src/game/player.js`, `interact.js`, `items.js` | Player verbs |
| `src/game/setpieces.js`, `story.js` | Accidents and opportunities |
| `src/game/director.js`, `challenges.js` | Alert state, rating, challenges, progression |
| `src/game/ui.js`, `menus.js`, `tips.js` | Interface |
