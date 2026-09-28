import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import type { Model } from 'mongoose';
import type { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface PaymentRecord {
  id: string;
  amount: number;
  method: string;
  receiptNumber: string;
  date: string;
  transactionId: string;
  notes: string;
  provider: string;
  status: string;
}

interface FamilyDoc {
  _id: unknown;
  paymentModes?: string[];
  primaryPaymentMethod?: string;
  paymentInstructions?: string;
  currency?: string;
  raw?: Record<string, unknown>;
}

interface InvoiceDoc {
  _id: unknown;
  familyId?: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  status?: string;
  paidDate?: string | null;
  currency?: string;
  dueDate?: string;
  preferredPaymentMethods?: string[];
  primaryPaymentMethod?: string;
  paymentInstructions?: string;
  sentToParent?: boolean;
  sentDate?: Date;
  invoiceNumber?: string;
  availableOnlinePaymentMethods?: string[];
  raw?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers (ported from server-janus-multi-profile.js)
// ---------------------------------------------------------------------------

function normalizeOnlinePaymentMethod(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeCurrencyCode(value: unknown, fallback = 'USD'): string {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
}

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || '').trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();

const PAYPAL_SUPPORTED_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS',
  'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'SGD',
  'SEK', 'CHF', 'THB', 'USD',
]);

function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY;
}

function isPayPalConfigured(): boolean {
  return !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

function uniqueNormalizedMethods(values: unknown[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((v) => normalizeOnlinePaymentMethod(v))
        .filter(Boolean),
    ),
  );
}

function getInvoicePreferredPaymentMethods(invoice: InvoiceDoc, family: FamilyDoc | null): string[] {
  const familyRaw = (family?.raw || {}) as Record<string, unknown>;
  return uniqueNormalizedMethods([
    ...(Array.isArray(invoice.preferredPaymentMethods) ? invoice.preferredPaymentMethods : []),
    ...(Array.isArray((invoice.raw as Record<string, unknown>)?.preferredPaymentMethods)
      ? (invoice.raw as Record<string, unknown>).preferredPaymentMethods as unknown[]
      : []),
    ...(Array.isArray(family?.paymentModes) ? family.paymentModes : []),
    ...(Array.isArray(familyRaw.paymentModes) ? familyRaw.paymentModes as unknown[] : []),
    invoice.primaryPaymentMethod,
    (invoice.raw as Record<string, unknown>)?.primaryPaymentMethod,
    family?.primaryPaymentMethod,
    familyRaw.primaryPaymentMethod,
  ]);
}

function getInvoiceOnlinePaymentMethods(invoice: InvoiceDoc, family: FamilyDoc | null): string[] {
  const preferredMethods = getInvoicePreferredPaymentMethods(invoice, family);
  const currency = normalizeCurrencyCode(
    invoice.currency ||
    (invoice.raw as Record<string, unknown>)?.currency ||
    family?.currency ||
    (family?.raw as Record<string, unknown>)?.currency ||
    'USD',
  );
  const available: string[] = [];
  if (preferredMethods.includes('stripe') && isStripeConfigured()) {
    available.push('stripe');
  }
  if (preferredMethods.includes('paypal') && isPayPalConfigured() && PAYPAL_SUPPORTED_CURRENCIES.has(currency)) {
    available.push('paypal');
  }
  return available;
}

function mapPaymentRecordForClient(payment: Record<string, unknown>): PaymentRecord {
  const raw = (payment.raw || {}) as Record<string, unknown>;
  return {
    id: String(payment._id || payment.id || ''),
    amount: Number(payment.amount || 0),
    method: String(payment.method || raw.method || ''),
    receiptNumber: String(raw.receiptNumber || ''),
    date: String(payment.createdAt || payment.updatedAt || new Date().toISOString()),
    transactionId: String(raw.transactionId || raw.paymentIntentId || raw.captureId || raw.orderId || ''),
    notes: String(raw.notes || ''),
    provider: String(raw.provider || ''),
    status: String(raw.status || 'completed'),
  };
}

