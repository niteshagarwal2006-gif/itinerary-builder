#!/usr/bin/env python3
"""
Download hero images from incredibleindia.gov.in for each city.
Images are fetched from the Scene7 CDN at 1200x900 and saved to
public/library-images/{city}_incredible.jpeg
"""
import urllib.request, urllib.error, os, sys

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "library-images")

# Scene7 CDN base URL — strip existing qlt/ts params and add our own size params
BASE_PARAMS = "&wid=1200&hei=900&fit=crop%2C1&qlt=85&fmt=jpg"

def clean_url(raw_url):
    """Strip ts/qlt params and append our sizing params."""
    # Remove everything after '?'
    base = raw_url.split("?")[0]
    return base + "?" + BASE_PARAMS.lstrip("&")

# (slug, display_name, raw_hero_url_from_site)
CITIES = [
    ("agra",          "Agra",          "https://s7ap1.scene7.com/is/image/incredibleindia/taj-mahal-agra-uttar-pradesh-city-1-hero?qlt=82"),
    ("delhi",         "Delhi",         "https://s7ap1.scene7.com/is/image/incredibleindia/red-fort-delhi1-attr-hero?qlt=82"),
    ("jaipur",        "Jaipur",        "https://s7ap1.scene7.com/is/image/incredibleindia/hawa-mahal-jaipur-rajasthan-city-1-hero?qlt=82"),
    ("jaisalmer",     "Jaisalmer",     "https://s7ap1.scene7.com/is/image/incredibleindia/1-sam-sand-dunes-jaisalmer-city-hero?qlt=82"),
    ("jodhpur",       "Jodhpur",       "https://s7ap1.scene7.com/is/image/incredibleindia/2-mehrangarh-fort-jodhpur-rajasthan-city-hero?qlt=82"),
    ("udaipur",       "Udaipur",       "https://s7ap1.scene7.com/is/image/incredibleindia/city-palace-udaipur-rajasthan-2-new-attr-hero?qlt=82"),
    ("varanasi",      "Varanasi",      "https://s7ap1.scene7.com/is/image/incredibleindia/dashashwamedh-ghat-varanasi-uttar-pradesh-city-hero?qlt=82"),
    ("bikaner",       "Bikaner",       "https://s7ap1.scene7.com/is/image/incredibleindia/junagarh-fort-bikaner-rajasthan-1-attr-hero?qlt=82"),
    ("bundi",         "Bundi",         "https://s7ap1.scene7.com/is/image/incredibleindia/bundi-palace-bundi-rajasthan-1-attr-hero?qlt=82"),
    ("chennai",       "Chennai",       "https://s7ap1.scene7.com/is/image/incredibleindia/1-marina-beach-city-hero?qlt=82"),
    ("kanchipuram",   "Kanchipuram",   "https://s7ap1.scene7.com/is/image/incredibleindia/sri-vardaraja-perumal-temple-kanchipuram-tamil-nadu-hero?qlt=82"),
    ("kochi",         "Kochi",         "https://s7ap1.scene7.com/is/image/incredibleindia/cherai-beach-kochi-kerala-2-attr-hero?qlt=82"),
    ("kumarakom",     "Kumarakom",     "https://s7ap1.scene7.com/is/image/incredibleindia/lake-vembanad-kumarakom-kerala?qlt=82"),
    ("madurai",       "Madurai",       "https://s7ap1.scene7.com/is/image/incredibleindia/meenakshi-amman-temple-madurai-tamil-nadu-1-attr-hero?qlt=82"),
    ("mahabalipuram", "Mahabalipuram", "https://s7ap1.scene7.com/is/image/incredibleindia/2-arjuna-penance-mamallapuram-tamil%20Nadu-city-hero?qlt=82"),
    ("munnar",        "Munnar",        "https://s7ap1.scene7.com/is/image/incredibleindia/1-anayirankal-munnar-kerala-city-hero?qlt=82"),
    ("pondicherry",   "Pondicherry",   "https://s7ap1.scene7.com/is/image/incredibleindia/auroville-puducherry?qlt=82"),
    # Second images for variety
    ("agra",          "Agra",          "https://s7ap1.scene7.com/is/image/incredibleindia/agra-fort-agra-uttar%20pradesh-4-attr-hero?qlt=82"),
    ("jaipur",        "Jaipur",        "https://s7ap1.scene7.com/is/image/incredibleindia/amber-fort-jaipur-rajasthan-1-attr-hero?qlt=82"),
    ("delhi",         "Delhi",         "https://s7ap1.scene7.com/is/image/incredibleindia/red-fort-delhi-1-city-homepage?qlt=82"),
    ("kochi",         "Kochi",         "https://s7ap1.scene7.com/is/image/incredibleindia/chinese-fishing-nets-kochi-kerala-1-attr-hero?qlt=82"),
]

# Build unique list: first image per city gets slug_incredible.jpeg,
# second gets slug_incredible2.jpeg, etc.
seen: dict[str, int] = {}
jobs = []
for slug, display, raw_url in CITIES:
    n = seen.get(slug, 0) + 1
    seen[slug] = n
    suffix = "" if n == 1 else str(n)
    filename = f"{slug}_incredible{suffix}.jpeg"
    url = clean_url(raw_url)
    jobs.append((slug, display, filename, url))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://www.incredibleindia.gov.in/",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
}

def download(slug, display, filename, url):
    out_path = os.path.join(OUT_DIR, filename)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 5000:
            print(f"  ✗  {display:20s} — response too small ({len(data)} bytes), skipping")
            return False
        with open(out_path, "wb") as f:
            f.write(data)
        kb = len(data) // 1024
        print(f"  ✓  {display:20s} → {filename}  ({kb} KB)")
        return True
    except Exception as e:
        print(f"  ✗  {display:20s} — {e}")
        return False

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    ok = 0
    print(f"Downloading {len(jobs)} images from incredibleindia.gov.in …\n")
    for args in jobs:
        if download(*args):
            ok += 1
    print(f"\n{ok}/{len(jobs)} images downloaded to {OUT_DIR}")
    if ok < len(jobs):
        sys.exit(1)
