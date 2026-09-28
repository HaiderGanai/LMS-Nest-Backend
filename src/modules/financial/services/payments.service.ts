import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import crypto from 'crypto';
import type { Model } from 'mongoose';
import type { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';

// ---------------------------------------------------------------------------
// Helpers (ported from server-janus-multi-profile.js)
// ---------------------------------------------------------------------------

function normalizeCurrencyCode(value: unknown, fallback = 'USD'): string {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
}

function normalizeOnlinePaymentMethod(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

const ONLINE_PAYMENT_METHODS = new Set(['stripe', 'paypal']);

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_API_VERSION = String(process.env.STRIPE_API_VERSION || '2023-10-16').trim();
const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || '').trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
const PAYPAL_API_BASE = String(process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com').trim();
const PAYMENT_LINK_TTL_MS = Number(process.env.PAYMENT_LINK_TTL_MS || 45 * 24 * 60 * 60 * 1000);
const PAYMENT_PUBLIC_BASE_URL = String(process.env.PAYMENT_PUBLIC_BASE_URL || '').trim();
const AUTH_ACCESS_TOKEN_SECRET = String(process.env.AUTH_ACCESS_TOKEN_SECRET || '').trim();
const SOCKET_AUTH_SIGNING_KEY = String(process.env.SOCKET_AUTH_SIGNING_KEY || '').trim();

const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

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

function toStripeMinorAmount(amount: number, currency: string): number {
  return STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency) ? Math.round(amount) : Math.round(amount * 100);
}

function formatGatewayAmount(amount: number, currency: string): string {
  const isZeroDecimal = STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency);
  return isZeroDecimal ? String(Math.round(amount)) : amount.toFixed(2);
}

