const crypto = require('crypto');

const MongoAppConfig = require('../models/AppConfig');
const MongoClassHours = require('../models/ClassHours');
const MongoFamily = require('../models/Family');
const MongoFamilyMember = require('../models/FamilyMember');
const MongoInvoice = require('../models/Invoice');

const AUTO_BILLING_ACTOR = {
  uid: 'system-autobilling',
  email: 'system@tarteel.local',
  name: 'System Auto Billing',
};

let runInProgress = false;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && value.$date) {
    return parseDateValue(value.$date);
  }
  return null;
}

function monthKeyFromDate(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function parseMonthKey(monthKey) {
  const normalized = String(monthKey || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function compareMonthKeys(left, right) {
  const a = parseMonthKey(left);
  const b = parseMonthKey(right);
  if (!a || !b) return 0;
  return ((a.year * 12) + a.month) - ((b.year * 12) + b.month);
}

function shiftMonthKey(monthKey, delta) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return '';
  const anchor = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));
  return monthKeyFromDate(anchor);
}

function monthKeyRangeInclusive(startMonthKey, endMonthKey) {
  if (!startMonthKey || !endMonthKey || compareMonthKeys(startMonthKey, endMonthKey) > 0) {
    return [];
  }
  const months = [];
  let cursor = startMonthKey;
  while (cursor && compareMonthKeys(cursor, endMonthKey) <= 0) {
    months.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }
  return months;
}

function getFamilyValue(family, key, fallback = null) {
  if (family && family[key] !== undefined && family[key] !== null) return family[key];
  if (family?.raw && family.raw[key] !== undefined && family.raw[key] !== null) return family.raw[key];
  return fallback;
}

function getMemberValue(member, key, fallback = null) {
  if (member && member[key] !== undefined && member[key] !== null) return member[key];
  if (member?.raw && member.raw[key] !== undefined && member.raw[key] !== null) return member.raw[key];
  return fallback;
}

function uniqueStringList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function deriveInvoiceMonthKey(invoice = {}) {
  const explicit = String(invoice.billingMonth || invoice.month || '').trim();
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;

  const candidateDates = [
    invoice.dueDate,
    invoice.issueDate,
    invoice.issuedDate,
    invoice.invoiceDate,
    invoice.sentDate,
    invoice.createdAt,
    invoice.updatedAt,
    invoice.autoBillingStartDate,
    invoice?.raw?.invoiceDate,
  ];

  for (const candidate of candidateDates) {
    const parsed = parseDateValue(candidate);
    const monthKey = monthKeyFromDate(parsed);
    if (monthKey) return monthKey;
  }

  return '';
}

function buildInvoiceSummary(invoice) {
  return {
    id: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    status: invoice.status,
    invoiceDate: invoice.issueDate || invoice.issuedDate || invoice.createdAt,
    dueDate: invoice.dueDate,
    primaryPaymentMethod: invoice.primaryPaymentMethod || '',
    isManual: invoice.invoiceType === 'manual_record',
  };
}

function buildCycleDates(targetMonthKey, billingCycle, family) {
  const parsed = parseMonthKey(targetMonthKey);
  if (!parsed) {
    const now = new Date();
    return { issueDate: now, dueDate: now, notes: 'Payment due this month' };
  }

  const { year, month } = parsed;
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const normalizedCycle = String(billingCycle || '').trim().toLowerCase();

  if (normalizedCycle === 'monthly_1st_to_1st') {
    return {
      issueDate: firstDay,
      dueDate: lastDay,
      notes: 'Auto-generated monthly invoice',
    };
  }

  const cycleDay = Math.max(1, Math.min(28, toFiniteNumber(getFamilyValue(family, 'invoiceCycleDate', 1), 1)));
  const cycleIssueDate = new Date(Date.UTC(year, month - 1, cycleDay));
  const cycleDueDate = new Date(cycleIssueDate.getTime());
  cycleDueDate.setUTCDate(cycleDueDate.getUTCDate() + 10);

  return {
    issueDate: cycleIssueDate,
    dueDate: cycleDueDate,
    notes: 'Payment due within 10 days of issue',
  };
}

