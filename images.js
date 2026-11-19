// Photos réelles des voitures, sous licence libre (Wikimedia Commons), avec crédit de l'auteur.
// Le serveur les cherche une seule fois sur Wikipédia puis les garde en base.

const UA = "HoloGarage/1.1 (jeu de cartes de collection; https://hologarage.onrender.com)";

// Titres exacts d'articles de Wikipédia en anglais quand la recherche simple risque de se tromper.
const EN_TITLES = {
  "volkswagen-coccinelle-1938": "Volkswagen Beetle",
  "volkswagen-combi-t1-1950": "Volkswagen Type 2",
  "volkswagen-golf-gti-1976": "Volkswagen Golf Mk1",
  "volkswagen-id-buzz-2022": "Volkswagen ID. Buzz",
  "renault-4l-1961": "Renault 4",
  "renault-5-1972": "Renault 5",
  "renault-5-e-tech-2024": "Renault 5 E-Tech",
  "renault-5-turbo-1980": "Renault 5 Turbo",
  "renault-megane-r-s-trophy-2019": "Renault Mégane",
  "mini-cooper-1959": "Mini (Mark I)",
  "mini-cooper-s-2014": "Mini Hatch",
  "mini-moke-1964": "Mini Moke",
  "fiat-500-1957-1957": "Fiat 500 (1957)",
  "fiat-500-2007": "Fiat 500 (2007)",
  "ford-mustang-2015": "Ford Mustang (sixth generation)",
  "ford-mustang-fastback-1967-1967": "Ford Mustang (first generation)",
  "ford-mustang-shelby-gt500-2020": "Shelby Mustang",
  "ford-gt-2005-2005": "Ford GT",
  "ford-gt40-1966": "Ford GT40",
  "ford-f-150-2021": "Ford F-Series",
  "mercedes-benz-classe-a-2018": "Mercedes-Benz A-Class",
  "mercedes-benz-classe-g-2018": "Mercedes-Benz G-Class",
  "mercedes-benz-g-63-6x6-2013": "Mercedes-Benz G63 AMG 6x6",
  "mercedes-benz-300-sl-gullwing-1954": "Mercedes-Benz 300 SL",
  "mercedes-benz-300-slr-uhlenhaut-1955": "Mercedes-Benz 300 SLR",
  "mercedes-benz-190e-2-5-16-evo-ii-1990": "Mercedes-Benz 190E 2.5-16 Evolution II",
  "mercedes-benz-clk-gtr-1998": "Mercedes-Benz CLK GTR",
  "mercedes-amg-c63-s-2015": "Mercedes-AMG C 63",
  "mercedes-amg-gt-black-series-2020": "Mercedes-AMG GT",
  "mercedes-amg-one-2022": "Mercedes-AMG One",
  "bmw-serie-3-2019": "BMW 3 Series (G20)",
  "bmw-m3-e30-1986": "BMW M3 (E30)",
  "bmw-m3-competition-2021": "BMW M3",
  "bmw-m2-2023": "BMW M2",
  "bmw-m1-1978": "BMW M1",
  "jaguar-type-e-1961": "Jaguar E-Type",
  "jaguar-f-type-r-2014": "Jaguar F-Type",
  "jaguar-xj220-1992": "Jaguar XJ220",
  "maserati-ghibli-1967-1967": "Maserati Ghibli (AM115)",
  "honda-nsx-1990-1990": "Honda NSX (first generation)",
  "honda-civic-type-r-2022": "Honda Civic Type R",
  "alpine-a110-1961-1961": "Alpine A110 (1961)",
  "alpine-a110-2017": "Alpine A110 (2017)",
  "chevrolet-corvette-c2-sting-ray-1963": "Chevrolet Corvette (C2)",
  "chevrolet-corvette-c8-2020": "Chevrolet Corvette (C8)",
  "chevrolet-camaro-ss-2016": "Chevrolet Camaro (sixth generation)",
  "dodge-charger-1969-1969": "Dodge Charger (1966)",
  "dodge-challenger-2015": "Dodge Challenger",
  "dodge-challenger-srt-demon-2018": "Dodge Challenger SRT Demon",
  "dodge-viper-1992": "Dodge Viper",
  "land-rover-range-rover-classic-1970": "Range Rover Classic",
  "land-rover-defender-2020": "Land Rover Defender (L663)",
  "porsche-911-turbo-930-1975": "Porsche 930",
  "porsche-911-carrera-2019": "Porsche 911 (992)",
  "porsche-911-gt3-rs-2022": "Porsche 911 GT3",
  "porsche-718-cayman-gt4-2019": "Porsche 718 Cayman",
  "porsche-356-speedster-1954": "Porsche 356",
  "porsche-917k-1970": "Porsche 917",
  "porsche-taycan-turbo-s-2020": "Porsche Taycan",
  "bugatti-type-57sc-atlantic-1936": "Bugatti Type 57",
  "bugatti-veyron-16-4-2005": "Bugatti Veyron",
  "bugatti-chiron-super-sport-300-2019": "Bugatti Chiron",
  "bugatti-la-voiture-noire-2019": "Bugatti La Voiture Noire",
  "shelby-cobra-427-1965": "AC Cobra",
  "lancia-stratos-hf-1973": "Lancia Stratos",
  "lancia-delta-hf-integrale-1987": "Lancia Delta",
  "lancia-037-1982": "Lancia 037",
  "toyota-ae86-trueno-1983": "Toyota AE86",
  "toyota-supra-a80-1993": "Toyota Supra",
  "toyota-gr-supra-2019": "Toyota GR Supra",
  "toyota-2000gt-1967": "Toyota 2000GT",
  "toyota-land-cruiser-1984": "Toyota Land Cruiser (J70)",
  "nissan-skyline-gt-r-r34-1999": "Nissan Skyline GT-R",
  "nissan-skyline-gt-r-r32-1989": "Nissan Skyline (R32)",
  "nissan-gt-r-r35-2007": "Nissan GT-R",
  "nissan-gt-r-nismo-2020": "Nissan GT-R",
  "nissan-fairlady-z-2022": "Nissan Z (RZ34)",
  "mazda-rx-7-fd-1992": "Mazda RX-7",
  "mazda-mx-5-1989": "Mazda MX-5 (NA)",
  "subaru-impreza-wrx-sti-2004": "Subaru Impreza WRX STI",
  "mitsubishi-lancer-evolution-ix-2005": "Mitsubishi Lancer Evolution",
  "audi-quattro-1980": "Audi Quattro",
  "audi-sport-quattro-s1-1985": "Audi Sport Quattro",
  "audi-r8-v10-2015": "Audi R8 (Type 4S)",
  "audi-rs6-avant-2020": "Audi RS 6",
  "peugeot-205-t16-1984": "Peugeot 205 Turbo 16",
  "peugeot-205-gti-1984": "Peugeot 205 GTI",
  "citroen-ds-1955": "Citroën DS",
  "citroen-2cv-1948": "Citroën 2CV",
  "volvo-p1800-1961": "Volvo P1800",
  "lada-niva-1977": "Lada Niva Legend",
  "delorean-dmc-12-1981": "DeLorean DMC-12",
  "ferrari-dino-246-gt-1969": "Dino 206 GT and 246 GT",
  "ferrari-testarossa-1984": "Ferrari Testarossa",
  "ferrari-250-gto-1962": "Ferrari 250 GTO",
  "lamborghini-huracan-2014": "Lamborghini Huracán",
  "lamborghini-aventador-svj-2018": "Lamborghini Aventador",
  "pagani-zonda-r-2009": "Pagani Zonda",
  "koenigsegg-jesko-absolut-2021": "Koenigsegg Jesko",
  "gordon-murray-t-50-2022": "Gordon Murray Automotive T.50",
  "rimac-nevera-2021": "Rimac Nevera",
  "lucid-air-sapphire-2023": "Lucid Air",
  "tesla-model-s-plaid-2021": "Tesla Model S",
  "tesla-roadster-2008": "Tesla Roadster (first generation)",
  "rolls-royce-phantom-2017": "Rolls-Royce Phantom VIII",
  "bentley-continental-gt-2018": "Bentley Continental GT",
  "lexus-lc-500-2017": "Lexus LC",
  "lexus-lfa-2010": "Lexus LFA",
  "polestar-2-2020": "Polestar 2",
};

