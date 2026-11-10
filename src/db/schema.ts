import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { PeriodResult, Tariff } from '@/lib/billing/types'

/**
 * Quy ước: tên cột TS camelCase, tên cột DB snake_case (đặt tường minh, không dùng `casing`).
 * Tiền: bigint mode number (số nguyên đồng). Thời điểm: timestamptz. Ngày thuần: date mode string (YYYY-MM-DD).
 */
const money = (name: string) => bigint(name, { mode: 'number' })
const ts = (name: string) => timestamp(name, { withTimezone: true })

// ───────────────────────── Better Auth (sinh bằng `npx auth generate`, thêm cột riêng) ─────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // plugin username
  username: text('username').unique(),
  displayUsername: text('display_username'),
  // plugin admin
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: ts('ban_expires'),
  // cột thêm của dự án
  accountCode: text('account_code').notNull().unique(),
  mustChangePassword: boolean('must_change_password').default(true).notNull(),
  dob: date('dob', { mode: 'date' }),
  avatarVariant: integer('avatar_variant').default(0).notNull(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: ts('created_at'),
    aaguid: text('aaguid'),
  },
  (t) => [
    index('passkey_userId_idx').on(t.userId),
    index('passkey_credentialID_idx').on(t.credentialID),
  ],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}))

// ───────────────────────── Nhà và thành viên ─────────────────────────

export const houses = pgTable('houses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Mã nhà dạng `XX-XXXX`. */
  code: text('code').notNull().unique(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => user.id),
  /** Hạn đóng: ngày trong tháng, 1–28. */
  dueDay: integer('due_day').notNull().default(10),
  bankBin: text('bank_bin'),
  bankAccountNo: text('bank_account_no'),
  bankAccountName: text('bank_account_name'),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').defaultNow().notNull(),
})

export const houseMembers = pgTable(
  'house_members',
  {
    id: text('id').primaryKey(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    joinedAt: ts('joined_at').defaultNow().notNull(),
    leftAt: ts('left_at'),
  },
  (t) => [
    uniqueIndex('house_members_active_uq')
      .on(t.houseId, t.userId)
      .where(sql`${t.leftAt} is null`),
    index('house_members_user_idx').on(t.userId),
  ],
)

export const inviteLinks = pgTable(
  'invite_links',
  {
    id: text('id').primaryKey(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    token: text('token').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => [index('invite_links_house_idx').on(t.houseId)],
)

export const joinRequests = pgTable(
  'join_requests',
  {
    id: text('id').primaryKey(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
      .notNull()
      .default('pending'),
    createdAt: ts('created_at').defaultNow().notNull(),
    decidedAt: ts('decided_at'),
  },
  (t) => [
    uniqueIndex('join_requests_pending_uq')
      .on(t.houseId, t.userId)
      .where(sql`${t.status} = 'pending'`),
  ],
)

// ───────────────────────── Cấu hình thu phí của nhà ─────────────────────────

export const chargeItems = pgTable(
  'charge_items',
  {
    id: text('id').primaryKey(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['equal', 'per_unit'] }).notNull(),
    /** equal: tổng cả tháng; per_unit: đơn giá. */
    amount: money('amount').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('charge_items_house_idx').on(t.houseId)],
)

export const memberChargeQty = pgTable(
  'member_charge_qty',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => houseMembers.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => chargeItems.id, { onDelete: 'cascade' }),
    qty: integer('qty').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.itemId] })],
)

export const utilityTariffs = pgTable(
  'utility_tariffs',
  {
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    utility: text('utility', { enum: ['electricity', 'water'] }).notNull(),
    mode: text('mode', { enum: ['tiered', 'total'] }).notNull(),
    tariff: jsonb('tariff').$type<Tariff>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.houseId, t.utility] })],
)

// ───────────────────────── Tháng thu ─────────────────────────

export const periods = pgTable(
  'periods',
  {
    id: text('id').primaryKey(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    status: text('status', { enum: ['draft', 'closed'] })
      .notNull()
      .default('draft'),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    closedAt: ts('closed_at'),
    revision: integer('revision').notNull().default(0),
    result: jsonb('result').$type<PeriodResult | null>(),
    updatedAt: ts('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex('periods_house_ym_uq').on(t.houseId, t.year, t.month)],
)

export const periodMembers = pgTable(
  'period_members',
  {
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => houseMembers.id),
    name: text('name').notNull(),
    isOwner: boolean('is_owner').notNull().default(false),
    included: boolean('included').notNull().default(true),
    days: integer('days').notNull(),
    /** itemId -> số lượng (khoản per_unit). */
    qty: jsonb('qty').$type<Record<string, number>>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.memberId] })],
)

export const periodItems = pgTable(
  'period_items',
  {
    id: text('id').primaryKey(),
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    sourceItemId: text('source_item_id'),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['equal', 'per_unit'] }).notNull(),
    amount: money('amount').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('period_items_period_idx').on(t.periodId)],
)

export const periodUtilities = pgTable(
  'period_utilities',
  {
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    utility: text('utility', { enum: ['electricity', 'water'] }).notNull(),
    mode: text('mode', { enum: ['tiered', 'total'] }).notNull(),
    prev: integer('prev'),
    curr: integer('curr'),
    total: money('total'),
    tariff: jsonb('tariff').$type<Tariff | null>(),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.utility] })],
)

export const expenses = pgTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id),
    description: text('description').notNull(),
    amount: money('amount').notNull(),
    paidByMemberId: text('paid_by_member_id')
      .notNull()
      .references(() => houseMembers.id),
    spentOn: date('spent_on', { mode: 'string' }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => [index('expenses_period_idx').on(t.periodId)],
)

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id),
    memberId: text('member_id')
      .notNull()
      .references(() => houseMembers.id),
    /** in: thành viên trả chủ nhà; out: chủ nhà trả lại thành viên. */
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    amount: money('amount').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected'] })
      .notNull()
      .default('pending'),
    proofUrl: text('proof_url'),
    rejectReason: text('reject_reason'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: ts('created_at').defaultNow().notNull(),
    decidedAt: ts('decided_at'),
    decidedBy: text('decided_by').references(() => user.id),
  },
  (t) => [
    uniqueIndex('payments_pending_in_uq')
      .on(t.periodId, t.memberId)
      .where(sql`${t.direction} = 'in' and ${t.status} = 'pending'`),
    index('payments_period_idx').on(t.periodId),
  ],
)

// ───────────────────────── Thông báo ─────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    houseId: text('house_id').references(() => houses.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url').notNull(),
    readAt: ts('read_at'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
)

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: ts('created_at').defaultNow().notNull(),
})
