#!/usr/bin/env node
/**
 * Seed a varied Salesforce CPQ installed base for migration-readiness demos.
 *
 *   node scripts/seed-installed-base.mjs --dry-run
 *   node scripts/seed-installed-base.mjs --execute [--force]
 *
 * Reads credentials only from CPQ_INSTANCE_URL and CPQ_ACCESS_TOKEN. With no
 * mode flag it previews the plan; writes require the explicit --execute flag.
 */

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1] ?? true) : d;
};

const MARKER = 'DEMO SEED v3';
const API_VERSION = 'v67.0';
const instanceUrl = process.env.CPQ_INSTANCE_URL?.replace(/\/+$/, '');
const accessToken = process.env.CPQ_ACCESS_TOKEN;
const execute = arg('execute', false) === true;
const dryRun = arg('dry-run', false) === true || !execute;
const force = arg('force', false) === true;

if (!instanceUrl || !accessToken) {
  console.error('Usage: CPQ_INSTANCE_URL=https://your-org.my.salesforce.com CPQ_ACCESS_TOKEN=<token> node scripts/seed-installed-base.mjs [--dry-run | --execute [--force]]');
  console.error('Both CPQ_INSTANCE_URL and CPQ_ACCESS_TOKEN are required; no .env file is read.');
  process.exit(1);
}

if (arg('execute', false) && arg('dry-run', false)) {
  console.error('Choose either --dry-run or --execute, not both.');
  process.exit(1);
}

const baseUrl = `${instanceUrl}/services/data/${API_VERSION}`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const error = new Error(`Salesforce ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function query(soql) {
  let page = await request(`/query?q=${encodeURIComponent(soql)}`);
  const records = [...page.records];
  while (!page.done) {
    page = await request(page.nextRecordsUrl.replace(`/services/data/${API_VERSION}`, ''));
    records.push(...page.records);
  }
  return records;
}

const date = (value = Date.now()) => new Date(value).toISOString().slice(0, 10);
const addDays = (value, days) => {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return date(d);
};
const addMonths = (value, months) => {
  const d = new Date(`${value}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return date(d);
};

const today = date();
const pick = (items, i) => items[i % items.length];
const money = (i) => [49, 75, 120, 199, 350, 625, 995][i % 7];
const markerText = (kind, i) => `${MARKER} | installed-base ${kind} ${String(i + 1).padStart(2, '0')}`;

process.stderr.write(`Reading Salesforce reference data from ${instanceUrl}...\n`);

let accounts;
let products;
let pricebooks;
let pricebookEntries;
let existingContracts;
let contacts;
let quoteNames;
let quoteDescribe;
try {
  [accounts, products, pricebooks, pricebookEntries, existingContracts, contacts, quoteNames, quoteDescribe] = await Promise.all([
    query('SELECT Id, Name FROM Account ORDER BY Name LIMIT 20'),
    query('SELECT Id, Name FROM Product2 WHERE IsActive = true ORDER BY Name LIMIT 40'),
    query('SELECT Id, Name FROM Pricebook2 WHERE IsStandard = true AND IsActive = true LIMIT 1'),
    query('SELECT Id, Product2Id, Pricebook2Id, UnitPrice FROM PricebookEntry WHERE IsActive = true AND Pricebook2.IsStandard = true ORDER BY Product2.Name LIMIT 40'),
    query('SELECT Id, AccountId, StartDate, EndDate, ContractTerm, Description FROM Contract ORDER BY CreatedDate LIMIT 100'),
    query('SELECT Id, AccountId, Name FROM Contact ORDER BY Name LIMIT 40'),
    query('SELECT Name FROM SBQQ__Quote__c LIMIT 3'),
    request('/sobjects/SBQQ__Quote__c/describe')
  ]);
} catch (error) {
  console.error(`Unable to read Salesforce reference data: ${error.message}`);
  console.error(JSON.stringify(error.body ?? error, null, 2));
  process.exit(1);
}

existingContracts = existingContracts.filter((contract) => !contract.Description?.includes(MARKER));