function mapPaymentRecordForClient(payment: Record<string, unknown>): Record<string, unknown> {
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
  invoice: Record<string, unknown>,
  totalAmount: number,
  paidAmount: number,
  remainingAmount: number,
): string {
  if (invoice.status === 'cancelled') return 'cancelled';
  if (remainingAmount <= 0 && totalAmount > 0) return 'paid';
  if (paidAmount > 0) return 'partially_paid';
  return invoice.status === 'cancelled' ? 'cancelled' : 'pending';
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

function getRequestOriginFromReq(req: { headers: Record<string, string | string[] | undefined>; get?(name: string): string | undefined }): string {
  if (PAYMENT_PUBLIC_BASE_URL) return PAYMENT_PUBLIC_BASE_URL;
  const protoHeader = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hostHeader = String(
    (req.headers['x-forwarded-host'] as string | undefined) ||
    (req.get ? req.get('host') : '') ||
    '',
  ).split(',')[0].trim();
  if (!hostHeader) return '';
  return `${protoHeader || 'https'}://${hostHeader}`;
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

function isValidInvoicePaymentLinkSignature(
  invoiceId: string,
  expiresAt: number,
  signature: string,
  provider = '',
  familyId = '',
): boolean {
  if (!signature) return false;
  if (expiresAt && expiresAt < Date.now()) return false;
  const expected = createInvoicePaymentLinkSignature(invoiceId, expiresAt, provider, familyId);
  if (!expected) return true; // No signing key — allow all (open mode)
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function buildStripeEmbeddedPaymentUrl(opts: {
  req: { headers: Record<string, string | string[] | undefined>; get?(name: string): string | undefined };
  invoiceId: string;
  expiresAt: number;
  familyId?: string;
}): string {
  const origin = getRequestOriginFromReq(opts.req);
  if (!origin) return '';
  const familyId = opts.familyId || '';
  const signature = createInvoicePaymentLinkSignature(opts.invoiceId, opts.expiresAt, 'stripe', familyId);
  if (!signature) return '';
  const params = new URLSearchParams({ expires: String(opts.expiresAt), sig: signature });
  if (familyId) params.set('familyId', familyId);
  return `${origin}/payments/stripe/embedded/${encodeURIComponent(opts.invoiceId)}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Stripe helpers
// ---------------------------------------------------------------------------

async function retrieveStripePaymentIntent(paymentIntentId: string): Promise<Record<string, unknown>> {
  if (!isStripeConfigured()) {
    const error = new Error('Stripe is not configured') as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }
  const response = await axios.get(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Stripe-Version': STRIPE_API_VERSION,
      },
      params: { 'expand[]': ['latest_charge'] },
      timeout: 20000,
    },
  );
  return response.data as Record<string, unknown>;
}

async function retrieveStripeCheckoutSession(sessionId: string): Promise<Record<string, unknown>> {
  if (!isStripeConfigured()) {
    const error = new Error('Stripe is not configured') as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }
  const response = await axios.get(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Stripe-Version': STRIPE_API_VERSION,
      },
      params: { 'expand[]': ['payment_intent'] },
      timeout: 20000,
    },
  );
  return response.data as Record<string, unknown>;
}

async function createOrReuseStripePaymentIntent(opts: {
  invoice: Record<string, unknown>;
  invoiceId: string;
  familyId?: string;
  parentId?: string;
  invoiceModel: Model<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  if (!isStripeConfigured()) {
    const error = new Error('Stripe is not configured') as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }

  const { invoice, invoiceId, familyId = '', parentId = '', invoiceModel } = opts;
  if (!invoiceId) {
    const error = new Error('Invoice ID is missing for Stripe payment') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const currency = normalizeCurrencyCode(
    (invoice.currency as string | undefined) ||
    ((invoice.raw as Record<string, unknown>)?.currency as string | undefined) ||
    'USD',
  );
  const amount = Number(
    (invoice.remainingAmount as number | undefined) ??
    Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0),
  );
  const minorAmount = toStripeMinorAmount(amount, currency);
  if (!Number.isFinite(amount) || amount <= 0 || minorAmount <= 0) {
    const error = new Error('This invoice does not have a payable Stripe balance') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const reusableStatuses = new Set([
    'requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture',
  ]);
  const existingPaymentIntentId = String(
    (invoice?.raw as Record<string, unknown>)?.stripePaymentIntentId ||
    (invoice?.stripePaymentIntentId as string | undefined) ||
    '',
  ).trim();

  let paymentIntent: Record<string, unknown> | null = null;
  if (existingPaymentIntentId) {
    try {
      const existingIntent = await retrieveStripePaymentIntent(existingPaymentIntentId);
      const intentCurrency = normalizeCurrencyCode(existingIntent?.currency || currency);
      const intentAmount = Number(existingIntent?.amount || 0);
      if (
        reusableStatuses.has(String(existingIntent?.status || '').toLowerCase()) &&
        intentCurrency === currency &&
        intentAmount === minorAmount
      ) {
        paymentIntent = existingIntent;
      }
    } catch {
      paymentIntent = null;
    }
  }

  if (!paymentIntent) {
    const params = new URLSearchParams();
    params.set('amount', String(minorAmount));
    params.set('currency', currency.toLowerCase());
    params.set('payment_method_types[0]', 'card');
    params.set('description', `Invoice ${(invoice.invoiceNumber as string | undefined) || invoiceId}`);
    params.set('metadata[invoiceId]', invoiceId);
    params.set('metadata[parentId]', String(parentId || ''));
    params.set('metadata[familyId]', String(familyId || ''));
    params.set('metadata[invoiceNumber]', String((invoice.invoiceNumber as string | undefined) || ''));
    params.set('metadata[source]', 'parent_app_embedded');
    const customerEmail = String((invoice.email as string | undefined) || ((invoice.raw as Record<string, unknown>)?.email as string | undefined) || '').trim();
    if (customerEmail) params.set('receipt_email', customerEmail);
    const description = String((invoice.description as string | undefined) || (invoice.notes as string | undefined) || (invoice.billingMonth as string | undefined) || '').trim();
    if (description) params.set('statement_descriptor_suffix', description.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 22));

    const response = await axios.post(
      'https://api.stripe.com/v1/payment_intents',
      params.toString(),
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': STRIPE_API_VERSION,
          'Idempotency-Key': `invoice-${invoiceId}-${minorAmount}-embedded-card`,
        },
        timeout: 20000,
      },
    );
    paymentIntent = response.data as Record<string, unknown>;
  }

  await invoiceModel.findByIdAndUpdate(invoiceId, {
    $set: {
      'raw.stripePaymentIntentId': paymentIntent?.id || '',
      'raw.stripePaymentIntentStatus': paymentIntent?.status || '',
    },
  });

  return paymentIntent;
}

async function createStripeCheckoutSession(opts: {
  req: { headers: Record<string, string | string[] | undefined>; get?(name: string): string | undefined };
  parentId: string;
  familyId: string;
  invoice: Record<string, unknown>;
  invoiceId: string;
  invoiceModel: Model<Record<string, unknown>>;
}): Promise<{ provider: string; checkoutUrl: string; gatewayId: string; raw: Record<string, unknown> }> {
  const paymentIntent = await createOrReuseStripePaymentIntent({
    invoice: opts.invoice,
    invoiceId: opts.invoiceId,
    familyId: opts.familyId,
    parentId: opts.parentId,
    invoiceModel: opts.invoiceModel,
  });
  const expiresAt = Date.now() + PAYMENT_LINK_TTL_MS;
  const checkoutUrl = buildStripeEmbeddedPaymentUrl({
    req: opts.req,
    invoiceId: opts.invoiceId,
    expiresAt,
    familyId: opts.familyId,
  });

  if (!checkoutUrl) {
    const error = new Error('Failed to create Stripe payment page') as Error & { statusCode: number };
    error.statusCode = 500;
    throw error;
  }

  return {
    provider: 'stripe',
    checkoutUrl,
    gatewayId: String(paymentIntent?.id || ''),
    raw: paymentIntent,
  };
}

// ---------------------------------------------------------------------------
// PayPal helpers
// ---------------------------------------------------------------------------

async function getPayPalAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await axios.post(
    `${PAYPAL_API_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      timeout: 20000,
    },
  );
  return (response.data as Record<string, unknown>)?.access_token as string;
}

async function createPayPalCheckoutOrder(opts: {
  req: { headers: Record<string, string | string[] | undefined>; get?(name: string): string | undefined };
  invoice: Record<string, unknown>;
  invoiceId: string;
}): Promise<{ provider: string; checkoutUrl: string; gatewayId: string; raw: Record<string, unknown> }> {
  if (!isPayPalConfigured()) {
    const error = new Error('PayPal is not configured') as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }

  const { invoice, invoiceId } = opts;
  if (!invoiceId) {
    const error = new Error('Invoice ID is missing for PayPal checkout') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const currency = normalizeCurrencyCode(
    (invoice.currency as string | undefined) ||
    ((invoice.raw as Record<string, unknown>)?.currency as string | undefined) ||
    'USD',
  );
  if (!PAYPAL_SUPPORTED_CURRENCIES.has(currency)) {
    const error = new Error(`PayPal does not support ${currency} invoices for this checkout flow`) as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const amount = Number(
    (invoice.remainingAmount as number | undefined) ??
    Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0),
  );
  const origin = getRequestOriginFromReq(opts.req);
  const accessToken = await getPayPalAccessToken();
  const requestId = `invoice-${invoiceId}-${Date.now()}`;

  const response = await axios.post(
    `${PAYPAL_API_BASE}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: invoiceId,
          custom_id: invoiceId,
          description: `Invoice ${(invoice.invoiceNumber as string | undefined) || invoiceId}`.slice(0, 127),
          amount: {
            currency_code: currency,
            value: formatGatewayAmount(amount, currency),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${origin}/payments/paypal/return?invoiceId=${encodeURIComponent(invoiceId)}`,
            cancel_url: `${origin}/payments/paypal/cancel?invoiceId=${encodeURIComponent(invoiceId)}`,
            user_action: 'PAY_NOW',
          },
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': requestId,
      },
      timeout: 20000,
    },
  );

  const data = response.data as Record<string, unknown>;
  const links = data?.links as Array<{ rel: string; href: string }> | undefined;
  const checkoutUrl = links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href || '';

  return {
    provider: 'paypal',
    checkoutUrl,
    gatewayId: String(data?.id || ''),
    raw: data,
  };
}