function deriveInvoiceStatus(
  invoice: InvoiceDoc,
  totalAmount: number,
  paidAmount: number,
  remainingAmount: number,
): string {
  if (invoice.status === 'cancelled') return 'cancelled';
  if (remainingAmount <= 0 && totalAmount > 0) return 'paid';
  if (paidAmount > 0) return 'partially_paid';
  return invoice.status === 'cancelled' ? 'cancelled' : 'pending';
}

function deriveInvoicePaidDate(
  invoice: InvoiceDoc,
  payments: PaymentRecord[],
  totalAmount: number,
): string | null {
  const raw = (invoice.raw || {}) as Record<string, unknown>;
  const explicitPaidDate = invoice.paidDate || (raw.paidDate as string | undefined) || null;
  if (explicitPaidDate) return explicitPaidDate;

  const normalizedPayments = (Array.isArray(payments) ? payments : [])
    .map((p) => ({ amount: Number(p?.amount || 0), date: p?.date || null, timestamp: p?.date ? new Date(p.date).getTime() : NaN }))
    .filter((p) => Number.isFinite(p.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (normalizedPayments.length === 0) return null;

  if (totalAmount > 0) {
    let cumulative = 0;
    for (const p of normalizedPayments) {
      cumulative += p.amount;
      if (cumulative >= totalAmount) return p.date;
    }
  }
  return normalizedPayments[normalizedPayments.length - 1]?.date || null;
}

function mapInvoiceForClient(
  invoice: Record<string, unknown>,
  payments: PaymentRecord[],
  family: FamilyDoc | null,
): Record<string, unknown> {
  const raw = (invoice.raw || {}) as Record<string, unknown>;
  const { _id, __v, ...rest } = invoice;
  const totalAmount = Number((rest.totalAmount as number | undefined) ?? (raw.totalAmount as number | undefined) ?? 0);
  const paidAmount = Number(
    (rest.paidAmount as number | undefined) ??
    (raw.paidAmount as number | undefined) ??
    payments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  );
  const remainingAmount = Math.max(
    0,
    Number(
      (rest.remainingAmount as number | undefined) ??
      (raw.remainingAmount as number | undefined) ??
      (totalAmount - paidAmount),
    ),
  );

  const invoiceDoc = { _id, ...rest, raw } as unknown as InvoiceDoc;
  const preferredPaymentMethods = getInvoicePreferredPaymentMethods(invoiceDoc, family);
  const primaryPaymentMethod = String(
    (rest.primaryPaymentMethod as string | undefined) ||
    (raw.primaryPaymentMethod as string | undefined) ||
    preferredPaymentMethods[0] || '',
  );
  const paymentInstructions = String(
    (rest.paymentInstructions as string | undefined) ||
    (raw.paymentInstructions as string | undefined) ||
    family?.paymentInstructions ||
    (family?.raw as Record<string, unknown>)?.paymentInstructions || '',
  );
  const status = deriveInvoiceStatus(invoiceDoc, totalAmount, paidAmount, remainingAmount);
  const paidDate = status === 'paid' ? deriveInvoicePaidDate(invoiceDoc, payments, totalAmount) : null;
  const availableOnlinePaymentMethods = getInvoiceOnlinePaymentMethods(
    { ...invoiceDoc, totalAmount, paidAmount, remainingAmount, primaryPaymentMethod, preferredPaymentMethods },
    family,
  );

  return {
    id: _id,
    ...raw,
    ...rest,
    totalAmount,
    paidAmount,
    remainingAmount,
    status,
    paidDate,
    payments,
    preferredPaymentMethods,
    primaryPaymentMethod,
    paymentInstructions,
    availableOnlinePaymentMethods,
  };
}

// ---------------------------------------------------------------------------
// Payment-link helpers
// ---------------------------------------------------------------------------

const PAYMENT_LINK_TTL_MS = Number(process.env.PAYMENT_LINK_TTL_MS || 45 * 24 * 60 * 60 * 1000);
const AUTH_ACCESS_TOKEN_SECRET = String(process.env.AUTH_ACCESS_TOKEN_SECRET || '').trim();
const SOCKET_AUTH_SIGNING_KEY = String(process.env.SOCKET_AUTH_SIGNING_KEY || '').trim();
const PAYMENT_PUBLIC_BASE_URL = String(process.env.PAYMENT_PUBLIC_BASE_URL || '').trim();

function getRequestOriginFromReq(req: { headers: Record<string, string | string[] | undefined>; get(name: string): string | undefined }): string {
  if (PAYMENT_PUBLIC_BASE_URL) return PAYMENT_PUBLIC_BASE_URL;
  const protoHeader = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hostHeader = String((req.headers['x-forwarded-host'] as string | undefined) || req.get('host') || '').split(',')[0].trim();
  if (!hostHeader) return '';
  return `${protoHeader || 'https'}://${hostHeader}`;
}

function getPaymentLinkSigningKey(): string {
  return (
    String(process.env.PAYMENT_LINK_SIGNING_KEY || '').trim() ||
    SOCKET_AUTH_SIGNING_KEY ||
    AUTH_ACCESS_TOKEN_SECRET ||
    STRIPE_SECRET_KEY ||
    ''
  );
}

function createInvoicePaymentLinkSignature(
  invoiceId: string,
  expiresAt: number,
  provider = '',
  familyId = '',
): string {
  const key = getPaymentLinkSigningKey();
  if (!key) return '';
  const normalizedProvider = normalizeOnlinePaymentMethod(provider);
  const purpose = normalizedProvider ? `checkout:${normalizedProvider}` : 'page';
  const payload = [
    String(invoiceId || '').trim(),
    String(familyId || '').trim(),
    Number(expiresAt || 0),
    purpose,
  ].join(':');
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function buildInvoicePaymentLink(opts: {
  req: { headers: Record<string, string | string[] | undefined>; get(name: string): string | undefined };
  invoiceId: string;
  provider?: string;
  expiresAt?: number | null;
  familyId?: string;
}): string {
  const resolvedInvoiceId = String(opts.invoiceId || '').trim();
  if (!resolvedInvoiceId) return '';

  const origin = getRequestOriginFromReq(opts.req);
  if (!origin) return '';

  const resolvedExpiresAt = Number(opts.expiresAt || (Date.now() + PAYMENT_LINK_TTL_MS));
  const provider = opts.provider || '';
  const familyId = opts.familyId || '';
  const signature = createInvoicePaymentLinkSignature(resolvedInvoiceId, resolvedExpiresAt, provider, familyId);
  if (!signature) return '';

  const basePath = provider
    ? `/payments/invoice/${encodeURIComponent(resolvedInvoiceId)}/checkout`
    : `/payments/invoice/${encodeURIComponent(resolvedInvoiceId)}`;

  const params = new URLSearchParams({ expires: String(resolvedExpiresAt), sig: signature });
  if (provider) params.set('provider', normalizeOnlinePaymentMethod(provider));
  if (familyId) params.set('familyId', String(familyId).trim());

  return `${origin}${basePath}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel('Invoice') private readonly invoiceModel: Model<Record<string, unknown>>,
    @InjectModel('Payment') private readonly paymentModel: Model<Record<string, unknown>>,
    @InjectModel('Family') private readonly familyModel: Model<Record<string, unknown>>,
  ) {}

  // -------------------------------------------------------------------------
  // Internal hydration
  // -------------------------------------------------------------------------

  private async hydrateInvoices(invoiceDocs: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (invoiceDocs.length === 0) return [];

    const invoiceIds = invoiceDocs.map((inv) => String(inv._id || inv.id || '')).filter(Boolean);
    const familyIds = Array.from(
      new Set(invoiceDocs.map((inv) => String(inv.familyId || '').trim()).filter(Boolean)),
    );

    const [paymentDocs, familyDocs] = await Promise.all([
      invoiceIds.length > 0
        ? this.paymentModel.find({ invoiceId: { $in: invoiceIds } }).sort({ createdAt: -1 }).lean()
        : Promise.resolve([]),
      familyIds.length > 0
        ? this.familyModel.find({ _id: { $in: familyIds } }).lean()
        : Promise.resolve([]),
    ]);

    const paymentsByInvoice = new Map<string, PaymentRecord[]>();
    (paymentDocs as Record<string, unknown>[]).forEach((payment) => {
      const invoiceId = String(payment.invoiceId || '').trim();
      if (!invoiceId) return;
      const current = paymentsByInvoice.get(invoiceId) || [];
      current.push(mapPaymentRecordForClient(payment));
      paymentsByInvoice.set(invoiceId, current);
    });

    const familyById = new Map<string, FamilyDoc>();
    (familyDocs as FamilyDoc[]).forEach((family) => {
      familyById.set(String(family._id || '').trim(), family);
    });

    return invoiceDocs.map((invoice) => {
      const invoiceId = String(invoice._id || invoice.id || '').trim();
      const family = familyById.get(String(invoice.familyId || '').trim()) || null;
      const paymentHistory = paymentsByInvoice.get(invoiceId) || [];
      return mapInvoiceForClient(invoice, paymentHistory, family);
    });
  }

  private async hydrateSingleInvoice(invoice: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
    if (!invoice) return null;
    const [hydrated] = await this.hydrateInvoices([invoice]);
    return hydrated || null;
  }

  // -------------------------------------------------------------------------
  // GET /api/invoices  (line 7286)
  // -------------------------------------------------------------------------

  async getInvoices(
    query: Record<string, unknown>,
    req: FamilyScopedRequest,
  ): Promise<{ success: boolean; invoices: Record<string, unknown>[] }> {
    const filter: Record<string, unknown> = {};
    if (query.month && query.year) {
      filter.month = `${query.year}-${String(query.month).padStart(2, '0')}`;
    }
    if (query.status) filter.status = query.status;
    if (query.familyId) filter.familyId = query.familyId;

    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      if (filter.familyId) {
        if (!req.familyScope.includes(String(filter.familyId))) {
          return { success: true, invoices: [] };
        }
      } else {
        filter.familyId = { $in: req.familyScope };
      }
    }

    const invoices = await this.invoiceModel.find(filter).sort({ createdAt: -1 }).lean() as Record<string, unknown>[];
    const hydrated = await this.hydrateInvoices(invoices);
    return { success: true, invoices: hydrated };
  }

  // -------------------------------------------------------------------------
  // GET /api/invoices/stats  (line 7299)
  // -------------------------------------------------------------------------

  async getInvoiceStats(
    query: Record<string, unknown>,
  ): Promise<{ success: boolean; stats: Record<string, unknown> }> {
    const monthKey = (query.month && query.year)
      ? `${query.year}-${String(query.month).padStart(2, '0')}`
      : null;
    const filter = monthKey ? { month: monthKey } : {};
    const invoices = await this.invoiceModel.find(filter).lean() as Record<string, unknown>[];
    const now = new Date();

    const stats = invoices.reduce(
      (acc: { total: number; pending: number; paid: number; partiallyPaid: number; overdue: number; totalAmount: number; paidAmount: number; pendingAmount: number }, inv) => {
        acc.total++;
        acc.totalAmount += Number(inv.totalAmount || 0);
        if (inv.status === 'paid') {
          acc.paid++;
          acc.paidAmount += Number(inv.totalAmount || 0);
        } else if (inv.status === 'partially_paid') {
          acc.partiallyPaid++;
          acc.paidAmount += Number(inv.paidAmount || 0);
          acc.pendingAmount += Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0);
        } else {
          acc.pending++;
          acc.pendingAmount += Number(inv.totalAmount || 0);
          if (inv.dueDate && new Date(inv.dueDate as string) < now) acc.overdue++;
        }
        return acc;
      },
      { total: 0, pending: 0, paid: 0, partiallyPaid: 0, overdue: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0 },
    );

    return { success: true, stats };
  }

  // -------------------------------------------------------------------------
  // POST /api/invoices  (line 7322)
  // -------------------------------------------------------------------------

  async createInvoice(body: Record<string, unknown>): Promise<{ success: boolean; invoiceId: string; invoice: Record<string, unknown> }> {
    const id = String(body._id || '').trim() || crypto.randomBytes(12).toString('hex');
    const invoice = await this.invoiceModel.create({ _id: id, ...body });
    return { success: true, invoiceId: id, invoice: (invoice as unknown as { toObject(): Record<string, unknown> }).toObject() };
  }

  // -------------------------------------------------------------------------
  // GET /api/invoices/:id  (line 7330)
  // -------------------------------------------------------------------------

  async getInvoiceById(
    id: string,
    req: FamilyScopedRequest,
  ): Promise<{ success: boolean; invoice: Record<string, unknown> }> {
    const raw = await this.invoiceModel.findById(id).lean() as Record<string, unknown> | null;
    const invoice = await this.hydrateSingleInvoice(raw);
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      const fid = String(invoice.familyId || '');
      if (fid && !req.familyScope.includes(fid)) throw new NotFoundException('Invoice not found');
    }

    return { success: true, invoice };
  }

  // -------------------------------------------------------------------------
  // GET /api/invoices/:id/payment-link  (line 7340)
  // -------------------------------------------------------------------------

  async getPaymentLink(
    id: string,
    req: FamilyScopedRequest & { headers: Record<string, string | string[] | undefined>; get(name: string): string | undefined },
  ): Promise<Record<string, unknown>> {
    const raw = await this.invoiceModel.findById(id).lean() as Record<string, unknown> | null;
    const invoice = await this.hydrateSingleInvoice(raw);
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      const fid = String(invoice.familyId || '');
      if (fid && !req.familyScope.includes(fid)) throw new NotFoundException('Invoice not found');
    }

    const availableMethods = Array.isArray(invoice.availableOnlinePaymentMethods)
      ? (invoice.availableOnlinePaymentMethods as string[])
      : [];
    const primaryProvider = availableMethods.length === 1 ? availableMethods[0] : '';
    const expiresAt = Date.now() + PAYMENT_LINK_TTL_MS;
    const invoiceId = String(invoice.id || invoice._id || '');

    const paymentPageUrl = buildInvoicePaymentLink({
      req,
      invoiceId,
      expiresAt,
      familyId: String(invoice.familyId || ''),
    });
    const paymentLink = buildInvoicePaymentLink({
      req,
      invoiceId,
      provider: primaryProvider,
      expiresAt,
      familyId: String(invoice.familyId || ''),
    }) || paymentPageUrl;

    // If no signing key is configured, return null paymentUrl gracefully
    if (!paymentLink && !paymentPageUrl) {
      return {
        success: true,
        invoice,
        paymentUrl: null,
        paymentLink: null,
        paymentPageUrl: null,
        expiresAt,
        provider: primaryProvider || null,
        availableOnlinePaymentMethods: availableMethods,
      };
    }

    return {
      success: true,
      paymentLink,
      paymentPageUrl,
      expiresAt,
      provider: primaryProvider || null,
      availableOnlinePaymentMethods: availableMethods,
    };
  }

  // -------------------------------------------------------------------------
  // PUT /api/invoices/:id  (line 7381)
  // -------------------------------------------------------------------------

  async updateInvoice(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; invoice: Record<string, unknown> }> {
    const raw = await this.invoiceModel.findByIdAndUpdate(id, { $set: body }, { new: true }).lean() as Record<string, unknown> | null;
    const updated = await this.hydrateSingleInvoice(raw);
    if (!updated) throw new NotFoundException('Invoice not found');
    return { success: true, invoice: updated };
  }

  // -------------------------------------------------------------------------
  // DELETE /api/invoices/:id  (line 7391)
  // -------------------------------------------------------------------------

  async deleteInvoice(
    id: string,
    query: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; invoiceDeleteCount: number; paymentDeleteCount: number; familyUpdateCount: number }> {
    const normalizedInvoiceId = String(id || '').trim();

    const invoice = await this.invoiceModel.findById(normalizedInvoiceId).lean() as Record<string, unknown> | null;
    const resolvedFamilyId = String(
      (query.familyId as string | undefined) ||
      (body?.familyId as string | undefined) ||
      (invoice?.familyId as string | undefined) ||
      '',
    ).trim();

    const [paymentDelete, invoiceDelete] = await Promise.all([
      this.paymentModel.deleteMany({ invoiceId: normalizedInvoiceId }),
      this.invoiceModel.deleteOne({ _id: normalizedInvoiceId }),
    ]);

    let familyUpdateCount = 0;
    if (resolvedFamilyId) {
      const family = await this.familyModel.findById(resolvedFamilyId).lean() as Record<string, unknown> | null;
      if (family) {
        const rawFamily = (family.raw || {}) as Record<string, unknown>;
        const existingInvoices = Array.isArray(rawFamily.invoices)
          ? rawFamily.invoices as Record<string, unknown>[]
          : Array.isArray(family.invoices)
            ? family.invoices as Record<string, unknown>[]
            : [];
        const filtered = existingInvoices.filter((e) => {
          const eid = String((e as Record<string, unknown>)?.id || (e as Record<string, unknown>)?._id || '').trim();
          return eid !== normalizedInvoiceId;
        });
        if (filtered.length !== existingInvoices.length) {
          await this.familyModel.findByIdAndUpdate(resolvedFamilyId, { $set: { 'raw.invoices': filtered } });
          familyUpdateCount = 1;
        }
      }
    }

    return {
      success: true,
      invoiceDeleteCount: Number((invoiceDelete as { deletedCount?: number }).deletedCount || 0),
      paymentDeleteCount: Number((paymentDelete as { deletedCount?: number }).deletedCount || 0),
      familyUpdateCount,
    };
  }

  // -------------------------------------------------------------------------
  // POST /api/invoices/:id/send  (line 7401)
  // -------------------------------------------------------------------------

  async sendInvoice(id: string): Promise<{ success: boolean; invoice: Record<string, unknown> }> {
    const raw = await this.invoiceModel
      .findByIdAndUpdate(id, { $set: { sentToParent: true, sentDate: new Date() } }, { new: true })
      .lean() as Record<string, unknown> | null;
    const updated = await this.hydrateSingleInvoice(raw);
    if (!updated) throw new NotFoundException('Invoice not found');
    return { success: true, invoice: updated };
  }

  // -------------------------------------------------------------------------
  // GET /api/parent/:parentId/invoices  (line 8746)
  // -------------------------------------------------------------------------

  async getParentInvoices(
    parentId: string,
  ): Promise<{ success: boolean; invoices: Record<string, unknown>[] }> {
    const family = await this.familyModel.findOne({ parentUid: parentId }).lean() as Record<string, unknown> | null;
    const familyId = family ? String(family._id || '') : parentId;

    const invoiceDocs = await this.invoiceModel
      .find({ familyId })
      .sort({ createdAt: -1 })
      .lean() as Record<string, unknown>[];
    const hydrated = await this.hydrateInvoices(invoiceDocs);
    return { success: true, invoices: hydrated };
  }
}