if (accounts.length < 4 || pricebooks.length < 1 || existingContracts.length < 1) {
  console.error(`Insufficient reference data: need >=4 Accounts, >=1 active standard Pricebook, and >=1 existing Contract; found ${accounts.length}, ${pricebooks.length}, ${existingContracts.length}.`);
  process.exit(1);
}

// Prefer products with active standard-price entries, while still explicitly querying Product2 and PricebookEntry.
const productById = new Map(products.map((p) => [p.Id, p]));
const usableProducts = pricebookEntries.map((pbe) => productById.get(pbe.Product2Id)).filter(Boolean);
const distinctProducts = [...new Map(usableProducts.map((p) => [p.Id, p])).values()];
if (distinctProducts.length < 20) {
  console.error(`Need at least 20 distinct active products with active standard PricebookEntry records; found ${distinctProducts.length}.`);
  process.exit(1);
}

const nameField = quoteDescribe.fields.find((f) => f.name === 'Name');
const quoteTextCandidates = ['Description', 'SBQQ__Notes__c'];
const quoteMarkerField = quoteTextCandidates.find((name) => {
  const f = quoteDescribe.fields.find((field) => field.name === name);
  return f?.createable && ['string', 'textarea'].includes(f.type);
}) ?? (nameField?.createable && !nameField.autoNumber ? 'Name' : null);

if (!quoteMarkerField) {
  console.error(`SBQQ__Quote__c has no createable Description/Notes field and Name is not createable (sample Names: ${quoteNames.map((q) => q.Name).join(', ') || 'none'}). Cannot satisfy the seed-marker requirement safely.`);
  process.exit(1);
}

const markerSources = [
  ['Contract', 'Description'],
  ['SBQQ__Subscription__c', 'SBQQ__PackageProductDescription__c'],
  ['SBQQ__Quote__c', quoteMarkerField],
  ['Asset', 'Description']
];
let existingSeedCounts;
try {
  // Description/SBQQ__PackageProductDescription__c are long-text-area fields, which Salesforce
  // does not allow filtering on in a SOQL WHERE clause ("field can not be filtered in a query
  // call") -- and SOSL FIND does not support search on this custom object either. So this fetches
  // every record's marker field (record counts here are always small, tens to low hundreds) and
  // filters client-side instead of relying on a server-side text filter.
  existingSeedCounts = await Promise.all(markerSources.map(async ([object, field]) => {
    const records = await query(`SELECT Id, ${field} FROM ${object} LIMIT 2000`);
    return { object, count: records.filter((r) => r[field]?.includes(MARKER)).length };
  }));
} catch (error) {
  console.error(`Unable to perform idempotency check: ${error.message}`);
  console.error(JSON.stringify(error.body ?? error, null, 2));
  process.exit(1);
}
const existingSeedTotal = existingSeedCounts.reduce((sum, x) => sum + x.count, 0);
if (existingSeedTotal && !force) {
  console.error(`Idempotency guard: found ${existingSeedTotal} existing ${MARKER} record(s) (${existingSeedCounts.map((x) => `${x.object}=${x.count}`).join(', ')}).`);
  console.error('No records were written. Re-run with --execute --force only if another seed set is intentional.');
  process.exit(1);
}

const pricebookId = pricebooks[0].Id;
const contractSpecs = [
  { term: 12, end: addDays(today, 30), label: 'renewal-due-soon' },
  { term: 24, end: addDays(today, 55), label: 'renewal-due-soon' },
  { term: 36, end: addDays(today, 80), label: 'renewal-due-soon' },
  { term: 12, end: addDays(today, 55), label: 'renewal-due-soon' },
  { term: 24, end: addDays(today, 450), label: 'long-horizon' },
  { term: 36, end: addDays(today, 730), label: 'long-horizon' },
  { term: 24, end: addDays(today, 540), label: 'long-horizon' },
  { term: 36, end: addDays(today, 900), label: 'long-horizon' },
  { term: 12, end: addDays(today, 210), label: 'standard' },
  { term: 24, end: addDays(today, 320), label: 'standard' },
  { term: 36, end: addDays(today, 600), label: 'co-termed-bundle' },
  { term: 36, end: addDays(today, 600), label: 'co-termed-bundle' }
];