async function capturePayPalOrder(orderId: string): Promise<Record<string, unknown>> {
  if (!isPayPalConfigured()) {
    const error = new Error('PayPal is not configured') as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }
  const accessToken = await getPayPalAccessToken();
  const response = await axios.post(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    },
  );
  return response.data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// recordGatewayPayment — ported from line 3439
// ---------------------------------------------------------------------------

async function recordGatewayPayment(opts: {
  invoice: Record<string, unknown>;
  provider: string;
  amount: number;
  currency: string;
  familyId: string;
  transactionId?: string;
  gatewayId?: string;
  metadata?: Record<string, unknown>;
  paymentModel: Model<Record<string, unknown>>;
  invoiceModel: Model<Record<string, unknown>>;
}): Promise<{ paymentId: string; receiptNumber: string; invoice: Record<string, unknown> | null; payment: Record<string, unknown>; duplicate: boolean }> {
  const { invoice, provider, amount, currency, familyId, transactionId = '', gatewayId = '', metadata = {}, paymentModel, invoiceModel } = opts;
  const invoiceId = String(invoice._id || '');

  const duplicateFilter: Record<string, unknown> = {
    invoiceId,
    familyId,
    'raw.provider': provider,
  };
  if (gatewayId) {
    duplicateFilter['raw.gatewayId'] = gatewayId;
  } else if (transactionId) {
    duplicateFilter['raw.transactionId'] = transactionId;
  }

  const existing = await paymentModel.findOne(duplicateFilter).lean() as Record<string, unknown> | null;
  if (existing) {
    return {
      paymentId: String(existing._id || ''),
      receiptNumber: String(((existing.raw as Record<string, unknown>)?.receiptNumber) || ''),
      invoice: null,
      payment: mapPaymentRecordForClient(existing),
      duplicate: true,
    };
  }

  const paymentId = crypto.randomBytes(12).toString('hex');
  const receiptNumber = `REC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const payment = await paymentModel.create({
    _id: paymentId,
    invoiceId,
    familyId,
    amount: Number(amount || 0),
    method: provider,
    raw: {
      ...metadata,
      provider,
      currency,
      gatewayId,
      transactionId: transactionId || gatewayId || '',
      receiptNumber,
      notes: `Paid via ${provider}`,
      status: 'completed',
    },
  });

  // Sync invoice payment state
  const [invoiceDoc, paymentDocs] = await Promise.all([
    invoiceModel.findById(invoiceId).lean() as Promise<Record<string, unknown> | null>,
    paymentModel.find({ invoiceId }).sort({ createdAt: -1 }).lean() as Promise<Record<string, unknown>[]>,
  ]);

  let hydratedInvoice: Record<string, unknown> | null = null;
  if (invoiceDoc) {
    const totalAmount = Number(invoiceDoc.totalAmount || 0);
    const paidAmount = paymentDocs.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const status = deriveInvoiceStatus(invoiceDoc, totalAmount, paidAmount, remainingAmount);
    await invoiceModel.findByIdAndUpdate(invoiceId, {
      $set: { paidAmount, remainingAmount, status },
    });
    hydratedInvoice = { ...invoiceDoc, paidAmount, remainingAmount, status };
  }

  return {
    paymentId,
    receiptNumber,
    invoice: hydratedInvoice,
    payment: mapPaymentRecordForClient((payment as unknown as { toObject(): Record<string, unknown> }).toObject()),
    duplicate: false,
  };
}

// ---------------------------------------------------------------------------
// recordAdminInvoicePayment — ported from line 2829
// ---------------------------------------------------------------------------

async function recordAdminInvoicePayment(opts: {
  invoiceId: string;
  familyId: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  notes?: string;
  recordedBy?: string;
  paymentModel: Model<Record<string, unknown>>;
  invoiceModel: Model<Record<string, unknown>>;
}): Promise<{
  paymentId: string;
  receiptNumber: string;
  invoice: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  duplicate: boolean;
  alreadyPaid: boolean;
}> {
  const { invoiceId, familyId, amount, paymentMethod, transactionId = '', notes = '', recordedBy = '', paymentModel, invoiceModel } = opts;

  // Load current invoice
  const [invoiceDoc, paymentDocs] = await Promise.all([
    invoiceModel.findById(invoiceId).lean() as Promise<Record<string, unknown> | null>,
    paymentModel.find({ invoiceId }).sort({ createdAt: -1 }).lean() as Promise<Record<string, unknown>[]>,
  ]);

  if (!invoiceDoc) {
    const error = new Error('Invoice not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  if (String(invoiceDoc.status || '').toLowerCase() === 'cancelled') {
    const error = new Error('Cancelled invoices cannot be marked as paid') as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  const normalizedFamilyId = String(familyId || invoiceDoc.familyId || '').trim();
  const normalizedMethod = String(paymentMethod || '').trim() || 'bank_transfer';
  const normalizedTransactionId = String(transactionId || '').trim();
  const normalizedNotes = String(notes || '').trim();
  const amountNumber = Number(amount || 0);

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    const error = new Error('A valid payment amount is required') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const totalAmount = Number(invoiceDoc.totalAmount || 0);
  const paidAmount = paymentDocs.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  if (remainingAmount <= 0 || String(invoiceDoc.status || '').toLowerCase() === 'paid') {
    return {
      paymentId: '',
      receiptNumber: '',
      invoice: invoiceDoc,
      payment: null,
      duplicate: true,
      alreadyPaid: true,
    };
  }

  if (amountNumber > remainingAmount + 0.0001) {
    const error = new Error(`Payment exceeds remaining balance of ${remainingAmount}`) as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  // Duplicate check
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const existingFilter: Record<string, unknown> = {
    invoiceId,
    familyId: normalizedFamilyId,
    amount: amountNumber,
    method: normalizedMethod,
    createdAt: { $gte: twoDaysAgo },
  };
  if (normalizedTransactionId) {
    existingFilter['raw.transactionId'] = normalizedTransactionId;
  }

  const existing = await paymentModel.findOne(existingFilter).sort({ createdAt: -1 }).lean() as Record<string, unknown> | null;
  if (existing) {
    return {
      paymentId: String(existing._id || ''),
      receiptNumber: String(((existing.raw as Record<string, unknown>)?.receiptNumber) || ''),
      invoice: invoiceDoc,
      payment: mapPaymentRecordForClient(existing),
      duplicate: true,
      alreadyPaid: false,
    };
  }

  const paymentId = crypto.randomBytes(12).toString('hex');
  const receiptNumber = `REC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const payment = await paymentModel.create({
    _id: paymentId,
    invoiceId: String(invoiceId || '').trim(),
    familyId: normalizedFamilyId,
    amount: amountNumber,
    method: normalizedMethod,
    raw: {
      transactionId: normalizedTransactionId,
      notes: normalizedNotes,
      receiptNumber,
      recordedBy: String(recordedBy || '').trim(),
      status: 'completed',
    },
  });

  // Sync invoice state
  const allPayments = await paymentModel.find({ invoiceId }).sort({ createdAt: -1 }).lean() as Record<string, unknown>[];
  const newPaidAmount = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
  const newStatus = deriveInvoiceStatus(invoiceDoc, totalAmount, newPaidAmount, newRemainingAmount);

  await invoiceModel.findByIdAndUpdate(invoiceId, {
    $set: { paidAmount: newPaidAmount, remainingAmount: newRemainingAmount, status: newStatus },
  });

  const updatedInvoice = await invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;

  return {
    paymentId,
    receiptNumber,
    invoice: updatedInvoice,
    payment: mapPaymentRecordForClient((payment as unknown as { toObject(): Record<string, unknown> }).toObject()),
    duplicate: false,
    alreadyPaid: false,
  };
}