async function getNextInvoiceCounter(year) {
  const updated = await MongoAppConfig.findOneAndUpdate(
    { _id: `counter:invoices_${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean();
  return Number(updated?.seq || 1);
}

async function getStudentHours(studentId, monthKey) {
  const hours = await MongoClassHours.find({ studentId, month: monthKey }).lean();
  return hours.reduce((sum, entry) => sum + toFiniteNumber(entry?.hours, 0), 0);
}

async function predictStudentHours(studentId, monthKey) {
  let totalHours = 0;
  let monthCount = 0;

  for (let i = 1; i <= 3; i += 1) {
    const previousMonthKey = shiftMonthKey(monthKey, -i);
    if (!previousMonthKey) continue;
    const hours = await getStudentHours(studentId, previousMonthKey);
    if (hours > 0) {
      totalHours += hours;
      monthCount += 1;
    }
  }

  if (monthCount > 0) {
    return Math.round((totalHours / monthCount) * 10) / 10;
  }

  return 16;
}

function getActiveStudents(members = []) {
  return (Array.isArray(members) ? members : []).filter((member) => {
    const role = String(getMemberValue(member, 'role', '') || '').trim().toLowerCase();
    const status = String(member?.status || '').trim().toLowerCase();
    const studentStatus = String(getMemberValue(member, 'studentStatus', status) || '').trim().toLowerCase();
    return role === 'student' && status === 'active' && studentStatus !== 'inactive';
  });
}

async function calculateInvoiceForFamily({
  family,
  members,
  latestTemplate,
  targetMonthKey,
  hasPriorInvoice,
}) {
  const parsedMonth = parseMonthKey(targetMonthKey);
  if (!parsedMonth) throw new Error(`Invalid target month: ${targetMonthKey}`);

  const { year, month } = parsedMonth;
  const parentName = getFamilyValue(family, 'parentName', getFamilyValue(family, 'name', 'Unknown Family'));
  const email = getFamilyValue(family, 'email', getFamilyValue(family, 'parentEmail', ''));
  const mobile = getFamilyValue(family, 'primaryMobile', '');
  const registrationCode = getFamilyValue(family, 'registrationCode', '');
  const currency = String(getFamilyValue(family, 'currency', 'USD') || 'USD').toUpperCase();
  const feeType = String(getFamilyValue(family, 'feeType', 'hourly') || 'hourly');
  const billingCycle = String(
    getFamilyValue(family, 'billingCycle', latestTemplate?.billingCycle || 'monthly_1st_to_1st')
      || 'monthly_1st_to_1st'
  );
  const preferredPaymentMethods = uniqueStringList([
    ...(Array.isArray(latestTemplate?.preferredPaymentMethods) ? latestTemplate.preferredPaymentMethods : []),
    ...(Array.isArray(getFamilyValue(family, 'paymentModes', [])) ? getFamilyValue(family, 'paymentModes', []) : []),
  ]);
  const primaryPaymentMethod = String(
    latestTemplate?.primaryPaymentMethod
      || preferredPaymentMethods[0]
      || ''
  ).trim().toLowerCase();
  const paymentInstructions = String(latestTemplate?.paymentInstructions || '').trim();
  const students = getActiveStudents(members);
  const familyFeeRate = toFiniteNumber(getFamilyValue(family, 'feeRate', 0), 0);
  const includedHours = toFiniteNumber(getFamilyValue(family, 'includedHours', 0), 0);
  const invoiceNumberCounter = await getNextInvoiceCounter(year);
  const invoiceNumber = `INV-${year}-${String(invoiceNumberCounter).padStart(6, '0')}`;
  const { issueDate, dueDate, notes } = buildCycleDates(targetMonthKey, billingCycle, family);

  const items = [];
  let subtotal = 0;

  switch (feeType) {
    case 'lump_sum': {
      const lumpSumAmount = toFiniteNumber(
        latestTemplate?.baseAmount ?? latestTemplate?.subtotal ?? familyFeeRate,
        familyFeeRate
      );
      const item = {
        description: `Monthly Fee - ${parentName} Family (${students.length} student${students.length !== 1 ? 's' : ''})`,
        feeRate: lumpSumAmount,
        feeType: 'lump_sum',
        quantity: 1,
        subtotal: Math.round(lumpSumAmount * 100) / 100,
      };
      items.push(item);
      subtotal += item.subtotal;
      break;
    }

    case 'per_student': {
      students.forEach((student) => {
        const studentFeeRate = toFiniteNumber(getMemberValue(student, 'feeRate', familyFeeRate), familyFeeRate);
        const item = {
          studentId: student.studentId || student.uid || student._id,
          studentName: getMemberValue(student, 'name', 'Student'),
          description: `Monthly Fee - ${getMemberValue(student, 'name', 'Student')}`,
          feeRate: studentFeeRate,
          feeType: 'per_student',
          quantity: 1,
          subtotal: studentFeeRate,
        };
        items.push(item);
        subtotal += item.subtotal;
      });
      break;
    }

    case 'hourly': {
      for (const student of students) {
        const studentId = student.studentId || student.uid || student._id;
        const studentName = getMemberValue(student, 'name', 'Student');
        const hours = await getStudentHours(studentId, targetMonthKey);
        const item = {
          studentId,
          studentName,
          description: `Hourly Classes - ${studentName}`,
          feeRate: familyFeeRate,
          feeType: 'hourly',
          hoursCompleted: hours,
          quantity: hours,
          subtotal: hours * familyFeeRate,
        };
        items.push(item);
        subtotal += item.subtotal;
      }
      break;
    }

    case 'hourly_predicted': {
      for (const student of students) {
        const studentId = student.studentId || student.uid || student._id;
        const studentName = getMemberValue(student, 'name', 'Student');
        const predictedHours = await predictStudentHours(studentId, targetMonthKey);
        const item = {
          studentId,
          studentName,
          description: `Predicted Classes - ${studentName} (${predictedHours} hrs estimated)`,
          feeRate: familyFeeRate,
          feeType: 'hourly_predicted',
          hoursPredicted: predictedHours,
          quantity: predictedHours,
          subtotal: predictedHours * familyFeeRate,
        };
        items.push(item);
        subtotal += item.subtotal;
      }
      break;
    }

    case 'subscription': {
      for (const student of students) {
        const studentId = student.studentId || student.uid || student._id;
        const studentName = getMemberValue(student, 'name', 'Student');
        const hours = await getStudentHours(studentId, targetMonthKey);
        const extraHours = Math.max(0, hours - includedHours);
        const baseItem = {
          studentId,
          studentName,
          description: `Subscription - ${studentName} (includes ${includedHours} hrs)`,
          feeRate: familyFeeRate,
          feeType: 'subscription',
          hoursIncluded: includedHours,
          hoursCompleted: hours,
          quantity: 1,
          subtotal: familyFeeRate,
        };
        items.push(baseItem);
        subtotal += baseItem.subtotal;

        if (extraHours > 0) {
          const extraItem = {
            studentId,
            studentName,
            description: `Extra Hours - ${studentName} (${extraHours} hrs)`,
            feeRate: familyFeeRate,
            feeType: 'subscription_extra',
            hoursExtra: extraHours,
            quantity: extraHours,
            subtotal: extraHours * familyFeeRate,
          };
          items.push(extraItem);
          subtotal += extraItem.subtotal;
        }
      }
      break;
    }

    default: {
      const item = {
        description: `Monthly Fee - ${parentName} Family`,
        feeRate: familyFeeRate,
        feeType: 'lump_sum',
        quantity: 1,
        subtotal: familyFeeRate,
      };
      items.push(item);
      subtotal += item.subtotal;
      break;
    }
  }

  if (!hasPriorInvoice) {
    const includeRegistration = Boolean(getFamilyValue(family, 'includeRegistrationInFirstInvoice', false));
    const registrationFeePaid = Boolean(getFamilyValue(family, 'registrationFeePaid', false));
    const registrationFee = toFiniteNumber(getFamilyValue(family, 'registrationFee', 0), 0);
    if (includeRegistration && registrationFee > 0 && !registrationFeePaid) {
      const regFeeItem = {
        description: 'Registration Fee (One-time)',
        feeRate: registrationFee,
        feeType: 'registration_fee',
        quantity: 1,
        subtotal: registrationFee,
        isOneTime: true,
      };
      items.push(regFeeItem);
      subtotal += regFeeItem.subtotal;
    }
  }

  const valueAddedServices = Array.isArray(getFamilyValue(family, 'valueAddedServices', []))
    ? getFamilyValue(family, 'valueAddedServices', [])
    : [];
  valueAddedServices.forEach((service) => {
    if (!service?.active) return;
    const amount = toFiniteNumber(service.amount, 0);
    const vasItem = {
      description: `${service.name || 'Service'} - ${service.description || 'Value Added Service'}`,
      feeRate: amount,
      feeType: 'value_added_service',
      serviceName: service.name || 'Service',
      quantity: 1,
      subtotal: amount,
      isRecurring: true,
    };
    items.push(vasItem);
    subtotal += vasItem.subtotal;
  });

  const adjustments = [];
  const pendingAdjustments = Array.isArray(getFamilyValue(family, 'pendingAdjustments', []))
    ? getFamilyValue(family, 'pendingAdjustments', [])
    : [];
  pendingAdjustments.forEach((adjustment) => {
    if (Number(adjustment?.applyToMonth) !== month || Number(adjustment?.applyToYear) !== year) {
      return;
    }
    const adjustmentAmount = toFiniteNumber(adjustment?.amount, 0);
    const isDebit = String(adjustment?.type || '').trim().toLowerCase() === 'debit';
    const item = {
      description: adjustment?.description || (isDebit ? 'Additional Charge' : 'Credit/Discount'),
      type: adjustment?.type,
      amount: adjustmentAmount,
      feeType: 'adjustment',
      quantity: 1,
      subtotal: isDebit ? adjustmentAmount : (-1 * adjustmentAmount),
    };
    items.push(item);
    subtotal += item.subtotal;
    adjustments.push(adjustment);
  });

  const discount = { type: 'percentage', value: 0, amount: 0, reason: '' };
  if (students.length > 1 && feeType !== 'lump_sum') {
    discount.type = 'percentage';
    discount.value = 10;
    discount.amount = Math.round(((subtotal * 10) / 100) * 100) / 100;
    discount.reason = 'Sibling discount';
  }

  const totalAmount = Math.max(0, Math.round((subtotal - discount.amount) * 100) / 100);
  const startDate = `${targetMonthKey}-01`;
  const endDate = `${targetMonthKey}-${pad2(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  const nowIso = new Date().toISOString();
  const invoiceId = crypto.randomBytes(12).toString('hex');

  return {
    _id: invoiceId,
    invoiceNumber,
    familyId: family._id,
    familyName: parentName,
    parentName,
    email,
    mobile,
    registrationCode,
    month: targetMonthKey,
    billingMonth: targetMonthKey,
    billingYear: year,
    billingPeriod: {
      startDate,
      endDate,
    },
    feeType,
    currency,
    items,
    adjustments,
    subtotal: Math.round(subtotal * 100) / 100,
    discount,
    tax: { rate: 0, amount: 0 },
    taxAmount: 0,
    discountAmount: discount.amount,
    totalAmount,
    status: 'pending',
    paidAmount: 0,
    remainingAmount: totalAmount,
    payments: [],
    issueDate: issueDate.toISOString(),
    issuedDate: issueDate.toISOString(),
    dueDate: dueDate.toISOString(),
    notes,
    adminNotes: `Auto-generated monthly invoice. Family status: ${family.status || 'unknown'}`,
    sentToParent: true,
    sentDate: nowIso,
    emailSent: false,
    appNotificationSent: false,
    issuedBy: { ...AUTO_BILLING_ACTOR },
    invoiceType: 'auto_monthly',
    setupAutoBilling: true,
    autoBillingStartDate: String(getFamilyValue(family, 'autoBillingStartDate', latestTemplate?.autoBillingStartDate || '') || ''),
    billingCycle,
    preferredPaymentMethods,
    primaryPaymentMethod,
    paymentInstructions,
    createdAt: nowIso,
    updatedAt: nowIso,
    raw: { payments: [] },
  };
}

async function createAutoInvoiceForFamily({ family, members, latestTemplate, targetMonthKey, existingInvoices }) {
  const invoice = await calculateInvoiceForFamily({
    family,
    members,
    latestTemplate,
    targetMonthKey,
    hasPriorInvoice: (Array.isArray(existingInvoices) ? existingInvoices.length : 0) > 0,
  });

  await MongoInvoice.create(invoice);

  const existingFamilyInvoices = Array.isArray(family?.raw?.invoices)
    ? family.raw.invoices
    : Array.isArray(family?.invoices)
      ? family.invoices
      : [];
  const invoiceActivities = Array.isArray(family?.raw?.invoiceActivities) ? family.raw.invoiceActivities : [];

  await MongoFamily.findByIdAndUpdate(family._id, {
    $set: {
      'raw.invoices': [...existingFamilyInvoices, buildInvoiceSummary(invoice)],
      'raw.invoiceActivities': [
        ...invoiceActivities,
        {
          timestamp: new Date().toISOString(),
          type: 'invoice_auto_generated',
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoice.totalAmount,
          billingMonth: targetMonthKey,
          actor: { ...AUTO_BILLING_ACTOR },
        },
      ],
      'raw.autoBillingEnabled': true,
      'raw.firstInvoiceSent': true,
      'raw.billingCycle': invoice.billingCycle,
      firstInvoiceSent: true,
    },
  });

  return invoice;
}

async function runMonthlyAutoBillingCycle({ now = new Date(), logger = console, familyId = '' } = {}) {
  if (runInProgress) {
    return { skipped: true, reason: 'in_progress' };
  }

  runInProgress = true;
  try {
    const targetMonthKey = monthKeyFromDate(now);
    const familyFilter = familyId
      ? { _id: String(familyId).trim() }
      : { status: { $in: ['trial', 'regular'] } };
    const families = await MongoFamily.find(familyFilter).lean();

    if (!families.length) {
      return { skipped: true, reason: 'no_families', createdCount: 0 };
    }

    const familyIds = families.map((family) => family._id).filter(Boolean);
    const [members, invoices] = await Promise.all([
      MongoFamilyMember.find({ familyId: { $in: familyIds }, role: 'student' }).lean(),
      MongoInvoice.find({ familyId: { $in: familyIds } }).lean(),
    ]);

    const membersByFamilyId = new Map();
    members.forEach((member) => {
      const familyMembers = membersByFamilyId.get(member.familyId) || [];
      familyMembers.push(member);
      membersByFamilyId.set(member.familyId, familyMembers);
    });

    const invoicesByFamilyId = new Map();
    invoices.forEach((invoice) => {
      const familyInvoices = invoicesByFamilyId.get(invoice.familyId) || [];
      familyInvoices.push(invoice);
      invoicesByFamilyId.set(invoice.familyId, familyInvoices);
    });

    const created = [];

    for (const family of families) {
      const familyInvoices = invoicesByFamilyId.get(family._id) || [];
      const billingTemplateInvoices = familyInvoices
        .filter((invoice) => invoice?.setupAutoBilling || invoice?.invoiceType === 'manual_first' || invoice?.invoiceType === 'auto_monthly')
        .sort((left, right) => {
          const monthComparison = compareMonthKeys(deriveInvoiceMonthKey(right), deriveInvoiceMonthKey(left));
          if (monthComparison !== 0) return monthComparison;
          const leftTime = parseDateValue(left?.createdAt)?.getTime() || 0;
          const rightTime = parseDateValue(right?.createdAt)?.getTime() || 0;
          return rightTime - leftTime;
        });
      const latestTemplate = billingTemplateInvoices[0] || null;
      const autoBillingEnabled = Boolean(
        getFamilyValue(family, 'autoBillingEnabled', false)
        || latestTemplate?.setupAutoBilling
      );

      if (!autoBillingEnabled) {
        continue;
      }

      const existingInvoiceByMonth = new Set(
        familyInvoices
          .map((invoice) => deriveInvoiceMonthKey(invoice))
          .filter(Boolean)
      );

      let firstMissingMonthKey = '';
      const latestTemplateMonthKey = latestTemplate ? deriveInvoiceMonthKey(latestTemplate) : '';
      if (latestTemplateMonthKey) {
        firstMissingMonthKey = shiftMonthKey(latestTemplateMonthKey, 1);
      } else {
        const autoBillingStartDate = getFamilyValue(family, 'autoBillingStartDate', '');
        const autoBillingStartMonthKey = monthKeyFromDate(parseDateValue(autoBillingStartDate));
        if (!autoBillingStartMonthKey) {
          continue;
        }
        firstMissingMonthKey = shiftMonthKey(autoBillingStartMonthKey, 1);
      }

      if (!firstMissingMonthKey || compareMonthKeys(firstMissingMonthKey, targetMonthKey) > 0) {
        continue;
      }

      const membersForFamily = membersByFamilyId.get(family._id) || [];
      const missingMonths = monthKeyRangeInclusive(firstMissingMonthKey, targetMonthKey)
        .filter((monthKey) => !existingInvoiceByMonth.has(monthKey));

      for (const monthKey of missingMonths) {
        const createdInvoice = await createAutoInvoiceForFamily({
          family,
          members: membersForFamily,
          latestTemplate,
          targetMonthKey: monthKey,
          existingInvoices: familyInvoices,
        });
        familyInvoices.push(createdInvoice);
        existingInvoiceByMonth.add(monthKey);
        created.push({
          familyId: family._id,
          invoiceId: createdInvoice._id,
          invoiceNumber: createdInvoice.invoiceNumber,
          monthKey,
        });
      }
    }

    if (created.length > 0) {
      logger.info?.(`Auto-billing created ${created.length} invoice(s) for ${targetMonthKey}`);
    }

    return {
      skipped: false,
      targetMonthKey,
      createdCount: created.length,
      created,
    };
  } finally {
    runInProgress = false;
  }
}

module.exports = {
  runMonthlyAutoBillingCycle,
  deriveInvoiceMonthKey,
};