const contractPlan = contractSpecs.map((spec, i) => ({
  label: `${spec.label}, ends ${spec.end}`,
  end: spec.end,
  payload: {
    AccountId: pick(accounts, i === 11 ? 10 : i).Id,
    Pricebook2Id: pricebookId,
    StartDate: addMonths(spec.end, -spec.term),
    ContractTerm: spec.term,
    Status: 'Activated',
    Description: markerText(`contract ${spec.label}`, i),
    SBQQ__Evergreen__c: i === 8,
    SBQQ__MasterContract__c: i === 10 || i === 11,
    SBQQ__RenewalTerm__c: i % 3 === 0 ? 12 : spec.term,
    SBQQ__RenewalUpliftRate__c: [0, 3, 5, 7.5][i % 4]
  }
}));

// Indices 0 and 1 are original subscriptions; indices 38 and 39 revise them below.
const subscriptionPlan = Array.from({ length: 38 }, (_, i) => {
  const usesNew = i < 32;
  const contractIndex = usesNew ? i % contractPlan.length : null;
  const oldContract = usesNew ? null : pick(existingContracts, i - 32);
  const start = usesNew ? contractPlan[contractIndex].payload.StartDate : (oldContract.StartDate || addMonths(today, -12));
  // "Renewable/Evergreen" is a defined picklist value but has an empty validFor bitmask in this
  // org (confirmed via a live describe + live test insert), meaning it is not actually assignable
  // to any record right now -- "One-time" is used in its place for type variety instead.
  const type = ['Renewable', 'Evergreen', 'One-time'][i % 3];
  const multiYear = i === 2;
  const listPrice = money(i);
  return {
    label: i === 3 ? 'high-quantity ramp-style' : i === 4 ? 'cancelled' : multiYear ? 'multi-year' : type,
    contractIndex,
    payload: {
      SBQQ__Account__c: usesNew ? contractPlan[contractIndex].payload.AccountId : oldContract.AccountId,
      SBQQ__Contract__c: usesNew ? `@Contract[${contractIndex}].Id` : oldContract.Id,
      SBQQ__Product__c: pick(distinctProducts, i).Id,
      SBQQ__Quantity__c: i === 3 ? 750 : [1, 5, 12, 25, 50][i % 5],
      SBQQ__SubscriptionStartDate__c: start,
      ...(type === 'Evergreen' ? {} : { SBQQ__SubscriptionEndDate__c: multiYear ? addMonths(start, 30) : addMonths(start, 12) }),
      SBQQ__SubscriptionType__c: type,
      // SBQQ__SubscriptionType__c is a dependent picklist controlled by
      // SBQQ__ProductSubscriptionType__c (confirmed via live describe) -- without this field set
      // to a matching value, Salesforce rejects every SBQQ__SubscriptionType__c value with
      // INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST, confirmed by a live test insert.
      SBQQ__ProductSubscriptionType__c: type,
      ...(i === 4 ? { SBQQ__TerminatedDate__c: addDays(today, -45) } : {}),
      SBQQ__RenewalPrice__c: listPrice * 1.05,
      SBQQ__RenewalQuantity__c: i === 3 ? 900 : [1, 5, 12, 25, 50][i % 5],
      SBQQ__RenewalUpliftRate__c: [0, 3, 5, 7.5][i % 4],
      SBQQ__ListPrice__c: listPrice,
      SBQQ__NetPrice__c: Number((listPrice * [0.82, 0.9, 0.95, 1][i % 4]).toFixed(2)),
      SBQQ__PackageProductDescription__c: markerText(`subscription ${type}`, i)
    }
  };
});

