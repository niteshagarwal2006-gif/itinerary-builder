/**
 * Generates a Word (.docx) document from an {@link Itinerary}, reproducing the
 * "IndeduSud v3" layout.
 *
 * Image fetching is decoupled via an {@link ImageResolver} so the same engine
 * works whether pictures come from uploads or are downloaded from the web.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  LevelFormat,
  convertInchesToTwip,
  type IImageOptions,
} from "docx";
import type { ImageRef, Itinerary, DayBlock, Sight } from "./types";
import { legMapsUrl } from "./types";
import { staySegment } from "./format";
import { docStringsFor, type DocStrings } from "../i18n/docStrings";

// ---- Palette ---------------------------------------------------------------
const COLORS = {
  ink: "1B2A2A", // body text
  deep: "0F3D3E", // headings / banner background (deep teal)
  gold: "B8860B", // accents
  cream: "F4EFE2", // light band
  white: "FFFFFF",
  rule: "C9A227", // gold rule
};

const FONTS = {
  heading: "Georgia",
  body: "Calibri",
};

type ImgType = "png" | "jpg" | "gif" | "bmp";

export interface ResolvedImage {
  data: Buffer | Uint8Array;
  width: number; // natural px
  height: number; // natural px
  type: ImgType;
}

/** Resolves an {@link ImageRef} to raw bytes + dimensions, or null to skip. */
export type ImageResolver = (ref: ImageRef) => Promise<ResolvedImage | null>;

// ---- Image helpers ---------------------------------------------------------

/** Scale an image to fit a max width (px), preserving aspect ratio. */
function fit(img: ResolvedImage, maxW: number): { width: number; height: number } {
  const w = img.width || maxW;
  const h = img.height || Math.round(maxW * 0.66);
  if (w <= maxW) return { width: w, height: h };
  const ratio = maxW / w;
  return { width: maxW, height: Math.round(h * ratio) };
}

function imageParagraph(
  img: ResolvedImage,
  maxW: number,
  caption?: string
): Paragraph[] {
  const { width, height } = fit(img, maxW);
  const opts: IImageOptions = {
    data: img.data,
    type: img.type,
    transformation: { width, height },
  };
  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: caption ? 40 : 160 },
      children: [new ImageRun(opts)],
    }),
  ];
  if (caption) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({ text: caption, italics: true, size: 18, color: COLORS.gold, font: FONTS.body }),
        ],
      })
    );
  }
  return out;
}

// ---- Text helpers ----------------------------------------------------------

function bodyPara(text: string, opts: { spacingAfter?: number; italics?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: opts.spacingAfter ?? 120, line: 276 },
    children: [
      new TextRun({ text, font: FONTS.body, size: 21, color: COLORS.ink, italics: opts.italics }),
    ],
  });
}

/** A coloured hyperlink run, e.g. for hotel sites and Maps links. */
function link(text: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({ text, style: "Hyperlink", font: FONTS.body, size: 21, color: COLORS.gold, underline: {} }),
    ],
  });
}

// ---- Section builders ------------------------------------------------------

function buildCover(it: Itinerary, imgs: Map<ImageRef, ResolvedImage>, S: DocStrings): Paragraph[] {
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({ text: S.preparedFor, font: FONTS.heading, size: 28, bold: true, color: COLORS.deep }),
      ],
    })
  );
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({ text: it.preparedFor, font: FONTS.heading, size: 32, bold: true, color: COLORS.gold }),
      ],
    })
  );

  if (it.logo && imgs.has(it.logo)) {
    out.push(...imageParagraph(imgs.get(it.logo)!, 260));
  }

  // Trip summary line: PARIS → CHENNAI | dates | nights/days | DEPARTURE → HOME
  const ts = it.tripSummary;
  const segs: string[] = [];
  if (ts.origin && ts.arrivalCity) segs.push(`${ts.origin} → ${ts.arrivalCity}`);
  if (ts.dates) segs.push(ts.dates);
  const stay = staySegment(ts.nights, ts.days, S.nights, S.days);
  if (stay) segs.push(stay);
  if (ts.departureCity && ts.finalDestination) segs.push(`${ts.departureCity} → ${ts.finalDestination}`);
  if (segs.length) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: segs.join("   |   "), font: FONTS.body, size: 22, bold: true, color: COLORS.deep })],
      })
    );
  }
  if (ts.mealPlan) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: ts.mealPlan, font: FONTS.body, size: 19, italics: true, color: COLORS.ink })],
      })
    );
  }

  // ROUTE line (filter blanks so lettering matches the preview)
  const routeCities = it.routeCities.filter(Boolean);
  if (routeCities.length) {
    const labelled = routeCities
      .map((c, i) => `(${String.fromCharCode(65 + i)}) ${c}`)
      .join(" – ");
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 60 },
        children: [
          new TextRun({ text: `${S.route} – `, font: FONTS.body, size: 20, bold: true, color: COLORS.gold }),
          new TextRun({ text: labelled, font: FONTS.body, size: 20, bold: true, color: COLORS.deep }),
        ],
      })
    );
  }
  for (const fl of it.flightLegs.filter((l) => l.trim())) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: `${S.flight} – ${fl}`, font: FONTS.body, size: 19, bold: true, color: COLORS.gold })],
      })
    );
  }

  if (it.routeMap && imgs.has(it.routeMap)) {
    out.push(...imageParagraph(imgs.get(it.routeMap)!, 560));
  }

  return out;
}

