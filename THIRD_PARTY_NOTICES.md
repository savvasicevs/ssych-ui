# Third-party notices

ssych ui is MIT-licensed, Copyright (c) 2026 Savva Sicevs (see `LICENSE`). Some files took
code from other open-source projects. Those portions stay under their own licences, which
are reproduced below, and the files that still carry them keep the original notice at the
top of the file. A component that was later rewritten no longer contains the third-party
code, but earlier published versions of it did (in this repository's history, in the
`@ssych` shadcn registry at ssych.com/r and ui.ssych.com/r, and in installs made from them):
those earlier copies remain under the licence listed here.

Every published component file starts with a provenance line: `// provenance: original`,
`// provenance: original, idea from <library> (<licence>)`, or
`// provenance: from <library> (<licence>)` when the file still keeps that library's code
and its notice.

## Libraries

| Library | Licence | Files | Status |
|---|---|---|---|
| Magic UI | MIT | `dot-pattern.tsx`, `flickering-grid.tsx`, `light-rays.tsx`, `noise-texture.tsx`, `progressive-blur.tsx` | Earlier versions contained Magic UI code verbatim. |
| Cult UI | MIT | `cutout-card.tsx`, `cutout-card-tokens.ts` (registry item `cutout-card`, also pulled in by `project-card`, `card-stack`, `card-grid`, `card-list`); `mock-browser-window.tsx` (registry item `browser-window`); `hover-video-player.tsx` | Earlier versions of cutout-card and browser-window contained Cult UI code. |
| Efferd | MIT | `pricing-card.tsx` (published in this repository's history) | Earlier versions contained Efferd code. |
| Watermelon UI | MIT | Site code only, not part of the component library: the site footer layout (`src/components/Footer.tsx`) and `src/components/watermelon-ui/footer-27.tsx` | Keeps Watermelon UI code; notice in each file. |
| ThreeUI by Meng To: Bestsellers Book Showcase (https://github.com/MengTo/threeui) | MIT | Site code only: the rulebook book on ssych.com/library/rulebook (`src/components/library/RulebookBook.tsx`, `rulebook-book.css`) | Keeps the showcase's mechanics; notice in each file. |
| 21st.dev community: Interactive Bento Gallery by Anurag Mishra (https://21st.dev/@anurag-mishra22/components/interactive-bento-gallery) | MIT | `interactive-bento-gallery.tsx` (registry item `bento-gallery`, also pulled in by `project-card`, `card-stack`, `card-grid`, `card-list`) | Earlier versions contained code from this item. The site's own copy (`src/components/work/interactive-bento-gallery.tsx`, site code only) still does and keeps the notice. |

Not part of ssych ui and never published as source: the site's own Images Badge
(`src/components/site-only/images-badge.tsx`) is derived from Aceternity UI, whose licence
allows it inside an end product such as the site and forbids redistributing the source. A
Frame component ported from coss ui (AGPL-3.0 since 2026-10-14, unlicensed before) was
removed on 2026-11-07; it never shipped in the registry or the public repo.

## Trademarks and sample data

MIT covers code, not trademarks. Company, product, card-network and model names and marks
that appear in a component (for example the card-network marks in `payment-card` or the
GitHub mark in `sidebar`) belong to their owners, are shown only to illustrate the
component, and imply no affiliation or endorsement. Mark shapes drawn from Simple Icons are
CC0-1.0. Names, tickers, figures, prices and news in the demo data are invented.

## Licence texts

### Magic UI

Source: https://github.com/magicuidesign/magicui

```
MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Cult UI

Source: https://github.com/nolly-studio/cult-ui

```
MIT License

Copyright (c) 2023 Jordan-Gilliam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Efferd

Source: https://github.com/shabanhr/efferd-ui

```
MIT License

Copyright (c) 2025 sshahaider

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Watermelon UI

Source: https://github.com/WatermelonCorp/watermellon-registry

```
MIT License

Copyright (c) 2025-present Watermelon Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### ThreeUI (Meng To)

Source: https://github.com/MengTo/threeui (npm `@designcodeio/threeui`)

```
MIT License

Copyright (c) 2026 Meng To

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 21st.dev community: Interactive Bento Gallery

Source: https://21st.dev/@anurag-mishra22/components/interactive-bento-gallery
(listed on 21st.dev by Anurag Mishra under the MIT licence)

```
MIT License

Copyright (c) Anurag Mishra

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