// An amendment is modeled as a new subscription that self-references the original
// through SBQQ__RevisedSubscription__c, matching the verified CPQ schema.
for (let i = 0; i < 2; i += 1) {
  const original = subscriptionPlan[i];
  subscriptionPlan.push({
    label: `amendment of subscription ${i + 1}`,
    contractIndex: original.contractIndex,
    revisedIndex: i,
    payload: {
      ...original.payload,
      SBQQ__Quantity__c: original.payload.SBQQ__Quantity__c + (i + 1) * 10,
      SBQQ__RenewalQuantity__c: original.payload.SBQQ__RenewalQuantity__c + (i + 1) * 10,
      SBQQ__SubscriptionStartDate__c: addMonths(original.payload.SBQQ__SubscriptionStartDate__c, 6),
      SBQQ__RevisedSubscription__c: `@Subscription[${i}].Id`,
      SBQQ__PackageProductDescription__c: markerText(`amended subscription ${i + 1}`, 38 + i)
    }
  });
}

const contactForAccount = (accountId, i) => contacts.find((c) => c.AccountId === accountId) ?? pick(contacts, i);
const quotePlan = [
  ...Array.from({ length: 4 }, (_, i) => ({
    label: `Renewal ${['Draft', 'In Review', 'Presented', 'Accepted'][i]}`,
    contractIndex: i,
    payload: {
      SBQQ__Type__c: 'Renewal',
      SBQQ__Status__c: ['Draft', 'In Review', 'Presented', 'Accepted'][i],
      SBQQ__StartDate__c: contractPlan[i].end,
      SBQQ__EndDate__c: addMonths(contractPlan[i].end, 12),
      SBQQ__MasterContract__c: `@Contract[${i}].Id`,
      SBQQ__RenewalTerm__c: 12,
      SBQQ__RenewalUpliftRate__c: [3, 5, 7.5, 0][i],
      ...(contactForAccount(contractPlan[i].payload.AccountId, i) ? { SBQQ__PrimaryContact__c: contactForAccount(contractPlan[i].payload.AccountId, i).Id } : {}),
      SBQQ__Primary__c: i === 0,
      [quoteMarkerField]: quoteMarkerField === 'Name' ? `${MARKER} - Renewal ${i + 1}` : markerText('renewal quote', i)
    }
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    label: `Amendment ${['Draft', 'In Review', 'Approved'][i]}`,
    contractIndex: i % 2,
    payload: {
      SBQQ__Type__c: 'Amendment',
      SBQQ__Status__c: ['Draft', 'In Review', 'Approved'][i],
      SBQQ__StartDate__c: addMonths(subscriptionPlan[i % 2].payload.SBQQ__SubscriptionStartDate__c, 6),
      SBQQ__EndDate__c: subscriptionPlan[i % 2].payload.SBQQ__SubscriptionEndDate__c,
      SBQQ__MasterContract__c: `@Contract[${i % 2}].Id`,
      SBQQ__RenewalTerm__c: 12,
      SBQQ__RenewalUpliftRate__c: [0, 3, 5][i],
      ...(contactForAccount(contractPlan[i % 2].payload.AccountId, i + 4) ? { SBQQ__PrimaryContact__c: contactForAccount(contractPlan[i % 2].payload.AccountId, i + 4).Id } : {}),
      SBQQ__Primary__c: false,
      [quoteMarkerField]: quoteMarkerField === 'Name' ? `${MARKER} - Amendment ${i + 1}` : markerText('amendment quote', i)
    }
  }))
];

const assetPlan = Array.from({ length: 12 }, (_, i) => {
  const subscriptionIndex = (i * 3) % subscriptionPlan.length;
  const sub = subscriptionPlan[subscriptionIndex];
  return {
    label: ['Installed', 'Registered', 'Purchased', 'Shipped', 'Obsolete'][i % 5],
    subscriptionIndex,
    payload: {
      AccountId: sub.payload.SBQQ__Account__c,
      Product2Id: sub.payload.SBQQ__Product__c,
      Name: `DEMO - Installed Base Asset ${String(i + 1).padStart(2, '0')}`,
      Status: ['Installed', 'Registered', 'Purchased', 'Shipped', 'Obsolete'][i % 5],
      Description: markerText('asset', i),
      SBQQ__CurrentSubscription__c: `@Subscription[${subscriptionIndex}].Id`,
      SBQQ__SubscriptionStartDate__c: sub.payload.SBQQ__SubscriptionStartDate__c,
      ...(sub.payload.SBQQ__SubscriptionEndDate__c ? { SBQQ__SubscriptionEndDate__c: sub.payload.SBQQ__SubscriptionEndDate__c } : {})
    }
  };
});

