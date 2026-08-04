import type {
  Profile, Referral, Lead, Deal, Payout, DealStatus, Level, Role, Settings,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import { uuid } from './uuid'

const now = Date.now()
const day = 86400000
const iso = (t: number) => new Date(t).toISOString()

export const ADMIN_EMAIL = 'admin@calistaconcept.eu'
export const ADMIN_PASSWORD = 'admin123'

function color(seed: number) {
  const palette = ['#0A0A0A', '#171717', '#262626', '#404040', '#525252']
  return palette[seed % palette.length]
}

function p(
  id: string, email: string, full_name: string, role: Role, level: Level,
  phone: string, daysAgo: number, avatar_url = '', address = '',
  custom_commission_pct: number | null = null,
): Profile {
  return {
    id, email, full_name, role, level, active: true,
    avatar_color: color(id.charCodeAt(2) || 0),
    avatar_url, phone, address, custom_commission_pct,
    created_at: iso(now - daysAgo * day), updated_at: iso(now),
  }
}

export const seedProfiles: Profile[] = [
  p('u-admin', ADMIN_EMAIL, 'Calista Admin', 'admin', 'L3', '', 120),
  p('u-s1', 'sofia@calistaconcept.eu', 'Sofia Marchetti', 'seller', 'L3', '+39 333 1122334', 90, '', 'Via Roma 12, Milano'),
  p('u-s2', 'luca@calistaconcept.eu', 'Luca Romano', 'seller', 'L2', '+39 340 5566778', 70),
  p('u-h1', 'giulia@calistaconcept.eu', 'Giulia Bianchi', 'headhunter', 'L2', '+39 348 9900112', 50),
  p('u-s3', 'marco@calistaconcept.eu', 'Marco Esposito', 'seller', 'L1', '+39 320 4455667', 30),
  p('u-h2', 'elena@calistaconcept.eu', 'Elena Conti', 'headhunter', 'L1', '+39 351 2233445', 14),
]

export const seedSettings: Settings = { ...DEFAULT_SETTINGS }

export const seedReferrals: Referral[] = [
  { id: 'r1', referrer_id: 'u-admin', referee_id: 'u-s1', note: 'Founding seller', created_at: iso(now - 90 * day) },
  { id: 'r2', referrer_id: 'u-s1', referee_id: 'u-s2', note: '', created_at: iso(now - 65 * day) },
  { id: 'r3', referrer_id: 'u-s1', referee_id: 'u-h1', note: 'Strong network in luxury', created_at: iso(now - 45 * day) },
  { id: 'r4', referrer_id: 'u-s2', referee_id: 'u-s3', note: '', created_at: iso(now - 28 * day) },
  { id: 'r5', referrer_id: 'u-h1', referee_id: 'u-h2', note: '', created_at: iso(now - 12 * day) },
]

export const seedLeads: Lead[] = [
  { id: 'l1', owner_id: 'u-s1', company: 'Atelier Noir', contact_name: 'Camille Faure', email: 'camille@ateliernoir.fr', phone: '+33 1 4020 3040', website: 'ateliernoir.fr', meeting_place: 'Milan Showroom', status: 'warm_call', notes: 'Interested in Q4 launch.', created_at: iso(now - 20 * day), updated_at: iso(now - 2 * day) },
  { id: 'l2', owner_id: 'u-s2', company: 'Maison Verde', contact_name: 'Paolo Greco', email: 'paolo@maisonverde.it', phone: '+39 02 998877', website: 'maisonverde.it', meeting_place: 'Zoom', status: 'cold_call', notes: '', created_at: iso(now - 12 * day), updated_at: iso(now - 12 * day) },
  { id: 'l3', owner_id: 'u-h1', company: 'Bespoke Studio', contact_name: 'Lina Hoffmann', email: 'lina@bespoke.de', phone: '+49 30 2200 3300', website: 'bespoke-studio.de', meeting_place: 'Berlin office', status: 'to_be_finished', notes: 'Awaiting proposal.', created_at: iso(now - 8 * day), updated_at: iso(now - 1 * day) },
]

const dealsSeed: Array<[string, string, string, number, number, DealStatus, number]> = [
  ['u-s1', 'Atelier Noir', 'Camille Faure', 48000, 20, 'closed', 6],
  ['u-s1', 'Lumen Group', 'S. Renard', 32000, 20, 'approved', 3],
  ['u-s1', 'Domus Italia', 'F. Carli', 21000, 20, 'pending_review', 1],
  ['u-s2', 'Maison Verde', 'Paolo Greco', 27500, 15, 'closed', 9],
  ['u-s2', 'Vesta Living', 'M. Conti', 15600, 15, 'approved', 4],
  ['u-h1', 'Bespoke Studio', 'Lina Hoffmann', 62000, 15, 'pending_review', 2],
  ['u-h1', 'Nordic Forms', 'E. Lind', 18000, 15, 'closed', 14],
  ['u-s3', 'Pura Casa', 'G. Sole', 9800, 10, 'rejected', 5],
  ['u-s3', 'Casa Vera', 'R. Vito', 11200, 10, 'pending_review', 2],
  ['u-h2', 'Maison Verde', 'Paolo Greco', 7400, 10, 'warm_call', 0],
]

export const seedDeals: Deal[] = dealsSeed.map((d, i) => {
  const [seller_id, company, contact, gross, commission_pct, status, daysAgo] = d
  const t = now - daysAgo * day
  return {
    id: 'd' + (i + 1),
    seller_id,
    lead_id: null,
    company,
    contact_name: contact,
    email: '',
    phone: '',
    website: '',
    meeting_place: '',
    gross_value: gross,
    collected_amount: status === 'closed' ? gross : Math.round(gross / 2),
    commission_pct,
    custom_commission_pct: null,
    status,
    notes: '',
    closed_at: status === 'closed' ? iso(t) : null,
    created_at: iso(t),
    updated_at: iso(t),
  }
})

export const seedPayouts: Payout[] = seedDeals
  .filter((d) => d.status === 'closed' || d.status === 'approved')
  .map((d, i) => ({
    id: 'p' + (i + 1),
    seller_id: d.seller_id,
    deal_id: d.id,
    amount: Math.round(d.gross_value * (d.commission_pct / 100)),
    paid_amount: d.status === 'closed' ? Math.round(d.gross_value * (d.commission_pct / 100)) : 0,
    status: d.status === 'closed' ? 'paid' : ('pending' as const),
    period: new Date(d.created_at).toISOString().slice(0, 7),
    created_at: d.created_at,
    paid_at: d.status === 'closed' ? d.closed_at : null,
    payout_type: 'sale' as const,
  }))

export function blankProfile(partial: Partial<Profile> = {}): Profile {
  return {
    id: uuid(),
    email: '',
    full_name: '',
    role: 'seller',
    level: 'L1',
    active: true,
    avatar_color: '#0A0A0A',
    avatar_url: '',
    phone: '',
    address: '',
    custom_commission_pct: null,
    created_at: iso(now),
    updated_at: iso(now),
    ...partial,
  }
}

export function blankDeal(seller_id: string): Deal {
  return {
    id: uuid(),
    seller_id,
    lead_id: null,
    company: '',
    contact_name: '',
    email: '',
    phone: '',
    website: '',
    meeting_place: '',
    gross_value: 0,
    collected_amount: 0,
    commission_pct: 10,
    custom_commission_pct: null,
    status: 'pending_review',
    notes: '',
    closed_at: null,
    created_at: iso(now),
    updated_at: iso(now),
  }
}

export const ADMIN_PROFILE = seedProfiles[0]
export const roleOptions: Role[] = ['admin', 'seller', 'headhunter']
export const levelOptions: Level[] = ['L1', 'L2', 'L3']