// ---------------------------------------------------------------------------
// HTML page renderers (minimal — for public payment callbacks)
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPaymentStatusPage(opts: { title: string; heading: string; body: string; accent?: string }): string {
  const { title, heading, body, accent = '#1f8f6a' } = opts;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f6f8fb; color: #1d2433; }
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { width: 100%; max-width: 520px; background: #fff; border-radius: 18px; box-shadow: 0 18px 45px rgba(20,32,61,0.12); padding: 28px; border-top: 6px solid ${accent}; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0 0 10px; line-height: 1.55; color: #4c5870; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${escapeHtml(heading)}</h1>
        <p>${escapeHtml(body)}</p>
      </div>
    </div>
  </body>
</html>`;
}

function renderStripeEmbeddedPaymentPage(opts: {
  invoice: Record<string, unknown>;
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  cancelUrl: string;
}): string {
  const { invoice, publishableKey, clientSecret, returnUrl, cancelUrl } = opts;
  const remaining = Number(invoice.remainingAmount || invoice.totalAmount || 0);
  const currency = String(invoice.currency || 'USD').toUpperCase();
  const invoiceNumber = String(invoice.invoiceNumber || invoice._id || '');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pay Invoice ${escapeHtml(invoiceNumber)}</title>
    <script src="https://js.stripe.com/v3/"></script>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f6f8fb; color: #1d2433; }
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { width: 100%; max-width: 560px; background: #fff; border-radius: 18px; box-shadow: 0 18px 45px rgba(20,32,61,0.12); padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      .amount { font-size: 32px; font-weight: 700; margin: 8px 0 24px; color: #1f8f6a; }
      #payment-element { margin: 16px 0; }
      .pay-btn { width: 100%; padding: 14px; border: 0; border-radius: 10px; background: #635bff; color: white; font-size: 16px; font-weight: 600; cursor: pointer; }
      .pay-btn:disabled { background: #999; cursor: not-allowed; }
      .cancel { text-align: center; margin-top: 12px; }
      .cancel a { color: #999; font-size: 14px; }
      #payment-message { color: #c0392b; margin-top: 12px; min-height: 20px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Pay Invoice ${escapeHtml(invoiceNumber)}</h1>
        <div class="amount">${escapeHtml(currency)} ${remaining.toFixed(2)}</div>
        <form id="payment-form">
          <div id="payment-element"></div>
          <button id="submit" class="pay-btn"><span id="button-text">Pay now</span></button>
          <div id="payment-message"></div>
        </form>
        <div class="cancel"><a href="${escapeHtml(cancelUrl)}">Cancel payment</a></div>
      </div>
    </div>
    <script>
      const stripe = Stripe(${JSON.stringify(publishableKey)});
      const elements = stripe.elements({ clientSecret: ${JSON.stringify(clientSecret)} });
      const paymentElement = elements.create('payment');
      paymentElement.mount('#payment-element');
      const form = document.getElementById('payment-form');
      const messageEl = document.getElementById('payment-message');
      const submitBtn = document.getElementById('submit');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        document.getElementById('button-text').textContent = 'Processing...';
        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: ${JSON.stringify(returnUrl)} },
        });
        if (error) {
          messageEl.textContent = error.message || 'Payment failed';
          submitBtn.disabled = false;
          document.getElementById('button-text').textContent = 'Pay now';
        }
      });
    </script>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel('Payment') private readonly paymentModel: Model<Record<string, unknown>>,
    @InjectModel('Invoice') private readonly invoiceModel: Model<Record<string, unknown>>,
    @InjectModel('Family') private readonly familyModel: Model<Record<string, unknown>>,
    @InjectModel('User') private readonly userModel: Model<Record<string, unknown>>,
  ) {}

  // -------------------------------------------------------------------------
  // GET /api/payments  (line 7413)
  // -------------------------------------------------------------------------

  async getPayments(
    query: Record<string, unknown>,
    req: FamilyScopedRequest,
  ): Promise<{ success: boolean; payments: Record<string, unknown>[] }> {
    const filter: Record<string, unknown> = {};
    if (query.invoiceId) filter.invoiceId = query.invoiceId;
    if (query.familyId) filter.familyId = query.familyId;

    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      if (filter.familyId) {
        if (!req.familyScope.includes(String(filter.familyId))) {
          return { success: true, payments: [] };
        }
      } else {
        filter.familyId = { $in: req.familyScope };
      }
    }

    const payments = await this.paymentModel.find(filter).sort({ createdAt: -1 }).lean() as Record<string, unknown>[];
    return { success: true, payments };
  }

  // -------------------------------------------------------------------------
  // POST /api/payments  (line 7423) — manual payment via recordAdminInvoicePayment
  // -------------------------------------------------------------------------

  async createPayment(body: Record<string, unknown>): Promise<{ success: boolean } & Record<string, unknown>> {
    const { invoiceId, amount, paymentMethod, transactionId, notes, familyId, recordedBy } = body as Record<string, string | number>;
    const result = await recordAdminInvoicePayment({
      invoiceId: String(invoiceId || '').trim(),
      familyId: String(familyId || '').trim(),
      amount: Number(amount || 0),
      paymentMethod: String(paymentMethod || '').trim(),
      transactionId: String(transactionId || '').trim(),
      notes: String(notes || '').trim(),
      recordedBy: String(recordedBy || '').trim(),
      paymentModel: this.paymentModel,
      invoiceModel: this.invoiceModel,
    });
    return { success: true, ...result };
  }

  // -------------------------------------------------------------------------
  // GET /api/payments/invoice/:invoiceId  (line 7439)
  // -------------------------------------------------------------------------

  async getPaymentsByInvoiceId(
    invoiceId: string,
    req: FamilyScopedRequest,
  ): Promise<{ success: boolean; payments: Record<string, unknown>[] }> {
    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      const invoice = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
      if (invoice) {
        const fid = String(invoice.familyId || '');
        if (fid && !req.familyScope.includes(fid)) {
          return { success: true, payments: [] };
        }
      }
    }
    const payments = await this.paymentModel.find({ invoiceId }).sort({ createdAt: -1 }).lean() as Record<string, unknown>[];
    return { success: true, payments };
  }

  // -------------------------------------------------------------------------
  // GET /api/payments/family/:familyId  (line 7446)
  // -------------------------------------------------------------------------

  async getPaymentsByFamilyId(
    familyId: string,
    req: FamilyScopedRequest,
  ): Promise<{ success: boolean; payments: Record<string, unknown>[] }> {
    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      if (!req.familyScope.includes(String(familyId))) {
        return { success: true, payments: [] };
      }
    }
    const payments = await this.paymentModel.find({ familyId }).sort({ createdAt: -1 }).lean() as Record<string, unknown>[];
    return { success: true, payments };
  }

  // -------------------------------------------------------------------------
  // GET /api/parent/:parentId/invoices — load family by parentUid  (line 8746)
  // Actual invoice hydration lives in InvoicesService.getParentInvoices()
  // This method is kept for the payments controller's parent route.
  // -------------------------------------------------------------------------

  async getParentFamilyId(parentId: string): Promise<string> {
    const user = await this.userModel.findById(parentId).lean() as Record<string, unknown> | null;
    if (!user || String(user.role || '').toLowerCase() !== 'parent') {
      throw new NotFoundException('Parent not found');
    }
    const family = await this.familyModel.findOne({ parentUid: parentId }).lean() as Record<string, unknown> | null;
    return family ? String(family._id || '') : parentId;
  }

  // -------------------------------------------------------------------------
  // POST /api/parent/:parentId/invoices/:invoiceId/checkout  (line 8764)
  // -------------------------------------------------------------------------

  async checkoutInvoice(
    parentId: string,
    invoiceId: string,
    body: Record<string, unknown>,
    req: FamilyScopedRequest,
  ): Promise<Record<string, unknown>> {
    const provider = normalizeOnlinePaymentMethod(body?.provider);
    if (!ONLINE_PAYMENT_METHODS.has(provider)) {
      throw new BadRequestException('Unsupported payment provider');
    }

    // Verify user access: admin can do anything; parent must match parentId
    const user = req.user as { role?: string; uid?: string } | undefined;
    if (user?.role === 'parent' && String(user?.uid || '').trim() !== String(parentId || '').trim()) {
      throw new ForbiddenException('Access denied');
    }

    const userDoc = await this.userModel.findById(parentId).lean() as Record<string, unknown> | null;
    if (!userDoc || String(userDoc.role || '').toLowerCase() !== 'parent') {
      throw new NotFoundException('Parent not found');
    }

    const family = await this.familyModel.findOne({ parentUid: parentId }).lean() as Record<string, unknown> | null;
    const familyId = family ? String(family._id || '') : parentId;

    const invoiceDoc = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
    if (!invoiceDoc) throw new NotFoundException('Invoice not found');
    if (String(invoiceDoc.familyId || '') !== String(familyId)) {
      throw new ForbiddenException('Invoice does not belong to this parent');
    }

    // Determine available online methods
    const preferredMethods = Array.isArray(invoiceDoc.preferredPaymentMethods)
      ? (invoiceDoc.preferredPaymentMethods as string[]).map(normalizeOnlinePaymentMethod)
      : [];
    const availableMethods: string[] = [];
    if (preferredMethods.includes('stripe') && isStripeConfigured()) availableMethods.push('stripe');
    if (preferredMethods.includes('paypal') && isPayPalConfigured()) {
      const currency = normalizeCurrencyCode((invoiceDoc.currency as string | undefined) || 'USD');
      if (PAYPAL_SUPPORTED_CURRENCIES.has(currency)) availableMethods.push('paypal');
    }

    if (!availableMethods.includes(provider)) {
      throw new BadRequestException(`${provider} is not enabled for this invoice`);
    }

    const status = String(invoiceDoc.status || '');
    if (status === 'paid' || status === 'cancelled') {
      throw new BadRequestException('This invoice is not payable online');
    }

    const totalAmount = Number(invoiceDoc.totalAmount || 0);
    const paidAmount = Number(invoiceDoc.paidAmount || 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    if (remainingAmount <= 0) {
      throw new BadRequestException('This invoice has no remaining balance');
    }

    const hydratedInvoice = { ...invoiceDoc, remainingAmount, totalAmount, paidAmount };
    const expressReq = req as unknown as { headers: Record<string, string | string[] | undefined>; get(name: string): string | undefined };

    const checkout = provider === 'paypal'
      ? await createPayPalCheckoutOrder({ req: expressReq, invoice: hydratedInvoice, invoiceId })
      : await createStripeCheckoutSession({
          req: expressReq,
          parentId,
          familyId,
          invoice: hydratedInvoice,
          invoiceId,
          invoiceModel: this.invoiceModel,
        });

    if (!checkout.checkoutUrl) {
      throw new InternalServerErrorException(`Failed to create ${provider} checkout link`);
    }

    return {
      success: true,
      provider,
      checkoutUrl: checkout.checkoutUrl,
      gatewayId: checkout.gatewayId,
      invoiceId: String(invoiceDoc._id || ''),
      invoiceNumber: String((invoiceDoc.invoiceNumber as string | undefined) || ''),
      remainingAmount,
      currency: normalizeCurrencyCode((invoiceDoc.currency as string | undefined) || 'USD'),
    };
  }

  // -------------------------------------------------------------------------
  // GET /payments/invoice/:invoiceId  (line 8834) — public payment page data
  // -------------------------------------------------------------------------

  async getPublicPaymentPageData(
    invoiceId: string,
    query: Record<string, unknown>,
  ): Promise<{ valid: boolean; invoice?: Record<string, unknown>; error?: string; statusCode?: number }> {
    const expiresAt = Number(query.expires || 0);
    const signature = String(query.sig || '').trim();
    const familyId = String(query.familyId || '').trim();

    if (!isValidInvoicePaymentLinkSignature(invoiceId, expiresAt, signature, '', familyId)) {
      return { valid: false, error: 'Payment link expired or invalid', statusCode: 403 };
    }

    const invoiceDoc = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
    if (!invoiceDoc) return { valid: false, error: 'Invoice not found', statusCode: 404 };

    if (familyId && String(invoiceDoc.familyId || '').trim() !== familyId) {
      return { valid: false, error: 'Invalid payment link', statusCode: 403 };
    }

    const totalAmount = Number(invoiceDoc.totalAmount || 0);
    const paidAmount = Number(invoiceDoc.paidAmount || 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const status = String(invoiceDoc.status || '');

    if (status === 'paid' || status === 'cancelled' || remainingAmount <= 0) {
      return { valid: false, error: 'Invoice is not payable', statusCode: 400 };
    }

    return { valid: true, invoice: { ...invoiceDoc, remainingAmount } };
  }

  // -------------------------------------------------------------------------
  // GET /payments/stripe/success  (line 9121)
  // -------------------------------------------------------------------------

  async handleStripeSuccess(
    query: Record<string, unknown>,
  ): Promise<{ html: string; statusCode: number }> {
    try {
      const sessionId = String(query.session_id || '').trim();
      const paymentIntentId = String(query.payment_intent || '').trim();
      let invoice: Record<string, unknown> | null = null;

      if (sessionId) {
        const session = await retrieveStripeCheckoutSession(sessionId);
        if (String(session?.payment_status || '').toLowerCase() !== 'paid') {
          return {
            statusCode: 400,
            html: renderPaymentStatusPage({ title: 'Stripe Payment', heading: 'Payment not completed', body: 'Stripe has not marked this checkout session as paid yet.', accent: '#c0392b' }),
          };
        }

        const invoiceId = String((session?.metadata as Record<string, string>)?.invoiceId || session?.client_reference_id || '').trim();
        invoice = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
        if (!invoice) {
          return {
            statusCode: 404,
            html: renderPaymentStatusPage({ title: 'Stripe Payment', heading: 'Invoice not found', body: 'The invoice linked with this Stripe payment could not be found.', accent: '#c0392b' }),
          };
        }

        const currency = normalizeCurrencyCode((session.currency as string | undefined) || (invoice.currency as string | undefined) || 'USD');
        const amount = Number(session.amount_total || 0) / (STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100);
        await recordGatewayPayment({
          invoice,
          provider: 'stripe',
          amount,
          currency,
          familyId: String(invoice.familyId || ''),
          transactionId: typeof session.payment_intent === 'object'
            ? String((session.payment_intent as Record<string, unknown>)?.id || '')
            : String(session.payment_intent || ''),
          gatewayId: String(session.id || ''),
          metadata: {
            checkoutSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === 'object'
              ? String((session.payment_intent as Record<string, unknown>)?.id || '')
              : String(session.payment_intent || ''),
            customerEmail: String((session.customer_details as Record<string, unknown>)?.email || ''),
          },
          paymentModel: this.paymentModel,
          invoiceModel: this.invoiceModel,
        });
      } else if (paymentIntentId) {
        const paymentIntent = await retrieveStripePaymentIntent(paymentIntentId);
        if (String(paymentIntent?.status || '').toLowerCase() !== 'succeeded') {
          return {
            statusCode: 400,
            html: renderPaymentStatusPage({ title: 'Stripe Payment', heading: 'Payment not completed', body: 'Stripe has not completed this card payment yet.', accent: '#c0392b' }),
          };
        }

        const invoiceId = String(
          (paymentIntent?.metadata as Record<string, string>)?.invoiceId ||
          (query.invoiceId as string | undefined) ||
          '',
        ).trim();
        invoice = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
        if (!invoice) {
          return {
            statusCode: 404,
            html: renderPaymentStatusPage({ title: 'Stripe Payment', heading: 'Invoice not found', body: 'The invoice linked with this Stripe payment could not be found.', accent: '#c0392b' }),
          };
        }

        const currency = normalizeCurrencyCode((paymentIntent.currency as string | undefined) || (invoice.currency as string | undefined) || 'USD');
        const amount = Number(paymentIntent.amount_received || paymentIntent.amount || 0) / (STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100);
        await recordGatewayPayment({
          invoice,
          provider: 'stripe',
          amount,
          currency,
          familyId: String(invoice.familyId || ''),
          transactionId: String(paymentIntent.id || ''),
          gatewayId: String(paymentIntent.id || ''),
          metadata: {
            paymentIntentId: paymentIntent.id,
            latestChargeId: typeof paymentIntent.latest_charge === 'object'
              ? String((paymentIntent.latest_charge as Record<string, unknown>)?.id || '')
              : String(paymentIntent.latest_charge || ''),
            customerEmail: String(paymentIntent.receipt_email || ''),
          },
          paymentModel: this.paymentModel,
          invoiceModel: this.invoiceModel,
        });
      } else {
        return {
          statusCode: 400,
          html: renderPaymentStatusPage({ title: 'Stripe Payment', heading: 'Missing payment details', body: 'Stripe did not return enough information to verify this payment.', accent: '#c0392b' }),
        };
      }

      return {
        statusCode: 200,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Payment received',
          body: `Invoice ${(invoice as Record<string, unknown>).invoiceNumber || (invoice as Record<string, unknown>)._id} has been paid successfully through Stripe.`,
          accent: '#2563eb',
        }),
      };
    } catch (error: unknown) {
      const err = error as { statusCode?: number; response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
      return {
        statusCode: err.statusCode || err.response?.status || 500,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Payment verification failed',
          body: err.response?.data?.error?.message || err.message || 'We could not verify this Stripe payment yet.',
          accent: '#c0392b',
        }),
      };
    }
  }

  // -------------------------------------------------------------------------
  // GET /payments/stripe/cancel  (line 9234)
  // -------------------------------------------------------------------------

  handleStripeCancel(): string {
    return renderPaymentStatusPage({
      title: 'Stripe Payment',
      heading: 'Payment cancelled',
      body: 'The Stripe checkout was cancelled before payment was completed.',
      accent: '#d97706',
    });
  }

  // -------------------------------------------------------------------------
  // GET /payments/paypal/return  (line 9243)
  // -------------------------------------------------------------------------

  async handlePayPalReturn(
    query: Record<string, unknown>,
  ): Promise<{ html: string; statusCode: number }> {
    try {
      const orderId = String(query.token || query.orderId || '').trim();
      if (!orderId) {
        return {
          statusCode: 400,
          html: renderPaymentStatusPage({ title: 'PayPal Payment', heading: 'Missing PayPal order', body: 'PayPal did not return a valid order token for this payment.', accent: '#c0392b' }),
        };
      }

      const order = await capturePayPalOrder(orderId);
      const purchaseUnit = (Array.isArray(order?.purchase_units) ? order.purchase_units[0] : {}) as Record<string, unknown>;
      const capture = (((purchaseUnit?.payments as Record<string, unknown>)?.captures as unknown[]) || [])[0] as Record<string, unknown> || {};
      const invoiceId = String(
        (purchaseUnit.custom_id as string | undefined) ||
        (purchaseUnit.reference_id as string | undefined) ||
        (query.invoiceId as string | undefined) ||
        '',
      ).trim();

      const invoice = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
      if (!invoice) {
        return {
          statusCode: 404,
          html: renderPaymentStatusPage({ title: 'PayPal Payment', heading: 'Invoice not found', body: 'The invoice linked with this PayPal payment could not be found.', accent: '#c0392b' }),
        };
      }

      if (String((capture.status as string | undefined) || (order.status as string | undefined) || '').toUpperCase() !== 'COMPLETED') {
        return {
          statusCode: 400,
          html: renderPaymentStatusPage({ title: 'PayPal Payment', heading: 'Payment not completed', body: 'PayPal has not completed this invoice payment yet.', accent: '#c0392b' }),
        };
      }

      const captureAmount = (capture.amount as Record<string, string> | undefined);
      const purchaseAmount = (purchaseUnit.amount as Record<string, string> | undefined);
      const currency = normalizeCurrencyCode(captureAmount?.currency_code || purchaseAmount?.currency_code || (invoice.currency as string | undefined) || 'USD');

      await recordGatewayPayment({
        invoice,
        provider: 'paypal',
        amount: Number(captureAmount?.value || purchaseAmount?.value || 0),
        currency,
        familyId: String(invoice.familyId || ''),
        transactionId: String((capture.id as string | undefined) || (order.id as string | undefined) || ''),
        gatewayId: String(order.id || ''),
        metadata: {
          orderId: order.id,
          captureId: String(capture.id || ''),
          payerId: String((order?.payer as Record<string, string>)?.payer_id || ''),
          payerEmail: String((order?.payer as Record<string, string>)?.email_address || ''),
        },
        paymentModel: this.paymentModel,
        invoiceModel: this.invoiceModel,
      });

      return {
        statusCode: 200,
        html: renderPaymentStatusPage({
          title: 'PayPal Payment',
          heading: 'Payment received',
          body: `Invoice ${(invoice as Record<string, unknown>).invoiceNumber || (invoice as Record<string, unknown>)._id} has been paid successfully through PayPal.`,
          accent: '#0d6efd',
        }),
      };
    } catch (error: unknown) {
      const err = error as { statusCode?: number; response?: { status?: number; data?: { message?: string } }; message?: string };
      return {
        statusCode: err.statusCode || err.response?.status || 500,
        html: renderPaymentStatusPage({
          title: 'PayPal Payment',
          heading: 'Payment verification failed',
          body: err.response?.data?.message || err.message || 'We could not verify this PayPal payment yet.',
          accent: '#c0392b',
        }),
      };
    }
  }

  // -------------------------------------------------------------------------
  // GET /payments/paypal/cancel  (line 9312)
  // -------------------------------------------------------------------------

  handlePayPalCancel(): string {
    return renderPaymentStatusPage({
      title: 'PayPal Payment',
      heading: 'Payment cancelled',
      body: 'The PayPal checkout was cancelled before payment was completed.',
      accent: '#d97706',
    });
  }

  // ---------------------------------------------------------------------------
  // GET /payments/invoice/:invoiceId/checkout — public, signed link
  // ---------------------------------------------------------------------------

  async publicInvoiceCheckout(
    invoiceId: string,
    query: Record<string, unknown>,
    req: any,
  ): Promise<{ redirectUrl?: string; html?: string; statusCode?: number }> {
    const provider = normalizeOnlinePaymentMethod(query?.provider);
    const expiresAt = Number(query?.expires || 0);
    const signature = String(query?.sig || '').trim();
    const familyId = String(query?.familyId || '').trim();

    if (!ONLINE_PAYMENT_METHODS.has(provider)) {
      return {
        statusCode: 400,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Unsupported payment provider',
          body: 'This invoice payment link requested an unsupported online payment provider.',
          accent: '#c0392b',
        }),
      };
    }

    if (!isValidInvoicePaymentLinkSignature(invoiceId, expiresAt, signature, provider, familyId)) {
      return {
        statusCode: 403,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Payment link expired',
          body: 'This invoice payment link is invalid or has expired. Please request a fresh payment link.',
          accent: '#c0392b',
        }),
      };
    }

    const invoiceDoc = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
    if (!invoiceDoc) {
      return {
        statusCode: 404,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Invoice not found',
          body: 'The invoice linked to this payment page could not be found.',
          accent: '#c0392b',
        }),
      };
    }

    if (familyId && String(invoiceDoc.familyId || '').trim() !== familyId) {
      return {
        statusCode: 403,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Invalid payment link',
          body: 'This payment link is not valid for the current account. Please request a fresh invoice link.',
          accent: '#c0392b',
        }),
      };
    }

    const availableMethods = Array.isArray((invoiceDoc as any).availableOnlinePaymentMethods)
      ? ((invoiceDoc as any).availableOnlinePaymentMethods as string[])
      : [];
    if (!availableMethods.includes(provider)) {
      return {
        statusCode: 400,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Payment provider not enabled',
          body: 'This invoice does not allow the requested online payment provider.',
          accent: '#c0392b',
        }),
      };
    }

    const totalAmount = Number(invoiceDoc.totalAmount || 0);
    const paidAmount = Number(invoiceDoc.paidAmount || 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const status = String(invoiceDoc.status || '');
    if (status === 'paid' || status === 'cancelled' || remainingAmount <= 0) {
      return {
        statusCode: 400,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Invoice is not payable',
          body: 'This invoice does not have a remaining balance for online payment.',
          accent: '#d97706',
        }),
      };
    }

    const hydratedInvoice = { ...invoiceDoc, remainingAmount, totalAmount, paidAmount };

    try {
      const checkout = provider === 'paypal'
        ? await createPayPalCheckoutOrder({ req, invoice: hydratedInvoice, invoiceId })
        : await createStripeCheckoutSession({
            req,
            parentId: '',
            familyId: String(invoiceDoc.familyId || ''),
            invoice: hydratedInvoice,
            invoiceId,
            invoiceModel: this.invoiceModel,
          });
      if (!checkout.checkoutUrl) {
        return {
          statusCode: 502,
          html: renderPaymentStatusPage({
            title: 'Invoice Payment',
            heading: 'Checkout unavailable',
            body: `We could not create a ${provider} checkout session for this invoice.`,
            accent: '#c0392b',
          }),
        };
      }
      return { redirectUrl: checkout.checkoutUrl };
    } catch (e: any) {
      return {
        statusCode: 500,
        html: renderPaymentStatusPage({
          title: 'Invoice Payment',
          heading: 'Checkout unavailable',
          body: e?.message || 'We could not create a checkout session for this invoice.',
          accent: '#c0392b',
        }),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // GET /payments/stripe/embedded/:invoiceId — public, signed link
  // ---------------------------------------------------------------------------

  async stripeEmbeddedCheckout(
    invoiceId: string,
    query: Record<string, unknown>,
    req: any,
  ): Promise<{ html: string; statusCode: number }> {
    const expiresAt = Number(query?.expires || 0);
    const signature = String(query?.sig || '').trim();
    const familyId = String(query?.familyId || '').trim();

    if (!isValidInvoicePaymentLinkSignature(invoiceId, expiresAt, signature, 'stripe', familyId)) {
      return {
        statusCode: 403,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Payment link expired',
          body: 'This Stripe payment link is invalid or has expired. Please request a fresh payment link.',
          accent: '#c0392b',
        }),
      };
    }

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
    if (!publishableKey) {
      return {
        statusCode: 503,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Stripe is not ready',
          body: 'The Stripe publishable key is missing for this environment.',
          accent: '#c0392b',
        }),
      };
    }

    const invoiceDoc = await this.invoiceModel.findById(invoiceId).lean() as Record<string, unknown> | null;
    if (!invoiceDoc) {
      return {
        statusCode: 404,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Invoice not found',
          body: 'The invoice linked with this payment page could not be found.',
          accent: '#c0392b',
        }),
      };
    }

    if (familyId && String(invoiceDoc.familyId || '').trim() !== familyId) {
      return {
        statusCode: 403,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Invalid payment link',
          body: 'This payment link is not valid for the current account. Please request a fresh invoice link.',
          accent: '#c0392b',
        }),
      };
    }

    const availableMethods = Array.isArray((invoiceDoc as any).availableOnlinePaymentMethods)
      ? ((invoiceDoc as any).availableOnlinePaymentMethods as string[])
      : [];
    if (!availableMethods.includes('stripe')) {
      return {
        statusCode: 400,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Stripe is not enabled',
          body: 'This invoice does not currently allow Stripe online payment.',
          accent: '#c0392b',
        }),
      };
    }

    const totalAmount = Number(invoiceDoc.totalAmount || 0);
    const paidAmount = Number(invoiceDoc.paidAmount || 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const status = String(invoiceDoc.status || '');
    if (status === 'paid' || status === 'cancelled' || remainingAmount <= 0) {
      return {
        statusCode: 400,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Invoice is not payable',
          body: 'This invoice does not have a remaining balance for Stripe payment.',
          accent: '#d97706',
        }),
      };
    }

    const hydratedInvoice = { ...invoiceDoc, remainingAmount, totalAmount, paidAmount };

    try {
      const paymentIntent = await createOrReuseStripePaymentIntent({
        invoice: hydratedInvoice,
        invoiceId,
        familyId: String(invoiceDoc.familyId || ''),
        parentId: '',
        invoiceModel: this.invoiceModel,
      });
      const origin = String(req?.headers?.['x-forwarded-proto'] || 'https') + '://' + String(req?.headers?.host || '');
      const returnUrl = `${origin}/payments/stripe/success?invoiceId=${encodeURIComponent(invoiceId)}`;
      const cancelUrl = `${origin}/payments/stripe/cancel?invoiceId=${encodeURIComponent(invoiceId)}`;
      return {
        statusCode: 200,
        html: renderStripeEmbeddedPaymentPage({
          invoice: hydratedInvoice,
          publishableKey,
          clientSecret: (paymentIntent as any)?.client_secret || '',
          returnUrl,
          cancelUrl,
        }),
      };
    } catch (e: any) {
      return {
        statusCode: 500,
        html: renderPaymentStatusPage({
          title: 'Stripe Payment',
          heading: 'Payment page unavailable',
          body: e?.message || 'We could not prepare the Stripe payment form.',
          accent: '#c0392b',
        }),
      };
    }
  }
}
