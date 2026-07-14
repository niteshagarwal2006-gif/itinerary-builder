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
  Header,
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
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Activity, ImageRef, Itinerary, DayBlock, Sight } from "./types";
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

function imageRun(img: ResolvedImage, maxW: number): ImageRun {
  const { width, height } = fit(img, maxW);
  const opts: IImageOptions = {
    data: img.data,
    type: img.type,
    transformation: { width, height },
  };
  return new ImageRun(opts);
}

function centeredImageParagraph(img: ResolvedImage, maxW: number, caption?: string): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: caption ? 40 : 160 },
      children: [imageRun(img, maxW)],
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

/** Build a section header from a local PNG asset. */
function makeHeaderFromFile(
  filePath: string,
  naturalW: number,
  naturalH: number,
  maxW: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType]
): Header | undefined {
  try {
    const buffer = readFileSync(filePath);
    const scaled = fit({ data: buffer, width: naturalW, height: naturalH, type: "png" }, maxW);
    return new Header({
      children: [
        new Paragraph({
          alignment,
          spacing: { after: 0 },
          children: [
            new ImageRun({
              data: buffer,
              type: "png",
              transformation: { width: scaled.width, height: scaled.height },
            }),
          ],
        }),
      ],
    });
  } catch {
    return undefined;
  }
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

/**
 * Left-right layout: image on the left, text on the right.
 * Used for watercolor city images and sight entries.
 */
function leftRightImageText(
  img: ResolvedImage,
  textBlocks: Paragraph[],
  caption?: string
): Table {
  const imageCellContent: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: caption ? 40 : 0 },
      children: [imageRun(img, 220)],
    }),
  ];
  if (caption) {
    imageCellContent.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: caption, italics: true, size: 16, color: COLORS.gold, font: FONTS.body }),
        ],
      })
    );
  }

  const imageCell = new TableCell({
    width: { size: 35, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, right: 120 },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    children: imageCellContent,
  });

  const textCell = new TableCell({
    width: { size: 65, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80 },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    verticalAlign: "center",
    children: textBlocks.length ? textBlocks : [new Paragraph({ children: [] })],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [new TableRow({ children: [imageCell, textCell] })],
  });
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

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.rule, space: 6 } },
    children: [new TextRun({ text, font: FONTS.heading, size: 26, bold: true, color: COLORS.deep })],
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    pageBreakBefore: true,
    children: [],
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
    out.push(...centeredImageParagraph(imgs.get(it.logo)!, 260));
  }

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
    out.push(...centeredImageParagraph(imgs.get(it.routeMap)!, 560));
  }

  return out;
}

function buildHighlights(it: Itinerary, imgs: Map<ImageRef, ResolvedImage>, S: DocStrings): (Paragraph | Table)[] {
  const items = it.highlights.filter((h) => h.trim());
  if (!items.length) return [];
  const out: (Paragraph | Table)[] = [pageBreak()];
  if (it.highlightsImage && imgs.has(it.highlightsImage)) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [imageRun(imgs.get(it.highlightsImage)!, 560)],
      })
    );
  }
  out.push(sectionHeading(S.highlights));
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

