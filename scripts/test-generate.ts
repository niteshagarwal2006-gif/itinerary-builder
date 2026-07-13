import { writeFileSync } from "node:fs";
import { generateItineraryDocx } from "../lib/itinerary/generateDocx";
import { sampleItinerary } from "../lib/itinerary/sample";

async function main() {
  const buf = await generateItineraryDocx(sampleItinerary);
  const out = "/tmp/itinerary-sample.docx";
  writeFileSync(out, buf);
  console.log(`Wrote ${out} (${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
