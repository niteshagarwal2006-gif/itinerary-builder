"use client";

import type { Itinerary, DayBlock, Sight, ImageRef } from "@/lib/itinerary/types";
import { legMapsUrl } from "@/lib/itinerary/types";
import { staySegment } from "@/lib/itinerary/format";
import { docStringsFor, type DocStrings } from "@/lib/i18n/docStrings";
import { cn } from "@/components/ui";

/**
 * Read-only live preview of the itinerary, styled to approximate the printed
 * .docx (a serif "paper" page with gold accents). Purely presentational —
 * it never mutates the itinerary and takes no inputs.
 */
export function PreviewPane({ itinerary }: { itinerary: Itinerary }) {
  const S = docStringsFor(itinerary.outputLanguage);
  return (
    <div className="rounded-xl bg-white p-8 text-ink shadow-md ring-1 ring-line">
      <Cover itinerary={itinerary} S={S} />
      <Highlights highlights={itinerary.highlights} S={S} />
      <Days days={itinerary.days} S={S} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared image helper — plain <img> with caption, centered or full-width.
// ---------------------------------------------------------------------------
function PreviewImage({
  image,
  className,
  imgClassName,
  center = false,
}: {
  image?: ImageRef;
  className?: string;
  imgClassName?: string;
  center?: boolean;
}) {
  if (!image?.url) return null;
  return (
    <figure className={cn("my-3", center && "text-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.caption || ""}
        className={cn(
          "rounded-md object-contain ring-1 ring-line",
          center ? "mx-auto max-h-64" : "w-full",
          imgClassName
        )}
      />
      {image.caption && (
        <figcaption className="mt-1 text-center text-xs italic text-ink/55">
          {image.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Paragraph block — splits free text on blank lines, justified.
// ---------------------------------------------------------------------------
function Paragraphs({ text, className }: { text?: string; className?: string }) {
  if (!text || !text.trim()) return null;
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => (
        <p
          key={i}
          className={cn(
            "mt-2 whitespace-pre-line text-justify text-sm leading-relaxed text-ink/85",
            className
          )}
        >
          {b}
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// COVER
// ---------------------------------------------------------------------------
function Cover({ itinerary, S }: { itinerary: Itinerary; S: DocStrings }) {
  const { preparedFor, logo, tripSummary, routeCities, flightLegs, routeMap } =
    itinerary;

  // Build the trip-summary line from non-empty segments.
  const summarySegments: string[] = [];
  const arrival = [tripSummary.origin, tripSummary.arrivalCity]
    .filter(Boolean)
    .join(" → ");
  if (arrival) summarySegments.push(arrival);
  if (tripSummary.dates?.trim()) summarySegments.push(tripSummary.dates.trim());
  const stay = staySegment(tripSummary.nights, tripSummary.days, S.nights, S.days);
  if (stay) summarySegments.push(stay);
  const departure = [tripSummary.departureCity, tripSummary.finalDestination]
    .filter(Boolean)
    .join(" → ");
  if (departure) summarySegments.push(departure);

  const routeLine = routeCities.filter(Boolean).length
    ? `${S.route} – ` +
      routeCities
        .filter(Boolean)
        .map((c, i) => `(${String.fromCharCode(65 + i)}) ${c}`)
        .join(" – ")
    : "";

  const legs = flightLegs.filter((l) => l.trim());

  return (
    <header className="border-b-2 border-gold pb-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/60">
        {S.preparedFor}
      </p>

      {preparedFor.trim() ? (
        <h1 className="mt-3 font-serif text-4xl font-bold tracking-wide text-gold">
          {preparedFor}
        </h1>
      ) : (
        <p className="mt-3 font-serif text-3xl italic text-ink/30">
          Nom du client…
        </p>
      )}

      {logo?.url && (
        <div className="mt-5 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.url}
            alt={logo.caption || "Logo"}
            className="max-h-24 object-contain"
          />
        </div>
      )}

      {summarySegments.length > 0 && (
        <p className="mt-6 font-serif text-sm font-medium tracking-wide text-deep">
          {summarySegments.join("  |  ")}
        </p>
      )}

      {tripSummary.mealPlan?.trim() && (
        <p className="mt-2 text-xs italic text-ink/70">
          {tripSummary.mealPlan}
        </p>
      )}

      {routeLine && (
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/75">
          {routeLine}
        </p>
      )}

      {legs.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {legs.map((leg, i) => (
            <p
              key={i}
              className="text-xs font-semibold uppercase tracking-wide text-ink/60"
            >
              {S.flight} – {leg}
            </p>
          ))}
        </div>
      )}

      <PreviewImage image={routeMap} center className="mt-6 mb-0" />
    </header>
  );
}

// ---------------------------------------------------------------------------
// HIGHLIGHTS
// ---------------------------------------------------------------------------
function Highlights({ highlights, S }: { highlights: string[]; S: DocStrings }) {
  const items = highlights.filter((h) => h.trim());
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h2 className="border-b-2 border-gold pb-1 font-serif text-xl font-bold uppercase tracking-wide text-deep">
        {S.highlights}
      </h2>
      <ul className="mt-4 space-y-2">
        {items.map((h, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink/85">
            <span aria-hidden className="mt-0.5 shrink-0 text-gold">
              ◆
            </span>
            <span className="text-justify">{h}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// DAYS
// ---------------------------------------------------------------------------
function Days({ days, S }: { days: DayBlock[]; S: DocStrings }) {
  if (!days.length) return null;
  return (
    <section className="mt-10 space-y-8">
      {days.map((day, i) => (
        <DayCard key={i} day={day} S={S} />
      ))}
    </section>
  );
}

function DayCard({ day, S }: { day: DayBlock; S: DocStrings }) {
  const mapsUrl = legMapsUrl(day.leg);
  const distanceText = day.leg?.text?.trim();
  const hotelRightLabel = day.hotel?.name?.trim() || day.city?.trim() || "";
  const hotelLabel = day.hotel?.label || S.yourHotel;
  const hotelName = day.hotel?.name?.trim();

  return (
    <article>
      {/* Banner */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-deep px-4 py-2 text-white">
        <span className="font-serif text-sm font-semibold uppercase tracking-wide">
          {day.dayLabel}
          {day.date?.trim() && (
            <span className="font-normal text-white/70"> ({day.date})</span>
          )}
        </span>

        <span className="flex-1 text-center font-serif text-sm font-semibold uppercase tracking-wide">
          {day.title?.trim() || "—"}
          {distanceText && (
            <span className="font-normal normal-case tracking-normal text-white/80">
              {" — "}
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cream underline decoration-cream/40 underline-offset-2 hover:text-white"
                >
                  {distanceText}
                </a>
              ) : (
                distanceText
              )}
            </span>
          )}
        </span>

        {hotelRightLabel && (
          <span className="text-right text-xs uppercase tracking-wide text-white/85">
            {hotelRightLabel}
          </span>
        )}
      </div>

      {/* Weather (premium variant) */}
      {day.weather?.trim() && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink/55">
          {day.weather}
        </p>
      )}

      {/* Hotel line */}
      {(hotelName || day.hotel?.label) && (
        <p className="mt-3 font-serif text-sm font-semibold tracking-wide text-deep">
          <span className="uppercase">{hotelLabel}</span>
          {hotelName && (
            <>
              {" – "}
              {day.hotel?.url ? (
                <a
                  href={day.hotel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-600"
                >
                  {hotelName}
                </a>
              ) : (
                <span className="text-gold">{hotelName}</span>
              )}
              {day.hotel?.category?.trim() && (
                <span className="font-normal normal-case text-ink/60">
                  {" "}
                  ({day.hotel.category})
                </span>
              )}
            </>
          )}
        </p>
      )}

      {/* Itinéraire (maps directions) line */}
      {mapsUrl && (
        <p className="mt-1 text-xs text-ink/70">
          <span className="font-semibold">{S.directionsPrefix} </span>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-deep underline decoration-deep/30 underline-offset-2 hover:text-deep-700"
          >
            {day.leg?.fromCity && day.leg?.toCity
              ? `${day.leg.fromCity} → ${day.leg.toCity}`
              : S.viewRoute}
          </a>
        </p>
      )}

      {/* Hotel image + description */}
      <PreviewImage image={day.hotel?.image} />
      <Paragraphs text={day.hotel?.description} />

      {/* Day intro */}
      <Paragraphs text={day.intro} />

      {/* Sights */}
      {day.sights.length > 0 && (
        <div className="mt-4 space-y-5">
          {day.sights.map((sight, i) => (
            <SightBlock key={i} sight={sight} />
          ))}
        </div>
      )}

      {/* Closing */}
      {day.closing?.trim() && (
        <p className="mt-4 text-sm italic text-ink/70">{day.closing}</p>
      )}
    </article>
  );
}

function SightBlock({ sight }: { sight: Sight }) {
  if (!sight.title.trim() && !sight.description.trim() && !sight.image?.url) {
    return null;
  }
  return (
    <div>
      {sight.title.trim() && (
        <h3 className="font-serif text-sm font-bold uppercase tracking-wide text-deep">
          {sight.title}
        </h3>
      )}
      <PreviewImage image={sight.image} />
      <Paragraphs text={sight.description} />
    </div>
  );
}
