# Design source files

Original artwork for shop cosmetics. These are **source files only**: the app
does not import anything from here. Processed assets (cut, resized, WebP) go
into `apps/expo/assets/shop/digital/`.

| Folder     | What to upload                                   | Output in app                     |
|------------|--------------------------------------------------|-----------------------------------|
| `frames/`  | Avatar frame sheets (many frames in one image)   | 512×512 transparent WebP + Lottie |
| `themes/`  | Profile header backgrounds                       | WebP + Lottie                     |
| `badges/`  | Badges shown next to the username                | WebP + Lottie                     |
| `titles/`  | Title chip icons                                 | WebP                              |
| `levels/`  | Level badges / level-up artwork (Level 1, 2, 3…) | WebP + Lottie                     |

## Upload rules

- Upload the **original** file, not a screenshot or chat preview.
- Use **PNG with a transparent background** (alpha channel). Avoid white backgrounds.
- High resolution: each item should be at least **512 px** in the sheet
  (an 8×6 frame sheet should be about 4096 px wide or more).
- Keep space between items so they do not touch each other.
- Use lowercase file names without spaces, for example `frames-sheet-01.png`.
