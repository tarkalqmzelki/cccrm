/* =====================================================================
 * GEO MATCHING — maps free-text company/deal records (address, name,
 * website) to countries for the world-map saturation view. Pure
 * client-side heuristics: alias matching + ccTLD detection.
 * ===================================================================== */

export interface CountryEntry {
  /** Canonical name as used by world-atlas topojson properties.name */
  name: string
  /** Lowercase aliases matched against normalized text */
  aliases: string[]
  /** ccTLDs mapped to this country (without dot) */
  tlds?: string[]
}

const C = (name: string, aliases: string[], tlds?: string[]): CountryEntry => ({ name, aliases, tlds })

/** Curated list covering the major CRM geographies. Names must match
 *  world-atlas `countries-110m.json` properties.name exactly. */
export const COUNTRIES: CountryEntry[] = [
  C('United States of America', ['united states', 'usa', 'us', 'u s', 'america', 'new york', 'los angeles', 'chicago', 'texas', 'california', 'florida', 'boston', 'seattle', 'denver'], ['us', 'com']),
  C('United Kingdom', ['united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'london', 'manchester', 'birmingham', 'uk'], ['uk', 'gb']),
  C('Germany', ['germany', 'deutschland', 'berlin', 'munich', 'munchen', 'hamburg', 'frankfurt', 'cologne', 'koln'], ['de']),
  C('France', ['france', 'paris', 'lyon', 'marseille', 'toulouse', 'bordeaux'], ['fr']),
  C('Italy', ['italy', 'italia', 'rome', 'roma', 'milan', 'milano', 'naples', 'napoli', 'turin', 'torino'], ['it']),
  C('Spain', ['spain', 'espana', 'madrid', 'barcelona', 'valencia', 'seville'], ['es']),
  C('Netherlands', ['netherlands', 'holland', 'amsterdam', 'rotterdam', 'the hague', 'utrecht'], ['nl']),
  C('Belgium', ['belgium', 'belgique', 'brussels', 'bruxelles', 'antwerp', 'bruges'], ['be']),
  C('Bulgaria', ['bulgaria', 'sofia', 'plovdiv', 'varna', 'burgas'], ['bg']),
  C('Romania', ['romania', 'bucharest', 'cluj', 'timisoara'], ['ro']),
  C('Greece', ['greece', 'athens', 'thessaloniki'], ['gr']),
  C('Austria', ['austria', 'vienna', 'wien', 'salzburg'], ['at']),
  C('Switzerland', ['switzerland', 'zurich', 'geneva', 'basel'], ['ch']),
  C('Portugal', ['portugal', 'lisbon', 'lisboa', 'porto'], ['pt']),
  C('Ireland', ['ireland', 'dublin', 'cork'], ['ie']),
  C('Poland', ['poland', 'warsaw', 'krakow', 'gdansk'], ['pl']),
  C('Czech Republic', ['czech republic', 'czechia', 'prague', 'praha'], ['cz']),
  C('Slovakia', ['slovakia', 'bratislava'], ['sk']),
  C('Hungary', ['hungary', 'budapest'], ['hu']),
  C('Croatia', ['croatia', 'zagreb', 'split'], ['hr']),
  C('Serbia', ['serbia', 'belgrade'], ['rs']),
  C('Slovenia', ['slovenia', 'ljubljana'], ['si']),
  C('Sweden', ['sweden', 'stockholm', 'gothenburg'], ['se']),
  C('Norway', ['norway', 'oslo', 'bergen'], ['no']),
  C('Denmark', ['denmark', 'copenhagen', 'kobenhavn'], ['dk']),
  C('Finland', ['finland', 'helsinki'], ['fi']),
  C('Turkey', ['turkey', 'turkiye', 'istanbul', 'ankara', 'izmir'], ['tr']),
  C('Ukraine', ['ukraine', 'kyiv', 'kiev', 'odesa'], ['ua']),
  C('Russia', ['russia', 'moscow', 'moskva', 'saint petersburg'], ['ru']),
  C('Canada', ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa'], ['ca']),
  C('Mexico', ['mexico', 'mexico city', 'guadalajara'], ['mx']),
  C('Brazil', ['brazil', 'brasil', 'sao paulo', 'rio de janeiro'], ['br']),
  C('Argentina', ['argentina', 'buenos aires'], ['ar']),
  C('Chile', ['chile', 'santiago'], ['cl']),
  C('Colombia', ['colombia', 'bogota'], ['co']),
  C('United Arab Emirates', ['united arab emirates', 'uae', 'dubai', 'abu dhabi', 'sharjah'], ['ae']),
  C('Saudi Arabia', ['saudi arabia', 'riyadh', 'jeddah'], ['sa']),
  C('Qatar', ['qatar', 'doha'], ['qa']),
  C('India', ['india', 'delhi', 'mumbai', 'bangalore', 'bengaluru'], ['in']),
  C('China', ['china', 'beijing', 'shanghai', 'shenzhen'], ['cn']),
  C('Japan', ['japan', 'tokyo', 'osaka'], ['jp']),
  C('South Korea', ['south korea', 'korea', 'seoul', 'busan'], ['kr']),
  C('Australia', ['australia', 'sydney', 'melbourne', 'brisbane', 'perth'], ['au']),
  C('New Zealand', ['new zealand', 'auckland', 'wellington'], ['nz']),
  C('South Africa', ['south africa', 'cape town', 'johannesburg', 'durban'], ['za']),
  C('Egypt', ['egypt', 'cairo'], ['eg']),
  C('Morocco', ['morocco', 'casablanca', 'rabat'], ['ma']),
  C('Israel', ['israel', 'tel aviv'], ['il']),
  C('Cyprus', ['cyprus', 'nicosia', 'limassol'], ['cy']),
  C('Malta', ['malta', 'valletta'], ['mt']),
  C('Luxembourg', ['luxembourg'], ['lu']),
  C('Lithuania', ['lithuania', 'vilnius'], ['lt']),
  C('Latvia', ['latvia', 'riga'], ['lv']),
  C('Estonia', ['estonia', 'tallinn'], ['ee']),
  C('Albania', ['albania', 'tirana'], ['al']),
  C('North Macedonia', ['north macedonia', 'macedonia', 'skopje'], ['mk']),
  C('Bosnia and Herz.', ['bosnia', 'sarajevo'], ['ba']),
]

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Returns the country whose alias/TLD best matches the given text.
 *  Longest-alias-wins to avoid "us" matching inside random words. */
export function matchCountry(text: string): string | null {
  const hay = normalize(text)
  if (!hay || hay.length < 3) return null

  let best: { name: string; len: number } | null = null
  for (const c of COUNTRIES) {
    for (const alias of c.aliases) {
      const rx = new RegExp(`(^|[^a-z0-9])${escapeRx(alias)}([^a-z0-9]|$)`)
      if (rx.test(hay) && (!best || alias.length > best.len)) {
        best = { name: c.name, len: alias.length }
      }
    }
    // TLD signal from domains/websites in the text
    if (c.tlds) {
      for (const tld of c.tlds) {
        if (tld === 'com') continue // .com is not geographic
        const rx = new RegExp(`\\.${escapeRx(tld)}([^a-z]|$)`)
        if (rx.test(hay) && (!best || tld.length + 1 > best.len)) {
          best = { name: c.name, len: tld.length + 1 }
        }
      }
    }
  }
  return best?.name ?? null
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

export interface GeoLeadInput { key: string; text: string; id: string; name: string; address: string }
export interface GeoDealInput { key: string; text: string; value: number; id: string; company: string; status: string }

export interface CountryStat {
  country: string
  leads: number
  deals: number
  revenue: number
}

export interface GeoAggregation {
  stats: Map<string, CountryStat>
  leadsByCountry: Map<string, GeoLeadInput[]>
  dealsByCountry: Map<string, GeoDealInput[]>
}

export function aggregateCountries(
  leadItems: GeoLeadInput[],
  dealItems: GeoDealInput[],
): GeoAggregation {
  const stats = new Map<string, CountryStat>()
  const leadsByCountry = new Map<string, GeoLeadInput[]>()
  const dealsByCountry = new Map<string, GeoDealInput[]>()

  const getStat = (country: string): CountryStat => {
    let s = stats.get(country)
    if (!s) {
      s = { country, leads: 0, deals: 0, revenue: 0 }
      stats.set(country, s)
    }
    return s
  }

  const leadCountry = new Map<string, string>()
  for (const l of leadItems) {
    const c = matchCountry(l.text)
    if (!c) continue
    leadCountry.set(l.key, c)
    getStat(c).leads++
    if (!leadsByCountry.has(c)) leadsByCountry.set(c, [])
    leadsByCountry.get(c)!.push(l)
  }
  for (const d of dealItems) {
    // Deals inherit the country from their own text or their lead's text.
    const c = matchCountry(d.text) ?? leadCountry.get(d.key)
    if (!c) continue
    const s = getStat(c)
    s.deals++
    s.revenue += d.value
    if (!dealsByCountry.has(c)) dealsByCountry.set(c, [])
    dealsByCountry.get(c)!.push(d)
  }

  return { stats, leadsByCountry, dealsByCountry }
}
