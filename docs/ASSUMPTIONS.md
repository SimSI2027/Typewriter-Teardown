# Configuration and assumptions

## The machine represented

One coherent, representative **Underwood No. 5, US pica, 10-inch carriage, c.1920–1932**: gloss-black open frame;
four-bank 42-key / 84-character keyboard with glass-topped keys in nickel rims; a front-strike basket of 42 typebars;
two-colour (black over red) ribbon on two horizontal spools; carriage shift; a left-hand carriage-return / line-space
lever; the margin bell inside the left side frame. No decimal tabulator (many No. 5s had one; omitted, SIMPLIFIED).

## Classification

Every number lives in `src/params.js` with a tag.

**VERIFIED** (reliable source, see `SOURCES.md`): pica 10 characters per inch; carriage shift; line spacing 1/2/3;
bell 7 spaces before the line lock; black = upper ribbon half, red = lower, stencil = no lift; 42 typebars, 42 keys,
84 characters; ~252 mm platen; the escapement trip sequence; the pinion freewheels on return.

**ESTIMATED** (consistent inference from photographs and proportions): the hood decal (the name about 84 mm wide, centred under the
basket arch, measured against the front reference photograph) and the paper table's position under the sheet; frame 392 mm wide; key spacing 19.4 mm, key dip
14 mm, row heights; key-lever fulcrum and sublever positions; segment radius 60 mm, 45 mm below the printing line (so
every typebar is 75 mm, equidistant from the printing point); rest angle −12°; 28-tooth line-space ratchet and platen
radius 18.9 mm, chosen together so one tooth = 1/6 in; escapement wheel 36 teeth, pinion 12; shift travel 5 mm; ribbon
lift heights; spool positions; mainspring tension 9 N falling to ~8 N across the line; an 85-space writing line;
margins at columns 10 and 72.

**SIMPLIFIED** (deliberate, for clarity or feasibility):

- *Study-speed timing.* A keystroke takes 0.34 s of machine time at 1× (a real one is about 0.1 s) so the motion can be
  read. The playback slider and slow motion scale machine time. While keys are queued, live machine time catches up
  (up to 5×) so typing never lags.
- *Typebar drive.* The sublever drives the bar (linear heel pull) to 88°; the bar then flies freely to the platen, as a
  thrown typebar does. The exact Underwood sublever curves are not modelled.
- *Loose-dog step.* The loose dog's partial step waits for the slug to leave the paper (contact is instantaneous on the
  real machine), so the character lands exactly in its column.
- *Universal bar.* Drawn as an arc just outside the segment that the heels push outward, on arms to a rear rocker
  shaft. The manual has the bar pushed rearward; the direction is simplified, while the timing (trip near the end of
  the stroke, reset on the return) follows the manual.
- *Typebar slot order.* Keys fill the segment left to right across the keyboard (front row first on ties), so the links
  form a fan without crossings. The real interleave differs.
- *Line lock.* Character keys lock at the right margin; MARGIN RELEASE allows 8 more spaces until the next return.
- *Ribbon reverse.* Automatic reverse near an empty spool; the manual reverse is not modelled.
- *Paper.* One sheet of 54 usable lines; the feed rolls are drawn, but the sheet's position is the platen's arc length.
- *Shift.* Shift keys → rocking shaft → a lift rod at each side raise the subcarriage 5 mm; the manual's lift frame and
  rails are abstracted.
- *Type faces.* The characters on the slugs read correctly from the operator's side for legibility; real type faces
  are reversed and face the platen.
- *Teardown paths.* Exploded views are a didactic separation, not a service procedure. Paths are staged in
  `params.EXPLODE` / `VIEW_EXPLODE` (a part waits for the ones in front of it, or leaves its mount before it
  slides) and checked for interference on the real geometry at 25/50/75/100 % (`tests/model/geometry.test.js`).
  Assemblies that the model shows captive stay with the frame: the key levers with their sublevers, links, space
  bar, shift linkage and universal bar, and the escapement train (it drops 4 mm off its mount, out of the rack).
- *Ribbon colour selector.* One control steps black → red → stencil (on the machine it is a three-position lever).

## The authoritative model

`src/model.js` holds a session of actions (char, space, backspace, shiftDown/Up, lock, ret, spacing, color, release).
Actions never overlap. A snapshot is kept after each, so `stateAt(τ)` = pose(snapshot, active action, normalized p).

The character stroke, as fractions of its duration:

| Phase | p |
|---|---|
| key down (linkage drives the bar) | 0 – 0.30 |
| ribbon rises to its colour's height | 0.10 – 0.30 |
| bar in free flight | 0.30 – 0.36 |
| impact: the glyph appears | 0.36 |
| loose dog has tripped (universal bar ≥ 94 %); wheel turns 0.22 tooth onto the rigid dog after contact | 0.385 – 0.405 |
| rigid dog releases (universal bar < 45 %); the remaining 0.78 tooth | 0.42 – 0.49 |
| key returns | 0.44 – 0.80 |
| ribbon lowers | 0.46 – 0.72 |
| ribbon feed ratchet advances | 0.56 – 0.74 |
| bar settles on its rest | by 0.86 |