const strip = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function api(host, params) {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${host} HTTP ${res.status}`);
  return res.json();
}

const PI = { prop: "pageimages", piprop: "name", pilicense: "free", redirects: "1" };

// Trouve l'article et le nom du fichier image principal
async function findImage(car) {
  const enTitle = EN_TITLES[car.id];
  if (enTitle) {
    const j = await api("en.wikipedia.org", { action: "query", titles: enTitle, ...PI });
    const p = j.query?.pages?.[0];
    if (p?.pageimage) return { host: "en.wikipedia.org", title: p.title, file: p.pageimage };
  }
  const q = `${car.brand} ${car.model.replace(/\s*\(\d{4}\)/, "")}`;
  for (const host of ["fr.wikipedia.org", "en.wikipedia.org"]) {
    const j = await api(host, { action: "query", generator: "search", gsrsearch: q, gsrlimit: "3", gsrnamespace: "0", ...PI });
    const pages = (j.query?.pages || []).sort((a, b) => a.index - b.index);
    const brandWord = car.brand.split(/[\s-]/)[0].toLowerCase();
    const p = pages.find((x) => x.pageimage && x.title.toLowerCase().includes(brandWord)) || pages.find((x) => x.pageimage);
    if (p) return { host, title: p.title, file: p.pageimage };
  }
  return null;
}

// Récupère l'URL de la miniature et les infos de licence pour une liste de fichiers
async function fileInfo(host, files) {
  const out = {};
  for (let i = 0; i < files.length; i += 40) {
    const chunk = files.slice(i, i + 40);
    const j = await api(host, {
      action: "query", titles: chunk.map((f) => "File:" + f).join("|"),
      prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "720",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    });
    const norm = {};
    for (const n of j.query?.normalized || []) norm[n.to] = n.from;
    for (const p of j.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata || {};
      const name = (norm[p.title] || p.title).replace(/^File:/, "");
      out[name] = {
        src: ii.thumburl || ii.url,
        page: ii.descriptionurl,
        artist: strip(m.Artist?.value).slice(0, 80) || "Auteur inconnu",
        license: strip(m.LicenseShortName?.value) || "Licence libre",
      };
    }
  }
  return out;
}

async function resolveImages(cars, db, log = console.log) {
  const cached = await db.imageCache();
  const todo = cars.filter((c) => !cached[c.id]); // absentes ou sans photo : on (re)cherche
  if (!todo.length) return cached;
  log(`[images] recherche de ${todo.length} photos sur Wikipédia…`);
  const found = [];
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < todo.length) {
      const car = todo[i++];
      try {
        const r = await findImage(car);
        found.push([car, r]);
      } catch (e) {
        log(`[images] ${car.id} : ${e.message}`);
      }
    }
  }));
  const byHost = {};
  for (const [, r] of found) if (r) (byHost[r.host] ||= []).push(r.file);
  const infos = {};
  for (const [host, files] of Object.entries(byHost)) {
    try { Object.assign(infos, await fileInfo(host, [...new Set(files)])); }
    catch (e) { log(`[images] métadonnées ${host} : ${e.message}`); }
  }
  let ok = 0;
  for (const [car, r] of found) {
    const info = r && (infos[r.file] || infos[r.file.replace(/_/g, " ")]);
    const data = info ? { ...info, article: r.title } : null;
    if (data) ok++;
    await db.setImage(car.id, data);
  }
  log(`[images] ${ok} photos trouvées sur ${todo.length}`);
  return db.imageCache();
}

module.exports = { resolveImages };