function buildHighlights(it: Itinerary, S: DocStrings): (Paragraph)[] {
  const items = it.highlights.filter((h) => h.trim());
  if (!items.length) return [];
  const out: Paragraph[] = [
    sectionHeading(S.highlights),
  ];
  for (const h of items) {
    out.push(
      new Paragraph({
        numbering: { reference: "highlights", level: 0 },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 80, line: 264 },
        children: [new TextRun({ text: h, font: FONTS.body, size: 21, color: COLORS.ink })],
      })
    );
  }
  return out;
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.rule, space: 6 } },
    children: [new TextRun({ text, font: FONTS.heading, size: 26, bold: true, color: COLORS.deep })],
  });
}

/** The day banner: a single-row, 3-cell table (jour/date • leg+distance • hotel). */
function dayBanner(day: DayBlock): Table {
  const cellText = (runs: (TextRun | ExternalHyperlink)[]) =>
    new Paragraph({ children: runs, spacing: { after: 0 } });

  // Cell 1 — JOUR / date
  const c1: Paragraph[] = [
    cellText([new TextRun({ text: day.dayLabel.toUpperCase(), bold: true, color: COLORS.white, font: FONTS.body, size: 22 })]),
  ];
  if (day.date) c1.push(cellText([new TextRun({ text: day.date.toUpperCase(), color: COLORS.white, font: FONTS.body, size: 18 })]));

  // Cell 2 — leg title + distance (with maps link if available)
  const c2: Paragraph[] = [
    cellText([new TextRun({ text: day.title.toUpperCase(), bold: true, color: COLORS.white, font: FONTS.body, size: 20 })]),
  ];
  if (day.leg?.text) {
    const url = legMapsUrl(day.leg);
    const distRun = url
      ? new ExternalHyperlink({ link: url, children: [new TextRun({ text: day.leg.text.toUpperCase(), color: "FBE9A6", underline: {}, font: FONTS.body, size: 18 })] })
      : new TextRun({ text: day.leg.text.toUpperCase(), color: COLORS.white, font: FONTS.body, size: 18 });
    c2.push(cellText([distRun]));
  }

  // Cell 3 — hotel name (+ category)
  const c3: Paragraph[] = [];
  const hotelLine = [day.hotel?.name, day.hotel?.category].filter(Boolean).join(" · ");
  c3.push(cellText([new TextRun({ text: (hotelLine || day.city).toUpperCase(), bold: true, color: COLORS.white, font: FONTS.body, size: 18 })]));

  const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
  const mkCell = (children: Paragraph[], width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      shading: { fill: COLORS.deep },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
      children,
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLORS.rule },
    },
    rows: [new TableRow({ children: [mkCell(c1, 28), mkCell(c2, 44), mkCell(c3, 28)] })],
  });
}

