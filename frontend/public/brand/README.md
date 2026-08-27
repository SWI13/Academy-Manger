# Official SM Academy artwork

The interface renders these files. It does not draw the logo, and no component
in `src/` contains a reconstruction of it. Replace the artwork here and the
whole application follows.

## Files this directory must contain

| File | What it is | Where it appears |
| --- | --- | --- |
| `sm-academy.png` | The primary lockup: SM monogram with cap and book, `ACADEMY` beneath. **Transparent background.** | Sign-in, navigation rail, mobile drawer, page footer, certificates |
| `sm-academy-full.png` | The extended lockup: the same mark with the disciplines strip and the `SKILLS TODAY, SUCCESS TOMORROW` line. **Transparent background.** | Sign-in panel at `lg` and above |
| `icon.png` | A square app icon cropped from the mark. 512x512, transparent. | Browser tab, phone home screen |

## Requirements

- **PNG with a real alpha channel.** The interface is black, so a file with a
  baked-in black rectangle will show as a visible box against a surface that
  is never quite the same black. Export with transparency.
- **At least 3x the largest displayed size.** The largest use is the sign-in
  panel at roughly 320px wide, so 1000px wide or more.
- Do not pre-scale, re-cut, recolour or re-letter the artwork. Every size in
  the application is derived from these files at render time.

## How the interface uses them

`src/components/ui/Logo.tsx` sets a **height** and leaves the width to the
browser, so the proportions always come from the file itself. That is
deliberate: it makes stretching the logo impossible rather than merely
discouraged. If a future export has different proportions, nothing in the
code needs to change.

Until the files are present, `Logo` renders the name in type as an obvious
placeholder. It never substitutes a drawn mark.

## One thing worth doing once the files land

The red in `--sm-red` (`src/app/globals.css`) is `#ed1c24`, read off the
supplied artwork by eye. Sample the actual red from `sm-academy.png` and set
that value exactly. Note that `--accent-fill` is intentionally a shade deeper:
white text on the pure logo red measures 4.38:1 and fails WCAG AA, so filled
buttons use the deeper red while the logo keeps its own.