// Orders and OrderItems are intentionally out of scope for this installed-base seed.
const plans = [
  ['Contract', contractPlan],
  ['SBQQ__Subscription__c', subscriptionPlan],
  ['SBQQ__Quote__c', quotePlan],
  ['Asset', assetPlan]
];

if (dryRun) {
  console.log(`${MARKER} installed-base seed preview (read-only)`);
  console.log(`As of: ${today}`);
  console.log(`Mode: dry-run${execute ? '' : ' (default; --execute was not supplied)'}`);
  console.log(`Quote marker field: ${quoteMarkerField}`);
  console.log('\nPlanned counts:');
  for (const [object, plan] of plans) console.log(`  ${object.padEnd(28)} ${plan.length}`);
  for (const [object, plan] of plans) {
    console.log(`\n${object} examples:`);
    for (const item of plan.slice(0, 3)) console.log(JSON.stringify(item.payload, null, 2));
  }
  console.log('\nNo POST or PATCH requests were made.');
  process.exit(0);
}

const ids = { Contract: [], Subscription: [], Quote: [], Asset: [] };
const summary = Object.fromEntries(plans.map(([object]) => [object, { created: 0, failed: 0 }]));

function resolvePayload(payload) {
  const resolved = { ...payload };
  for (const [field, value] of Object.entries(resolved)) {
    if (typeof value !== 'string' || !value.startsWith('@')) continue;
    const match = value.match(/^@(Contract|Subscription)\[(\d+)]\.Id$/);
    if (!match) continue;
    const id = ids[match[1]][Number(match[2])];
    if (!id) throw new Error(`unresolved dependency ${value}`);
    resolved[field] = id;
  }
  return resolved;
}

async function createPlan(object, plan, idBucket) {
  for (let i = 0; i < plan.length; i += 1) {
    const item = plan[i];
    try {
      const payload = resolvePayload(item.payload);
      // Salesforce rejects Contract.Status = "Activated" on insert ("Choose a valid contract
      // status", FAILED_ACTIVATION) -- a contract must be created as Draft, then activated via a
      // separate PATCH, confirmed by a live test insert against this org.
      const wantsActivation = object === 'Contract' && payload.Status === 'Activated';
      if (wantsActivation) payload.Status = 'Draft';
      const result = await request(`/sobjects/${object}`, { method: 'POST', body: JSON.stringify(payload) });
      if (wantsActivation) {
        await request(`/sobjects/${object}/${result.id}`, { method: 'PATCH', body: JSON.stringify({ Status: 'Activated' }) });
      }
      ids[idBucket][i] = result.id;
      summary[object].created += 1;
      process.stderr.write(`[${object}] created ${result.id} (${item.label})\n`);
    } catch (error) {
      ids[idBucket][i] = null;
      summary[object].failed += 1;
      const attempted = item.payload.Name ?? item.payload.Description ?? item.payload.SBQQ__PackageProductDescription__c ?? item.payload[quoteMarkerField] ?? MARKER;
      console.error(`[${object}] FAILED ${attempted}: ${error.message}`);
      console.error(JSON.stringify(error.body ?? { message: error.message }, null, 2));
    }
  }
}

await createPlan('Contract', contractPlan, 'Contract');
await createPlan('SBQQ__Subscription__c', subscriptionPlan, 'Subscription');
await createPlan('SBQQ__Quote__c', quotePlan, 'Quote');
await createPlan('Asset', assetPlan, 'Asset');

console.log('\nSeed summary:');
console.log(`${'Object'.padEnd(28)} ${'Created'.padStart(8)} ${'Failed'.padStart(8)}`);
console.log(`${'-'.repeat(28)} ${'-'.repeat(8)} ${'-'.repeat(8)}`);
for (const [object] of plans) {
  console.log(`${object.padEnd(28)} ${String(summary[object].created).padStart(8)} ${String(summary[object].failed).padStart(8)}`);
}

const zeroSuccess = plans.some(([object]) => summary[object].created === 0);
process.exit(zeroSuccess ? 1 : 0);