function buildDay(day: DayBlock, imgs: Map<ImageRef, ResolvedImage>, S: DocStrings): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(
    new Paragraph({ spacing: { before: 280, after: 0 }, children: [] }),
    dayBanner(day)
  );

  if (day.weather) {
    out.push(
      new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [new TextRun({ text: day.weather, font: FONTS.body, size: 17, italics: true, color: COLORS.gold })],
      })
    );
  }

  // Hotel line — VOTRE HÔTEL – [name](url)
  if (day.hotel?.name) {
    const label = (day.hotel.label || S.yourHotel).toUpperCase();
    const runs: (TextRun | ExternalHyperlink)[] = [
      new TextRun({ text: `${label} – `, bold: true, font: FONTS.body, size: 21, color: COLORS.deep }),
    ];
    runs.push(
      day.hotel.url
        ? link(day.hotel.name, day.hotel.url)
        : new TextRun({ text: day.hotel.name, bold: true, font: FONTS.body, size: 21, color: COLORS.deep })
    );
    if (day.hotel.category) {
      runs.push(new TextRun({ text: `  (${day.hotel.category})`, font: FONTS.body, size: 19, color: COLORS.ink }));
    }
    out.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: runs }));
  }

  // Itinéraire (Google Maps directions) line
  const mapsUrl = legMapsUrl(day.leg);
  if (mapsUrl && day.leg) {
    const from = day.leg.fromCity, to = day.leg.toCity;
    const label = from && to ? `${from} → ${to} (Google Maps)` : `${S.viewRoute} (Google Maps)`;
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${S.directionsPrefix} `, font: FONTS.body, size: 19, color: COLORS.ink }),
          link(label, mapsUrl),
        ],
      })
    );
  }

  if (day.hotel?.image && imgs.has(day.hotel.image)) {
    out.push(...imageParagraph(imgs.get(day.hotel.image)!, 300, day.hotel.image.caption));
  }
  if (day.hotel?.description) out.push(bodyPara(day.hotel.description));

  // Closure warnings (amber callout box)
  if (day.closureWarnings && day.closureWarnings.length > 0) {
    for (const warn of day.closureWarnings) {
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          shading: { fill: "FFF3CD" },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: "B8860B", space: 8 },
          },
          indent: { left: 160 },
          children: [
            new TextRun({ text: "⚠  ", bold: true, color: "B8860B", font: FONTS.body, size: 19 }),
            new TextRun({ text: warn, italics: true, color: "7A5800", font: FONTS.body, size: 19 }),
          ],
        })
      );
    }
  }

  if (day.intro) out.push(bodyPara(day.intro));

  for (const s of day.sights) out.push(...buildSight(s, imgs));

  if (day.closing) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: day.closing, font: FONTS.body, size: 21, italics: true, color: COLORS.ink })],
      })
    );
  }
  return out;
}

function buildSight(s: Sight, imgs: Map<ImageRef, ResolvedImage>): (Paragraph)[] {
  const titleText = s.enRoute
    ? `EN ROUTE : ${s.title.toUpperCase()}`
    : s.title.toUpperCase();
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: 160, after: 40 },
      children: [new TextRun({ text: titleText, bold: true, font: FONTS.heading, size: 21, color: COLORS.deep })],
    }),
  ];
  if (s.image && imgs.has(s.image)) out.push(...imageParagraph(imgs.get(s.image)!, 280, s.image.caption));
  if (s.description) out.push(bodyPara(s.description));
  return out;
}

// ---- Image collection ------------------------------------------------------

function collectRefs(it: Itinerary): ImageRef[] {
  const refs: ImageRef[] = [];
  if (it.logo) refs.push(it.logo);
  if (it.routeMap) refs.push(it.routeMap);
  for (const d of it.days) {
    if (d.cityImage) refs.push(d.cityImage);
    if (d.hotel?.image) refs.push(d.hotel.image);
    for (const s of d.sights) if (s.image) refs.push(s.image);
  }
  return refs;
}

async function resolveImages(it: Itinerary, resolver?: ImageResolver): Promise<Map<ImageRef, ResolvedImage>> {
  const map = new Map<ImageRef, ResolvedImage>();
  if (!resolver) return map;
  const refs = collectRefs(it);
  const results = await Promise.all(
    refs.map(async (r) => {
      try {
        return [r, await resolver(r)] as const;
      } catch {
        return [r, null] as const;
      }
    })
  );
  for (const [r, img] of results) if (img) map.set(r, img);
  return map;
}

// ---- Entry point -----------------------------------------------------------

export async function generateItineraryDocx(
  it: Itinerary,
  resolver?: ImageResolver
): Promise<Buffer> {
  const imgs = await resolveImages(it, resolver);
  const S = docStringsFor(it.outputLanguage);

  const children: (Paragraph | Table)[] = [
    ...buildCover(it, imgs, S),
    ...buildHighlights(it, S),
  ];
  for (const day of it.days) children.push(...buildDay(day, imgs, S));

  const doc = new Document({
    creator: "Itinerary Builder",
    title: `Itinéraire — ${it.preparedFor}`,
    numbering: {
      config: [
        {
          reference: "highlights",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { run: { color: COLORS.gold }, paragraph: { indent: { left: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.2) } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: FONTS.body, size: 21, color: COLORS.ink } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
