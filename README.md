# Speedcube Trainer

A speedcubing trainer that runs entirely on your own machine — no account, no
paywall, nothing sent anywhere. Built for **Roux** (it analyses CFOP too).

Connect a GAN smart cube over Web Bluetooth and it captures every move with its
timestamp, then splits solves into steps, shows where the time is going, and
measures which move of an algorithm your hands hesitate on.

## Running it

```bash
npm install
npm run dev      # open http://localhost:5173
```

Needs **Chrome or Edge** (desktop or Android) — Web Bluetooth does not exist on
Safari or iOS. It works without a smart cube too: time by spacebar, or switch on
the "keyboard cube" in Settings to try every feature.

On an Android phone, open the deployed build (it has HTTPS). See the MAC address
section below — on a phone you usually type it in once.

## The features

**1. A timer that guides the scramble.** WCA random-state scrambles. With a cube
connected, the app walks you through move by move: the next move is highlighted
and the done ones fade. Turn something wrong and the correction appears **inside
the scramble**, spliced in at the point you went off — your eyes are already
there, so there is nothing to look away for. Once the scramble is right the
scramble disappears, because there is nothing left to read: the clock and the
cube get the screen to themselves. The clock starts on your first move and stops
itself the moment the cube is solved, timed by the clock inside the cube (more
accurate than the machine's, because bluetooth latency is not in it). The
on-screen cube follows your real one while you solve — which is also how a
dropped bluetooth move shows up.

If your hands go still for three seconds mid-solve, an **Abort as DNF** button
appears — for when something has gone wrong and the solve is not worth
finishing. When a solve ends the clock keeps showing that time rather than
snapping back to zero, with the step splits, move count and TPS underneath, so
the feedback is there before you start the next one.

There are two modes, switched above the scramble:

- **speed** — an ordinary timed solve.
- **slow** — deliberate practice. The clock still runs and is still recorded,
  but the screen counts **moves** instead, and the review talks about the shape
  of the solution: moves per step against par, rather than seconds. Watching a
  clock is the surest way to stop thinking about efficiency.

Stopping the clock has **three layers**, because a single lost packet ruins a
solve: the last move leaves the cube solved; or the cube itself reports a solved
state; or your hands have been still for more than a second and the app asks the
cube directly. The time always comes from the last move recorded, so whichever
layer fires, the time is right. There is +2, DNF, inspection, and multiple
sessions.

Progress is matched on a rotation-invariant key, so **you can hold the cube any
way you like** — just perform the notation in your own frame. The key still
tells colours apart, so turning the opposite face (orange instead of red) is
still caught as a mistake.

There are **three** states rather than two, because the cube reports a half turn
as two separate quarter events — turn `U2` and after the first quarter the cube
matches no step at all. With only right and wrong, the screen would flash red
partway through every `U2` and `R2`. So:

| What you just turned | Colour | Meaning |
|---|---|---|
| the whole move, correctly | green | on to the next move |
| right face, not far enough (wrong direction included) | yellow | part way through — keep turning |
| a different face | red | now it is wrong, with the moves to undo it |

Amber gets colour and nothing else. Being halfway through a half turn is what
scrambling correctly looks like, so writing anything extra there would shove the
rest of the scramble sideways on every other move, and text that jumps around
under your eyes while you are reading it is worse than no text at all.

Turning `U'` when `U2` was wanted is yellow too: another `U'` completes the half
turn, no need to go back.

**2. Step-by-step review.** Each solve splits into FB → SB → CMLL → EO → 4b → 4c
(or Cross → F2L → OLL → PLL). Replay runs at the real cadence with the **turning
layer animated** so your eye can follow it, stops at the end of each step, and
steps move by move.

The highlight follows **the actual pieces** that step is responsible for — found
by colour, not by position — so while the first block is being built you see
those five pieces light up even though they are still scattered, and watch them
come together.

Each step's block in the ribbon is split in two: the pause before its first turn
drawn muted, then the turning itself in full colour. A step that is slow because
you sat looking at it is a different problem from one that is slow because your
hands are, and the two should not look the same. That pause belongs to the step
it precedes — the step's time already runs from the previous step's last turn —
which is now what the numbers say too.

The reconstruction is written out **grouped by step**, each line in the frame the
cube was actually being held in, with the bar under each move scaled to how long
it took. Reading each step in its own frame is what makes LSE come out as `M` and
`U` instead of drifting into `R`, `L'` and `B` partway through.

**3. Move-by-move review.** A chess-style game review, except the scale is
**fast versus slow** rather than good versus bad — the app has no idea which
move was a good choice, but it knows very well which move was slower than your
own usual pace.

The baseline is built from your own history, with three levels of fallback: that
exact move pair (`R' → U2`), then that face pair (`R → U`), then the step you
were in (FB, SB, CMLL...). That way "slow" means slow *in that situation*. A
real example from the tests: the same 200ms is **slow** after an `R` and **fast**
after a `U` — one overall number cannot tell those apart.

The result reads as a sentence: *"3.23s lost across 5 unusually slow moves. At
your usual pace on those moves, this solve would have been 14.04s."* With the
most expensive moves listed, and clicking one jumps straight to it in the replay.

**What it says about a solve.** Several things, not one, and both sides of it.
A review that only ever points at the worst thing is no use: you cannot tell
whether the rest went well, or whether the thing being criticised is the thing
that actually cost you. So it looks across the whole solve — movecount per step,
each step's share of the time, where the hands stopped, what was recognised
instantly, which step ran without a single pause — and shows a handful, taking
from each side in turn so neither drowns the other out. One step gets one remark
until the others have had their turn, because the same step said twice is one
remark wasted.

**4. Reports.** Time trend with ao5/ao12, solve structure over time, each step's
share against a reference profile, pause ratio per step, moves per step. The
"What to work on" section ranks bottlenecks by the seconds you are losing, and
separates the causes: **recognition and lookahead** (lots of pausing) versus
**execution** (low TPS) versus **solution efficiency** (too many moves) — three
causes that need three different kinds of practice.

**5. Algorithm drilling.** Type an algorithm, or **perform it on the cube and let
the app record it**. In drill mode the app sets up the case, waits for you to
turn the cube into it, then times you. Over many reps it builds a chart of the
median time for **each move** of the algorithm and points at the one you hesitate
on — usually where a regrip is needed.

Two modes: drill **one case**, or **random within a family**. The random one is a
loop you never have to interrupt: press start once, and from then on solving a
case deals the next one immediately, while the one you just did stays on screen
with its all-time best and median for that case, to read while you set the next
one up. Cases you have never drilled come up more often so nothing is skipped,
and a table of the slowest cases builds up as you go.

*One thing worth saying plainly:* the setup sequence is the algorithm reversed,
so seeing the whole thing gives the case away. That is why only **one move at a
time** is shown by default — turning it mechanically still leaves you to
recognise the case at the end. Making the setup look genuinely random the way
csTimer does would need a two-phase solver, which is not built.

The library is two levels, **family → case** (tap Sune, then pick the case
inside), with a search box and each family's drilled count, so it stays usable
with hundreds of algorithms. A family with one case selects it directly.

**Cases are recognised automatically.** Paste in an algorithm and the app works
out the orientation and permutation of the four top corners, files it under the
right family, and tells you if you already have another algorithm for the same
case. This is pure computation rather than someone's naming — Niklas is filed
alongside Sune by the machine, not by hand. The case signature is normalised for
AUF, so a `U` before the algorithm gives the same case; a `U` *after* it is
genuinely a different case, because CMLL's goal is four corners placed correctly
relative to the blocks.

## The cube's MAC address (mostly a phone problem)

GAN encrypts its bluetooth data with a key **salted from the cube's own MAC
address**, so the MAC is required rather than optional — without it every packet
decrypts to garbage. A browser can only read the MAC through
`watchAdvertisements()`, and on Chrome for Android that sits behind an
experimental flag, so on a phone you usually type it in once.

Two ways:

- **Type it once.** The app shows a dialog with instructions for finding it, and
  accepts any format (`AB:CD:EF:12:34:56`, `ab-cd-ef-12-34-56`, or
  `abcdef123456`), then remembers it. The easiest way to find it is a Bluetooth
  scanner such as nRF Connect on Android.
- **Or enable the flag.** `chrome://flags` → *Experimental Web Platform features*
  → restart Chrome. The browser then reads the MAC from the cube's advertisement.

A wrong MAC is the nastiest case: the cube still "connects" but the data is
nonsense. The app catches this by checking whether the state read back really has
nine squares of each colour, and says the MAC is wrong instead of leaving you to
guess. Delete the saved MAC in Settings and enter it again.

## When the app and the cube disagree

Two kinds of drift, two different fixes. Both buttons are always available: on
the Timer page, under *Sync* in the top bar (so they are reachable from anywhere
in the app), and in Settings.

- **The app drifted from the cube** — a move lost over bluetooth. The cube still
  remembers correctly, so *Ask the cube* is enough.
- **The cube itself is wrong** — you took it apart, or it missed one of its own
  turns. Asking again just returns the same wrong answer. Solve the cube and
  press *Cube is solved → sync*. The app sends the reset command **then asks
  again to confirm** the cube really took it, rather than blindly reporting
  success.

Or, without putting the cube down: solve it and turn **`D` four times**. Four
quarter turns of one face leave the cube exactly as it was, so there is nothing
to confuse it with. The four have to run together, in the same direction, within
a couple of seconds — turns that happen to accumulate across a solve cannot add
up to it.

It is held off entirely while a solve or a drill rep is being timed. "Nobody
would turn D four times mid-solve" turned out not to be something to rely on,
and a reset in the middle of a solve throws the solve away.

The app corrects itself from the cube whenever the cube reports a state, but only
accepts a packet **newer** than the last move applied — a stale packet arriving
late would drag the state backwards, and that is exactly why the clock sometimes
failed to stop on its own.

### Talking to the cube sparingly

Every request the app makes is a GATT write, and a cube written to several times
a second can drop the bluetooth link outright. The only thing that polls is the
timer's third stop-layer, while your hands are still, so that traffic is held to
**one request every 1.5 seconds, and at most four in a row** before it gives up
until the cube does something again. Anything you ask for by pressing a button
goes out immediately; only the automatic polling is rationed.

An exception thrown by one of the app's own event handlers also used to be able
to escape into the cube's event stream, where a render bug would look exactly
like a disconnection. Handlers are now called in isolation, and a crash anywhere
in the UI lands on an error screen you can copy rather than a blank page.

The handler itself cannot throw either, and one path in it used to. The library
builds a move as `"URFDLB".charAt(face)` plus a direction, and `charAt` returns
an **empty string** for a face outside 0-5 — so a single corrupted packet yields
a move of `""`. Applying that threw, on the one code path where a throw takes
everything after it down with it: the cube goes dead the moment you turn it. A
move that cannot be read is now logged and skipped, and the cube is asked what
it is actually showing, since skipping a turn leaves the model a move behind.

When something does go wrong, **Settings → Connection log** has the last hundred
or so events — moves with their serial numbers, every command sent, and whether
the link was closed by the app or given up by the cube. That last distinction
matters: nothing in the app can close the link on its own, so a drop that shows
as `DISCONNECTED BY CUBE` came from the radio, not from here.

## A phone as the cube's radio

A computer with no bluetooth adapter can still use the smart cube: the phone
holds the cube, the computer shows everything.

1. On the computer, **Use a phone** in the top bar → *Show a code for my phone*.
   A six-character code appears.
2. On the phone, open the same site → **Use a phone** → *This phone has the
   cube* → type the code → *Connect the cube*.
3. Leave the phone's page open. It keeps its screen awake while bridging.

From then on the computer behaves as if the cube were its own: the timer, the
scramble guide, the replay, the sync buttons. That is not a coincidence — the
phone forwards the cube's events untouched and the computer feeds them into the
same handler a local cube uses, so nothing downstream knows the difference.
Commands travel the other way, which is why *Sync* and *Cube is solved* still
work from the computer.

The keyboard cube goes across the bridge too, so the whole path can be tried
without a cube in the room.

**What the relay in the middle is:** about two hundred lines of Python on the
same VPS, listening on loopback with nginx proxying `/relay` to it. It hands out
room codes, pairs two sockets, and copies messages between them without looking
inside. It writes nothing to disk and forgets a room once both sides leave.
Codes come from a 31-character alphabet with every easily-misread character left
out, are handed out by the server rather than chosen by clients, and a room
takes exactly two sockets. What flows through is cube moves — but anyone who
guessed a live code mid-session could watch them, so a code is good for one
session and no longer.

It is **deployed by hand**, not by CI: the deploy key is deliberately restricted
to writing into the web directory and nothing else. See
[server/README.md](server/README.md). CI runs the relay's tests on every push,
which is the only thing keeping it honest.

## Cube display

The default is a **3D cube** you can drag to rotate (or use the arrow keys),
built with CSS transforms rather than a graphics library — the positions of all
54 squares come straight from the same coordinate model the solving engine uses.

It is built from 26 little boxes rather than a block with stickers stuck to it.
That only matters when a layer turns: turn a box and the black plastic goes round
with the colour, and the inside of the cube shows in the gap, the way it does in
your hands. Rotating stickers over a body that stays put reads as stickers
peeling off. Turns are animated wherever the cube is shown live, not only in the
replay, and a move arriving mid-turn lands the previous one rather than falling
behind your hands.
The replay page has a quick toggle to the flat net when you want all six faces at
once; change the default in Settings.

There is also an option for the on-screen cube to **follow the real cube's
gyroscope**. It is off by default and marked experimental: the axis conversion
has not been verified against a real cube, so if it spins the wrong way, turn it
off.

## Why reading the moves takes care

A smart cube's sensors only measure the six faces turning **relative to the
core**. And a slice move turns the core itself. Which means:

| You do | The sensors report |
|---|---|
| `M` | two events, `R` then `L'` |
| `r` | `L` |
| `x` `y` `z` | nothing at all |

And after a move like that, **every later move arrives in a rotated frame**. A
real example from the app's tests: perform `R U R' U' M' U R U' r'` and the cube
reports `R U R' U' R' L F R F' L'`.

For Roux this matters a great deal, since LSE is almost entirely `M`. The app
handles it two ways:

- **Step detection does not depend on how you hold the cube.** Every condition is
  tested against all 24 orientations ("there exists an orientation in which FB is
  done"). However far the frame drifts, it makes no difference.
- **Drilling matches on cube state, not move names.** It uses a canonical
  rotation-invariant key, so `r` or `L`, `M` or `R L'`, are all accepted equally.

The notation shown is merged back the other way (`R` + `L'` close together → `M`)
so it reads properly.

One thing the app **cannot** do: tell a real `r` from a real `L`, because the two
leave the cube in the same state, differing only by a whole-cube rotation. Face
sensors have no way to know. There the notation says `L`. (In theory the
gyroscope could guess, but hands shake during a fast solve, so it is not
trustworthy.)

The same goes for `x`, `y` and `z`: rotating the whole cube turns no face
relative to the core, so there is simply nothing for the cube to report. The
rotations in the reconstruction are **inferred, not measured** — when a step is
recognised in a different orientation from the one before it, the solver must
have rotated the cube in between, and that is what gets named. They are drawn in
a dashed outline to keep the distinction visible, and they only ever appear
between steps, never inside one.

## Two bugs only a real cube could expose

### The slice identity

The full identity is **`M = R L' x'`**. The first version merged `R` + `L'` into
`M` but dropped the `x'`: the model was left rotated while **every later move was
still applied in the old frame**. The state was wrecked rather than merely
rotated, so no step was ever detected and the step split came out empty.

The synthetic tests missed it because their two halves of each `M` were ~250ms
apart and never reached the merge window. A real cube reports them **6–121ms**
apart. The repo now carries real solves as regression fixtures
([src/analysis/fixtures/realSolve.ts](src/analysis/fixtures/realSolve.ts)).

The fix: each time a slice move is reconstructed, **conjugate all the remaining
moves** by the matching rotation — exactly the inverse of
[src/cube/sensorSim.ts](src/cube/sensorSim.ts). The result differs from the true
state by at most a whole-cube rotation, which every part of the analysis can take.

### Whose colours the first block is

Testing against all 24 orientations moves the *positions* the state is read at,
but the colours stay pinned where they are. So the detector could only ever
recognise the one block whose colours the app calls bottom-left. A solver picks
their own first block and holds the cube however they like, so the block they
build may be any of the twelve — and when it was not the matching one, nothing
was detected until the cube was fully solved and all six steps landed on the last
move at once.

It is easy to hit: the cube reports white on U, so anyone solving with white on
the bottom is building what the app reads as the *top* left block. The very first
real solve captured happened to use the matching colours, which is why it looked
fine and the bug hid behind it.

The fix is to relabel the colours as well: the scan tries each of the 24 colour
schemes and keeps the reading that holds together best, scored on how many
distinct step boundaries it produces. A wrong scheme does not fail loudly — it
piles every step onto the final move — so counting distinct boundaries is what
separates them.

### A third, at the same time

The EO and 4b conditions demanded the four corners be right **including the U
layer's rotation**. But LSE spins the U layer constantly, so the corners were
almost always "not done" and the whole of LSE collapsed into one lump. Those two
steps now use a frame set of 24 orientations × 4 AUF positions (turning U never
touches either block, so it stays safe).

## Tests

```bash
npm test            # 424 assertions, runs in a few seconds
npm run test:relay  # the relay, driven through a real socket (needs server/venv)
npm run check:lse   # walks all 184,320 states of the LSE group ⟨M, U⟩
```

The cube engine is verified by invariants rather than hand-typed tables: the
facelet string after `F R` matches the Kociemba reference the GAN library uses,
`M = R L' x'`, `r = L x`, `(R U R' U')⁶ = e`, T-perm is an involution, the
rotation group has exactly 24 elements, and every permutation is a bijection.

Step detection is tested against a Roux solve built backwards from solved, each
step using only moves that preserve the previous ones. The three checks that
matter most:

- The six step boundaries are detected **to the exact move**.
- The result is **unchanged** when each state is rotated differently (simulating
  a drifting frame).
- The result is **unchanged** on a move stream simulated the way the sensors
  actually report it.
- The result is **unchanged** under all 24 colour schemes.

A generator has also run 60 random valid Roux solves with no boundary missed. And
three REAL solves from the cube serve as regression fixtures — synthetic data
caught neither the slice-merging bug nor the colour-scheme one (see above).

The scramble guide has its own tests for the real situations: turning correctly,
turning the opposite face, turning the wrong way, going several moves off track
and following the fix back, undoing a move, and losing the connection partway
(where the app invents no fix).

## A production-only trap

WCA random-state scrambles come from cubing.js, generated in a Web Worker. That
worker shares the module graph with the app, so its chunk imports the entry chunk
and calls the `__vitePreload` helper as it loads — and that helper touches
`document` to insert preload tags, which a worker does not have. The worker dies,
and the app **keeps working** while silently falling back to random-move
scrambles. The dev server is unaffected; only a build shows it.

Three layers of defence, each with its reason written where it lives:

- `modulePreload: false` and `cssCodeSplit: false` in
  [vite.config.ts](vite.config.ts) — so `__vitePreload` gets an empty list and
  returns early without touching `document`.
- [src/main.tsx](src/main.tsx) wraps every DOM side effect behind
  `typeof document`, because that entry file really is loaded in a worker context.
- The UI shows a `random-move` badge next to the New button when the fallback is
  in use — so if it ever breaks again it is visible rather than silent.

## Two places the app deliberately reads things strictly

**1. When EO counts as done.** The criterion: all 6 edges oriented *and* the M
slice aligned. The alignment clause sounds redundant but is not — the "EO done"
set has to be invariant under 4b's move group ⟨M2, U⟩ (doing 4b must not break
EO). A looser rule that also accepted the M slice 90° off is not invariant under
`U`: a single `U` mixes the M-slice edges with UL/UR into a half-right state. Run
`npm run check:lse` to see it: of the 5,760 states with all 6 edges oriented,
exactly half have the M slice off.

*What this means for you:* if you finish 4a with the middle slice still 90° off,
the app marks EO slightly later than you would, and that time counts towards 4b.
The FB/SB/CMLL boundaries and total LSE are unaffected.

**2. A wide `r` is recorded as `L`.** Not fixable (see the table above). The
replay notation shows `L`. Step splitting and drill scoring are unaffected, since
both are designed to be invariant under whole-cube rotation.

## Adjusting the reference profile

The step shares used for comparison live in `REFERENCE` in
[src/analysis/recommend.ts](src/analysis/recommend.ts), set for a 20–30s solver.
Once you are faster, change them to match your own target.

## Data

It lives in the browser's IndexedDB. Clearing your browser data wipes it, so
export a backup from Settings now and then.

## Deployment

Live at **https://cube.dash.id.vn**

Every push to `main` runs GitHub Actions
([.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml)):

1. `npm ci` → `npm run typecheck` → `npm test` → `npm run build`
2. Only if all of that is green, rsync `dist/` to the server
3. Call the site back; anything but a 200 fails the run

The rsync step retries up to 4 times: the route from GitHub's runner to the VPS
drops packets now and then (showing up as `connection timed out`), which has
nothing to do with the code.

Pull requests run step 1 only — no deploy.

### Infrastructure

| Component | Configuration |
|---|---|
| Server | Ubuntu 22.04, nginx (shares the machine with `casino.dash.id.vn`, kept separate) |
| Webroot | `/var/www/cube.dash.id.vn` |
| TLS | Let's Encrypt, renewed by `certbot.timer` |
| DNS | Cloudflare (proxied) → origin `160.187.247.2` |

### About the deploy key

CI does **not** use `root`. There is a dedicated `cubedeploy` user whose SSH key
is forced to run exactly one command:

```
command="/usr/bin/rrsync /var/www/cube.dash.id.vn",no-pty,no-port-forwarding,...
```

So if the GitHub secret leaks, whoever has it can only write files into that one
web directory — no shell, no reaching the other site. Verified: running
`id; cat /etc/shadow` with that key is refused.

The server's host key is pinned in the `DEPLOY_KNOWN_HOSTS` secret rather than
fetched with `ssh-keyscan` at run time, so the server cannot be swapped mid-route.

### The TLS challenge directory

`/.well-known/acme-challenge/` is pointed at `/var/www/acme`, **outside** the
webroot. The reason: the deploy uses `rsync --delete`, so everything inside the
webroot is wiped each time, and an ACME directory in there would break the next
certificate renewal.

### Deploying by hand

```bash
npm run build
rsync -az --delete dist/ root@160.187.247.2:/var/www/cube.dash.id.vn/
```
