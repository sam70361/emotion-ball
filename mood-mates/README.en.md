<div align="center">

# Mood Mates · Original Character Emotion Engine

**2 original cartoon characters × 32 emotion states, driven in real time by pure SVG + vanilla JavaScript. Zero frameworks, zero image assets.**

[中文](README.md)

</div>

---

Mood Mates is a character emotion engine for AI assistants, customer-service bots, and desktop pets. Each character has its own silhouette, eye style, mouth shapes, palette, and FX skin, while sharing a single choreography of 32 emotion states. Your AI outputs one `emotionId` and the character performs the matching emotion in real time.

## The Cast

| Character | Vertical | Silhouette | Eyes | Signature move |
| --- | --- | --- | --- | --- |
| **Nimbo** | General (default) | Cloud | Bean eyes | Cloud fluff bloom |
| **Twinkle** | General | Rounded star | Iris eyes + glasses | Star burst · orbiting pencil |

Every visual asset is generated at runtime by parametric geometry functions (`src/core/geometry.js`). The design process and parameters are documented in [docs/DESIGN-PROVENANCE.md](docs/DESIGN-PROVENANCE.md).

## Highlights

- **Zero dependencies, no build step**: include the scripts and go; everything renders as SVG;
- **Premium rendering**: multi-stop volumetric gradients, glazed highlight, bottom ambient occlusion, and a soft ground shadow that shrinks as the character bounces;
- **Physically correct eyes**: iris eyes are layered under an eyelid clipPath (sclera / iris / pupil / light-fixed catchlights); closing, blinking, or arch-smiling automatically switches to a dark lash line — pupils can never float over closed lids; the eyeball slides inside the socket when gazing;
- **Accessory rig**: glasses auto-fit to the actual eye positions, trail the gaze, slide on blinks, and get a periodic lens glint;
- **Signature moves**: celebrations and idle antics are never a generic spin — the cloud blooms a ring of fluffy baby clouds, the star bursts starlight; clicking the stage fires a full celebration combo (signature move + a random spin or bounce + confetti);
- **Characters are data**: one character = one self-contained data file — copy it, tweak the parameters, and you have a new character without touching engine code;
- **Semantic slots + per-emotion contours**: the shared emotion base references semantic eye/mouth slots; characters can define bespoke contours per emotion via `eyeShapes` / `mouthShapes`;
- **AI protocol**: wire up with one call — `handleAIMessage({ emotionId, tips })`; unknown IDs fall back to idle, never a blank screen;
- **Emotion taxonomy**: `00-09` lifecycle / `10-29` emotions / `30-49` agent working states / `50+` runtime custom;
- **Production plumbing**: idle strategies, shared rAF heartbeat across instances, off-screen frame pausing, static thumbnail rendering, sketch mode, bilingual showcase site.

## Quick Start

```html
<script src="src/core/geometry.js"></script>
<script src="src/core/render.js"></script>
<script src="src/core/features.js"></script>
<script src="src/core/fx.js"></script>
<script src="src/data/emotions.js"></script>
<script src="src/core/engine.js"></script>
<script src="src/characters/nimbo.js"></script>

<div id="mate" style="width:200px;height:200px"></div>
<script>
  var mate = MoodMates.create(document.getElementById('mate'), {
    character: 'nimbo', emotion: '02', idle: true
  });
  mate.handleAIMessage('{"emotionId":"10","tips":"All done!"}');
</script>
```

To preview the showcase locally, serve the repo root with any static server (e.g. `python -m http.server`) and open `index.html`.

## Documentation

- [Integration Guide](docs/INTEGRATION.md) — SDK options, AI protocol, events & methods, multi-instance performance, Electron desktop pets
- [Character Design Guide](docs/CHARACTER-DESIGN.md) — create a new character from scratch (body generators / eye style / palette / features / accessories)
- [Design Provenance](docs/DESIGN-PROVENANCE.md) — the originality evidence chain for all visual assets
- `tools/ring-editor.html` — parametric contour editor for tuning and exporting character data

## License

Dual license:

- **Community license** ([LICENSE](LICENSE)): free for personal learning, research, and non-commercial projects;
- **Commercial license** ([LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)): required for commercial products, SaaS, and client deliverables.

All Mood Mates characters are independently created original designs. All rights reserved.