/** The day banner: a single-row, 3-cell table (jour/date • leg+distance • hotel). */
function dayBanner(day: DayBlock): Table {
  const cellText = (runs: (TextRun | ExternalHyperlink)[]) =>
    new Paragraph({ children: runs, spacing: { after: 0 } });

  const c1: Paragraph[] = [
    cellText([new TextRun({ text: day.dayLabel.toUpperCase(), bold: true, color: COLORS.white, font: FONTS.body, size: 22 })]),
  ];
  if (day.date) c1.push(cellText([new TextRun({ text: day.date.toUpperCase(), color: COLORS.white, font: FONTS.body, size: 18 })]));

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

  const c3: Paragraph[] = [];
  const hotelLine = [day.hotel?.name, day.hotel?.category].filter(Boolean).join(" · ");
  c3.push(cellText([new TextRun({ text: (hotelLine || day.city).toUpperCase(), bold: true, color: COLORS.white, font: FONTS.body, size: 18 })]));

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

  // Google Maps directions link
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

  // Watercolor city image with intro text on the right
  if (day.cityImage && imgs.has(day.cityImage)) {
    const introParas: Paragraph[] = [];
    if (day.intro) introParas.push(bodyPara(day.intro, { spacingAfter: 80 }));
    if (introParas.length) {
      out.push(leftRightImageText(imgs.get(day.cityImage)!, introParas, day.cityImage.caption));
    } else {
      out.push(...centeredImageParagraph(imgs.get(day.cityImage)!, 360, day.cityImage.caption));
    }
  } else if (day.intro) {
    out.push(bodyPara(day.intro));
  }

  // Closure warnings
  if (day.closureWarnings && day.closureWarnings.length > 0) {
    for (const warn of day.closureWarnings) {
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          shading: { fill: "FCE4E4" },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: "C00000", space: 8 },
          },
          indent: { left: 160 },
          children: [
            new TextRun({ text: "⚠  ", bold: true, color: "C00000", font: FONTS.body, size: 19 }),
            new TextRun({ text: warn, italics: true, color: "C00000", font: FONTS.body, size: 19 }),
          ],
        })
      );
    }
  }

  for (const s of day.sights) out.push(...buildSight(s, imgs));

  if (day.activities && day.activities.length > 0) {
    out.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.rule, space: 8 } },
        children: [
          new TextRun({ text: "Experiences", bold: true, font: FONTS.heading, size: 22, color: COLORS.deep }),
        ],
      })
    );
    for (const a of day.activities) out.push(...buildActivity(a));
  }

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

function buildActivity(a: Activity): Paragraph[] {
  const titlePara = new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      new TextRun({ text: "✦ ", color: COLORS.gold, font: FONTS.body, size: 21 }),
      new TextRun({ text: a.title.toUpperCase(), bold: true, font: FONTS.heading, size: 20, color: COLORS.deep }),
    ],
  });

  if (!a.description) return [titlePara];
  return [
    titlePara,
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: a.description, font: FONTS.body, size: 20, color: COLORS.ink, italics: true }),
      ],
    }),
  ];
}

function buildSight(s: Sight, imgs: Map<ImageRef, ResolvedImage>): (Paragraph | Table)[] {
  const titleText = s.enRoute
    ? `EN ROUTE : ${s.title.toUpperCase()}`
    : s.title.toUpperCase();

  const titlePara = new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: titleText, bold: true, font: FONTS.heading, size: 21, color: COLORS.deep })],
  });

  const descParas: Paragraph[] = [];
  if (s.description) descParas.push(bodyPara(s.description));
  if (s.closureNote) {
    descParas.push(
      new Paragraph({
        spacing: { before: 60, after: 120 },
        children: [
          new TextRun({ text: "⚠ ", bold: true, color: "C00000", font: FONTS.body, size: 19 }),
          new TextRun({ text: s.closureNote, italics: true, color: "C00000", font: FONTS.body, size: 19 }),
        ],
      })
    );
  }

  if (s.image && imgs.has(s.image)) {
    if (descParas.length) {
      return [titlePara, leftRightImageText(imgs.get(s.image)!, descParas, s.image.caption)];
    }
    return [titlePara, ...centeredImageParagraph(imgs.get(s.image)!, 280, s.image.caption)];
  }

  return [titlePara, ...descParas];
}

// ---- Image collection ------------------------------------------------------

function collectRefs(it: Itinerary): ImageRef[] {
  const refs: ImageRef[] = [];
  if (it.logo) refs.push(it.logo);
  if (it.routeMap) refs.push(it.routeMap);
  if (it.highlightsImage) refs.push(it.highlightsImage);
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
    ...buildHighlights(it, imgs, S),
  ];
  for (const day of it.days) children.push(...buildDay(day, imgs, S));

  const headerFirst = makeHeaderFromFile(
    path.join(process.cwd(), "public/assets/headers/header_first.png"),
    1172,
    170,
    320,
    AlignmentType.CENTER
  );
  const headerRest = makeHeaderFromFile(
    path.join(process.cwd(), "public/assets/headers/header_rest.png"),
    244,
    140,
    80,
    AlignmentType.LEFT
  );

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
          titlePage: true,
        },
        headers: {
          first: headerFirst,
          default: headerRest,
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
