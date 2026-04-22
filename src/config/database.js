/**
 * Database Configuration
 * Uses PostgreSQL in production/development, SQLite in-memory for tests.
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const logger = require('../utils/logger');

// Use SQLite for tests — no real database needed
const isTest = process.env.DB_DIALECT === 'sqlite' || process.env.NODE_ENV === 'test';

const sequelize = isTest
  ? new Sequelize({
      dialect: 'sqlite',
      storage: process.env.DB_STORAGE || ':memory:',
      logging: false,
    })
  : new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
      port: parseInt(process.env.DB_PORT || process.env.PGPORT) || 5432,
      database: process.env.DB_NAME || process.env.PGDATABASE || 'kuralai',
      username: process.env.DB_USER || process.env.PGUSER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
      logging: (msg) => logger.debug(msg),
      pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
      dialectOptions: process.env.DB_SSL === 'true' ? {
        ssl: { require: true, rejectUnauthorized: false },
      } : {},
    });

async function initDatabase() {
  await sequelize.authenticate();

  // Register SaaS models first (FK targets)
  require('../models/Organization')(sequelize);
  require('../models/Plan')(sequelize);
  require('../models/Subscription')(sequelize);
  require('../models/CreditBalance')(sequelize);
  require('../models/CreditTransaction')(sequelize);
  require('../models/ModuleAccess')(sequelize);

  // Register existing models
  require('../models/Call');
  require('../models/Transcript');
  require('../models/CallLog');
  require('../models/User');
  require('../models/Customer');
  require('../models/DynamicCustomer');
  require('../models/DynamicTableSchema');
  require('../models/ChitAccount');
  require('../models/QaTemplate');
  require('../models/PromptTemplate');
  require('../models/AppSetting');
  require('../models/Campaign');

  // Define associations
  setupAssociations();

  // Migrate user role enum to include superadmin
  await migrateUserRoleEnum();

  // Add organizationId columns to existing tables
  await addOrgIdColumns();

  // Add new plan columns (voice, parallel calls, assistants, etc.)
  await migratePlanColumns();

  // Sync schema (create tables if they don't exist)
  await sequelize.sync({ force: false });

  // Migrate settings from file → DB (one-time, on first boot)
  await migrateSettingsToDb();

  // Seed SaaS data
  await seedPlans();
  await seedSuperAdmin();
  await seedDefaultOrg();

  // Seed sample data if tables are empty
  await seedCustomers();
  await seedQaTemplates();
  await seedPromptTemplates();
}

function setupAssociations() {
  const Organization = sequelize.models.Organization;
  const Plan = sequelize.models.Plan;
  const Subscription = sequelize.models.Subscription;
  const CreditBalance = sequelize.models.CreditBalance;
  const CreditTransaction = sequelize.models.CreditTransaction;
  const ModuleAccess = sequelize.models.ModuleAccess;
  const User = require('../models/User');
  const Customer = require('../models/Customer');
  const Call = require('../models/Call');
  const Campaign = require('../models/Campaign');

  Organization.hasMany(Subscription, { foreignKey: 'organizationId', as: 'subscriptions' });
  Subscription.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

  Plan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });
  Subscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });

  Organization.hasOne(CreditBalance, { foreignKey: 'organizationId', as: 'creditBalance' });
  CreditBalance.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

  Organization.hasMany(CreditTransaction, { foreignKey: 'organizationId', as: 'creditTransactions' });
  CreditTransaction.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

  Organization.hasMany(ModuleAccess, { foreignKey: 'organizationId', as: 'modules' });
  ModuleAccess.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

  Organization.hasMany(User, { foreignKey: 'organizationId', as: 'users' });
  Organization.hasMany(Customer, { foreignKey: 'organizationId', as: 'customers' });
  Organization.hasMany(Call, { foreignKey: 'organizationId', as: 'calls' });
  Organization.hasMany(Campaign, { foreignKey: 'organizationId', as: 'campaigns' });
}

async function migrateUserRoleEnum() {
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'superadmin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_users_role')) THEN
          ALTER TYPE "enum_users_role" ADD VALUE 'superadmin' BEFORE 'admin';
        END IF;
      END$$;
    `);
  } catch (e) {
    // Enum type may not exist yet on first boot
  }
}

async function addOrgIdColumns() {
  const tables = ['users', 'customers', 'calls', 'campaigns'];
  for (const table of tables) {
    try {
      const [cols] = await sequelize.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${table}' AND column_name='organizationId'`);
      if (cols.length === 0) {
        await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES organizations(id);`);
      }
    } catch (e) {
      // Table may not exist yet
    }
  }
}

async function migratePlanColumns() {
  const columns = [
    ['"maxClonedVoices"', 'INTEGER DEFAULT 0'],
    ['"maxParallelCalls"', 'INTEGER DEFAULT 1'],
    ['"maxAssistants"', 'INTEGER DEFAULT 1'],
    ['"maxKnowledgebases"', 'INTEGER DEFAULT 0'],
    ['"maxPhoneNumbers"', 'INTEGER DEFAULT 1'],
    ['"extraMinuteRate"', 'FLOAT DEFAULT 15'],
    ['"recommended"', 'BOOLEAN DEFAULT false'],
  ];
  try {
    for (const [col, def] of columns) {
      await sequelize.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS ${col} ${def};`);
    }
  } catch (e) {
    // table may not exist yet — sync will create it
  }
}

async function seedPlans() {
  const Plan = sequelize.models.Plan;
  if (!Plan) return;
  const count = await Plan.count();
  if (count > 0) return;

  await Plan.bulkCreate([
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Get started with AI calling — 115 minutes included',
      price: 999,
      billingCycle: 'monthly',
      creditMinutes: 115,
      maxWorkflows: 2,
      maxCustomers: 200,
      maxCampaigns: 3,
      maxUsersPerOrg: 2,
      maxClonedVoices: 0,
      maxParallelCalls: 2,
      maxAssistants: 1,
      maxKnowledgebases: 0,
      maxPhoneNumbers: 1,
      extraMinuteRate: 10,
      recommended: false,
      features: { callRecording: true, reports: true, simulator: true, voiceGenderSelection: true },
      sortOrder: 1,
    },
    {
      name: 'Growth',
      slug: 'growth',
      description: 'Scale your outbound calling — 350 minutes included',
      price: 2999,
      billingCycle: 'monthly',
      creditMinutes: 350,
      maxWorkflows: 5,
      maxCustomers: 2000,
      maxCampaigns: 10,
      maxUsersPerOrg: 5,
      maxClonedVoices: 2,
      maxParallelCalls: 5,
      maxAssistants: 3,
      maxKnowledgebases: 1,
      maxPhoneNumbers: 3,
      extraMinuteRate: 8,
      recommended: false,
      features: { callRecording: true, reports: true, simulator: true, templates: true, voiceGenderSelection: true, voiceCloning: true, slangCustomization: true, crmIntegration: true },
      sortOrder: 2,
    },
    {
      name: 'Business',
      slug: 'business',
      description: 'High-volume AI calling for teams — 930 minutes included',
      price: 7999,
      billingCycle: 'monthly',
      creditMinutes: 930,
      maxWorkflows: 15,
      maxCustomers: 10000,
      maxCampaigns: 30,
      maxUsersPerOrg: 10,
      maxClonedVoices: 5,
      maxParallelCalls: 20,
      maxAssistants: 10,
      maxKnowledgebases: 3,
      maxPhoneNumbers: 10,
      extraMinuteRate: 6,
      recommended: true,
      features: { callRecording: true, reports: true, simulator: true, templates: true, voiceGenderSelection: true, voiceCloning: true, slangCustomization: true, crmIntegration: true, midCallTools: true, knowledgebases: true, bulkImport: true, customPrompts: true, apiConfig: true, prioritySupport: true },
      sortOrder: 3,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Unlimited power for large organisations — 2,300 minutes included',
      price: 19999,
      billingCycle: 'monthly',
      creditMinutes: 2300,
      maxWorkflows: -1,
      maxCustomers: -1,
      maxCampaigns: -1,
      maxUsersPerOrg: -1,
      maxClonedVoices: -1,
      maxParallelCalls: 100,
      maxAssistants: -1,
      maxKnowledgebases: -1,
      maxPhoneNumbers: -1,
      extraMinuteRate: 4,
      recommended: false,
      features: { callRecording: true, reports: true, simulator: true, templates: true, voiceGenderSelection: true, voiceCloning: true, slangCustomization: true, crmIntegration: true, midCallTools: true, knowledgebases: true, bulkImport: true, customPrompts: true, apiConfig: true, prioritySupport: true, dedicatedSupport: true, sla: true, whiteLabel: true },
      sortOrder: 4,
    },
  ]);
  logger.info('✅ Default plans seeded (Starter, Professional, Business, Enterprise)');
}

async function seedSuperAdmin() {
  const User = require('../models/User');
  const existing = await User.findOne({ where: { role: 'superadmin' } });
  if (existing) return;

  await User.create({
    email: 'superadmin@kuralai.com',
    password: 'KuralAI@Super123',
    name: 'KuralAI Super Admin',
    role: 'superadmin',
    organizationId: null,
  });
  logger.info('✅ Super admin seeded (superadmin@kuralai.com / KuralAI@Super123)');
}

async function seedDefaultOrg() {
  const Organization = sequelize.models.Organization;
  const CreditBalance = sequelize.models.CreditBalance;
  const User = require('../models/User');
  if (!Organization) return;

  const existing = await Organization.findOne({ where: { slug: 'automystic-chit-fund' } });
  if (existing) {
    const unassigned = await User.findAll({ where: { organizationId: null, role: { [require('sequelize').Op.ne]: 'superadmin' } } });
    for (const u of unassigned) {
      await u.update({ organizationId: existing.id });
      logger.info(`Assigned user ${u.email} to org ${existing.name}`);
    }
    return;
  }

  const org = await Organization.create({
    name: 'Automystic Chit Fund',
    slug: 'automystic-chit-fund',
    email: 'info@automystic.com',
    phone: '+919999999999',
  });

  await CreditBalance.findOrCreate({
    where: { organizationId: org.id },
    defaults: { totalMinutes: 100, usedMinutes: 0, reservedMinutes: 0 },
  });

  const users = await User.findAll({ where: { organizationId: null, role: { [require('sequelize').Op.ne]: 'superadmin' } } });
  for (const u of users) {
    await u.update({ organizationId: org.id });
    logger.info(`Assigned user ${u.email} to org ${org.name}`);
  }

  logger.info(`✅ Default organization seeded: ${org.name}`);
}

async function seedCustomers() {
  const Customer = require('../models/Customer');
  const ChitAccount = require('../models/ChitAccount');
  const Organization = sequelize.models.Organization;
  const count = await Customer.count();
  if (count > 0) return; // Already seeded

  const org = await Organization.findOne({ where: { slug: 'automystic' } });
  const orgId = org?.id || null;

  const { toIndianFormat } = require('../utils/templateEngine');

  const customers = [
    {
      name: 'ரமேஷ் குமார்',
      phone: '+919876543210',
      address: 'அண்ணா நகர், சென்னை',
      notes: 'Regular customer. Punctual with payments.',
      chits: [
        {
          chitGroup: 'CG-2024-A',
          chitValue: 500000,
          dueAmount: 18750,
          totalDues: 40,
          completedDues: 2,
          nextDueDate: 'மே 7',
          withdrawalAmount: 355000,
          isPrimary: true,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
        {
          chitGroup: 'CG-2023-D',
          chitValue: 500000,
          dueAmount: 18750,
          totalDues: 40,
          completedDues: 5,
          nextDueDate: 'மே 10',
          withdrawalAmount: 342000,
          isPrimary: false,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
      ],
    },
    {
      name: 'சுரேஷ் பாபு',
      phone: '+919876543211',
      address: 'T நகர், சென்னை',
      notes: 'Has two active chit accounts.',
      chits: [
        {
          chitGroup: 'CG-2024-B',
          chitValue: 300000,
          dueAmount: 11250,
          totalDues: 40,
          completedDues: 4,
          nextDueDate: 'மே 12',
          withdrawalAmount: 210000,
          isPrimary: true,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
        {
          chitGroup: 'CG-2023-F',
          chitValue: 300000,
          dueAmount: 11250,
          totalDues: 40,
          completedDues: 8,
          nextDueDate: 'மே 15',
          withdrawalAmount: 185000,
          isPrimary: false,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
      ],
    },
    {
      name: 'பிரியா ஆனந்த்',
      phone: '+919876543212',
      address: 'அடையாறு, சென்னை',
      notes: 'High-value customer with 10L chit.',
      chits: [
        {
          chitGroup: 'CG-2024-C',
          chitValue: 1000000,
          dueAmount: 37500,
          totalDues: 40,
          completedDues: 1,
          nextDueDate: 'மே 5',
          withdrawalAmount: 720000,
          isPrimary: true,
          documents: { familyJamin: 2, otherJamin: 3, chequeLeaf: 4 },
        },
        {
          chitGroup: 'CG-2023-G',
          chitValue: 500000,
          dueAmount: 18750,
          totalDues: 40,
          completedDues: 11,
          nextDueDate: 'மே 5',
          withdrawalAmount: 290000,
          isPrimary: false,
          documents: { familyJamin: 2, otherJamin: 2, chequeLeaf: 4 },
        },
      ],
    },
  ];

  for (const c of customers) {
    const { chits, ...customerData } = c;
    const customer = await Customer.create({ ...customerData, organizationId: orgId });
    for (const chit of chits) {
      await ChitAccount.create({ ...chit, customerId: customer.id });
    }
  }
  logger.info('✅ Sample customers seeded (3 customers, 6 chit accounts)');
}

async function seedQaTemplates() {
  const QaTemplate = require('../models/QaTemplate');
  const count = await QaTemplate.count();
  if (count > 0) return;

  const pairs = [
    {
      intent: 'seat_due_status',
      label: 'இன்னொரு சீட் — எத்தனாவது due?',
      sortOrder: 1,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'இன்னொரு சீட்', 'இன்னொரு சீட்டு', 'மத்த சீட்', 'வேற சீட்', 'other seat',
        'எத்தனாவது சீட்', 'எத்தன சீட்', 'எத்தனை சீட்', 'எத்தனைவது சீட்',
        'எத்தனாவது due', 'எத்தனாவது டியூ', 'எத்தனவது due', 'எத்தனவது டியூ',
        'எத்தன due', 'எத்தன டியூ', 'எத்தனை due',
        'due போய்ட்டு இருக்கு', 'due போய்ட்டே', 'டியூ போய்ட்டு',
        'due எத்தன', 'due எத்தனாவது', 'due balance',
        'எத்தனாவது month', 'எத்தனாவது மாதம்',
      ],
      tokenKeywords: ['எத்தனாவது', 'எத்தன', 'எத்தனை', 'எத்தனவது'],
      responses: [
        '{{otherChitDues}}வது due சார்.',
        'அந்த சீட்ல {{otherChitDues}}வது due சார்.',
        'இன்னொரு சீட்ல {{otherChitDues}}வது due போய்ட்டு இருக்கு சார்.',
      ],
    },
    {
      intent: 'premature_withdrawal',
      label: 'Premature withdrawal — எவ்ளோ amount கிடைக்கும்?',
      sortOrder: 2,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'இப்போ எடுத்தா', 'இப்பவே எடுத்தா', 'இப்போவே எடுத்தா', 'இப்ப எடுத்தா',
        'இப்போ எடுக்கணும்', 'இப்போவே எடுக்கணும்',
        'எடுத்தா எவ்ளோ', 'எடுத்தா எவ்வளவு', 'எடுத்தா என்ன',
        'எவ்ளோ அமௌன்ட்', 'எவ்வளவு அமௌன்ட்', 'எவ்ளோ amount',
        'எவ்ளோ குடுப்பிங்க', 'எவ்வளவு குடுப்பீங்க', 'எவ்ளோ கொடுப்பீங்க',
        'amount கிடைக்கும்', 'அமௌன்ட் கிடைக்கும்',
        'premature withdrawal', 'premature amount',
        'surrender value', 'முன்கூட்டியே', 'முன்பே எடுத்தா',
        'இப்போதே எடுத்தா', 'now எடுத்தா',
      ],
      tokenKeywords: ['premature', 'withdraw', 'withdrawal', 'எடுத்தா', 'எடுக்கணும்'],
      responses: [
        'இப்போ எடுத்தா ₹{{withdrawalAmount}} சார்.',
        'Premature-ஆ எடுத்தா ₹{{withdrawalAmount}} கிடைக்கும் சார்.',
        '₹{{withdrawalAmount}} சார் — இப்போ surrender பண்ணா.',
      ],
    },
    {
      intent: 'jamin_documents',
      label: 'Security documents — jamin என்ன வேணும்?',
      sortOrder: 3,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'jamin என்ன', 'jamin என்னென்ன', 'ஜாமீன் என்ன',
        'என்ன குடுக்கணும்', 'என்னென்ன குடுக்கணும்', 'என்ன கொடுக்கணும்',
        'என்ன document', 'என்ன documents', 'என்ன தரணும்',
        'cheque leaf', 'cheque leaves', 'cheque எத்தன',
        'document என்ன', 'security என்ன', 'guarantee என்ன',
        'என்ன jamin', 'என்ன ஜாமீன்', 'jamin எத்தன',
        'property document', 'land document', 'family document',
      ],
      tokenKeywords: ['jamin', 'ஜாமீன்', 'cheque', 'செக்', 'document', 'security', 'guarantee', 'collateral'],
      responses: [
        '{{familyJamin}} family jamin, {{otherJamin}} other jamin, {{chequeLeaf}} cheque leaf குடுக்கணும் சார்.',
        'Documents: {{familyJamin}} family jamin, {{otherJamin}} other property jamin, {{chequeLeaf}} cheque leaf சார்.',
        '{{familyJamin}} family, {{otherJamin}} other property jamin — அதோட {{chequeLeaf}} cheque leaf வேணும் சார்.',
      ],
    },
    {
      intent: 'payment_complaint',
      label: 'Payment complaint — afford பண்ண முடியல',
      sortOrder: 4,
      minScore: 2,
      action: 'continue',
      phraseKeywords: [
        'குடுக்க மாட்டிங்க', 'குடுக்க மாற்றிங்க', 'கொடுக்க மாட்டிங்க',
        'amount குடுக்க மாட்டிங்க', 'pay பண்ண மாட்டிங்க',
        'மாசம் மாசம் கேக்குறீங்க', 'மாதம் மாதம் கேக்குறீங்க',
        'கேக்குறீங்க ஆனா', 'கேக்குறீங்க ஆனால்', 'கேக்குறீங்க but',
        'குலுக்கலுக்கு கேக்குறீங்க ஆனா', 'குலுக்கல் கேக்குறீங்க ஆனா',
        'எங்களால முடியல', 'முடியல சார்',
        'பணம் இல்ல', 'காசு இல்ல', 'கஷ்டமா இருக்கு',
      ],
      tokenKeywords: ['afford', 'கஷ்டம்', 'மாட்டிங்க', 'மாற்றிங்க', 'முடியல'],
      responses: [
        'மன்னிக்கணும் சார். Convenient-ஆன நேரம் பாத்து arrange பண்றோம் சார். கஷ்டப்படாதீங்க சார்.',
        'புரிஞ்சுக்கிறோம் சார். உங்களுக்கு okay-ஆன time பாத்து பேசுவோம் சார்.',
        'Sorry சார். உங்க situation புரியுது. Convenient time பாத்து contact பண்றோம் சார்.',
      ],
    },
    {
      intent: 'reduce_calls',
      label: 'பல பேரு call பண்றீங்க — ஒருத்தர் மட்டும் பண்ணுங்க',
      sortOrder: 5,
      minScore: 1,
      action: 'end_call',
      phraseKeywords: [
        'எத்தன பேரு கால்', 'எத்தன பேரு call', 'எத்தனை பேர் call', 'எத்தனை பேரு call',
        'யாரது ஒருத்தர் பண்ணுங்க', 'யாரோட ஒருத்தர்', 'ஒருத்தர் மட்டும் கால்',
        'ஒருத்தர் மட்டும் call', 'ஒருத்தர் மட்டும் பண்ணுங்க',
        'ஒரே ஒருத்தர்', 'single person', 'one person call',
        'ஒரு பேரு மட்டும்', 'ஒரு ஆளு மட்டும்',
        'பல பேரு கால்', 'different people call', 'வேற வேற பேரு',
      ],
      tokenKeywords: [],
      responses: [
        'ஓகே சார். இனிமே ஒருத்தர் மட்டும் call பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்.',
        'சரி சார். ஒரே ஒரு person மட்டும் call பண்றோம் சார். Sorry சார். நன்றி சார்.',
        'புரிஞ்சது சார். ஒருத்தர் மட்டும் contact பண்றோம். மன்னிக்கணும் சார்.',
      ],
    },
    {
      intent: 'no_office_calls',
      label: 'ஆஃபீஸ்ல இருந்து call பண்ணாதீங்க',
      sortOrder: 6,
      minScore: 1,
      action: 'end_call',
      phraseKeywords: [
        'ஆஃபீஸ்ல இருந்து call', 'ஆஃபீஸ்ல இருந்து கால்', 'office இருந்து call',
        'ஆஃபீஸ்ல கால் பண்டீங்க', 'ஆஃபீஸ்ல call பண்டீங்க',
        'ஆஃபீஸ்ல call பண்ணாதீங்க', 'ஆஃபீஸ்ல கால் பண்ணாதீங்க',
        'ஸ்டாஃப் கிட்ட கேட்டுக்குறோம்', 'staff கிட்ட கேட்டுக்கிறோம்',
        'ஸ்டாஃப் கிட்ட கேட்டுக்கோம்', 'நாங்க staff கிட்ட',
        'ஆஃபீஸ்ல இருந்து வேண்டாம்', 'office call வேண்டாம்',
        'work place call', 'office நம்பர்',
      ],
      tokenKeywords: ['ஆஃபீஸ்', 'office', 'ஸ்டாஃப்', 'staff', 'workplace'],
      responses: [
        'சரி சார். புரிஞ்சது. இனிமே ஆஃபீஸ்ல இருந்து call பண்ண மாட்டோம் சார். மன்னிக்கணும் சார். நன்றி சார்.',
        'ஓகே சார். ஆஃபீஸ்ல call பண்ண மாட்டோம். Sorry சார். நன்றி சார்.',
        'புரிஞ்சது சார். Office-ல call இனிமே இல்ல சார். Inconvenience-க்கு மன்னிக்கணும் சார்.',
      ],
    },
    {
      intent: 'lottery_participation',
      label: 'குலுக்கல்ல கலந்துக்கிறேன் — lottery interest',
      sortOrder: 7,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'குலுக்கல்ல கலந்துக்கிறேன்', 'குலுக்கல் கலந்துக்கிறேன்',
        'ஆமா கலந்துக்கிறேன்', 'ஓகே கலந்துக்கிறேன்', 'சரி கலந்துக்கிறேன்',
        'கலந்துக்க விரும்புறேன்', 'கலந்துக்க ready', 'கலந்துக்கிறேன் சார்',
        'விருப்பம் இருக்கு', 'interest இருக்கு', 'interested சார்',
        'lottery ok', 'குலுக்கல் ok', 'குலுக்கல் ஓகே',
        'yes கலந்துக்கிறேன்', 'participate பண்றேன்',
      ],
      tokenKeywords: ['கலந்துக்கிறேன்', 'கலந்துக்கிறோம்', 'interested'],
      responses: [
        'நல்லது {{customerName}} சார்! {{nextDueDate}} குலுக்கல் சார். Due amount ₹{{dueAmount}} ready-ஆ வைங்க சார். நன்றி சார்!',
        'Super {{customerName}} சார்! {{nextDueDate}} lottery சார். ₹{{dueAmount}} due amount time-க்கு குடுங்க சார். நன்றி சார்!',
        'நல்லது சார். {{nextDueDate}} குலுக்கல். ₹{{dueAmount}} due prepare பண்ணுங்க சார். நன்றி!',
      ],
    },
    {
      intent: 'identity_confirm',
      label: 'ஆமா நான் தான் — identity confirm',
      sortOrder: 8,
      minScore: 2,
      action: 'continue',
      phraseKeywords: [
        'ஆமா நான்', 'ஆமா சார்', 'ஆமாம் சார்', 'yes சார்',
        'நான் தான்', 'பேசுறேன்', 'நான் பேசுறேன்',
        'ஆமாண்டா', 'yeah', 'yes',
      ],
      tokenKeywords: ['ஆமா', 'ஆமாம்', 'yes'],
      responses: [
        'நல்லது {{customerName}} சார்! சார், {{nextDueDate}} உங்களுக்கு {{chitValue}} சீட் இருக்கு சார். {{currentDue}}வது due, amount ₹{{dueAmount}} சார். குலுக்கல்ல கலந்துகிறதுக்கு விருப்பம் இருக்கா சார்?',
        '{{customerName}} சார் தான்ல சார்! சார், {{chitValue}} சீட் — {{nextDueDate}}. {{currentDue}}வது due ₹{{dueAmount}} சார். குலுக்கல்ல participate பண்ண விரும்புறீங்களா சார்?',
      ],
    },
    {
      intent: 'end_call',
      label: 'நன்றி / Bye — call முடிக்கணும்',
      sortOrder: 9,
      minScore: 2,
      action: 'end_call',
      phraseKeywords: [
        'நன்றி சார்', 'thank you சார்', 'சரி நன்றி', 'ok நன்றி',
        'சரி வைங்க', 'வச்சுக்கோங்க', 'வைங்க சார்',
        'bye சார்', 'ok bye', 'போகிறேன் சார்', 'போறேன் சார்',
        "வேண்டாம் நன்றி", 'ok thanks', "that's all", 'முடிஞ்சது சார்',
      ],
      tokenKeywords: ['நன்றி', 'thanks', 'bye', 'goodbye'],
      responses: [
        'நன்றி சார். உங்க time-க்கு நன்றி. வணக்கம் சார்!',
        'Thank you சார். Have a nice day சார். வணக்கம்!',
        'நன்றி சார். நல்லா இருங்க சார். வணக்கம்!',
      ],
    },
  ];

  const newPairs = [
    {
      intent: 'lottery_decline',
      label: 'குலுக்கல் வேண்டாம் — lottery decline',
      sortOrder: 10,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'குலுக்கல் வேண்டாம்', 'lottery வேண்டாம்', 'participate வேண்டாம்',
        'இப்போ வேண்டாம்', 'this time வேண்டாம்', 'skip பண்றேன்',
        'அடுத்த தடவை பாக்குறேன்', 'next time', 'இல்ல வேண்டாம்',
      ],
      tokenKeywords: ['skip', 'வேண்டாம்'],
      responses: [
        'சரி {{customerName}} சார். Next time பாக்கலாம் சார். Due மட்டும் time-க்கு கட்டுங்க சார். நன்றி சார்.',
        'ஓகே சார். அடுத்த தடவை participate பண்ணலாம் சார். Due ₹{{dueAmount}} ready-ஆ வைங்க சார். நன்றி சார்.',
      ],
    },
    {
      intent: 'identity_deny',
      label: 'Wrong number / person — identity deny',
      sortOrder: 11,
      minScore: 1,
      action: 'end_call',
      phraseKeywords: [
        'தப்பு', 'wrong number', 'wrong person', 'நான் இல்ல', 'வேற ஆளு',
        'இது wrong number', 'தவறான number', 'அவரு இல்ல', 'available இல்ல',
        'not available', 'அவரு வெளியில', 'busy-ஆ இருக்காரு',
      ],
      tokenKeywords: ['wrong', 'தப்பு', 'தவறான'],
      responses: [
        'மன்னிக்கணும் சார். Inconvenience-க்கு sorry சார். நன்றி சார்.',
        'மன்னிக்கணும் சார். Wrong number-க்கு sorry. நல்ல நாள் சார். வணக்கம்.',
      ],
    },
    {
      intent: 'already_paid',
      label: 'Already paid — கட்டிட்டேன்',
      sortOrder: 12,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'already paid', 'கட்டிட்டேன்', 'கட்டாச்சு', 'போட்டாச்சு', 'pay பண்ணிட்டேன்',
        'amount குடுத்தாச்சு', 'already குடுத்தாச்சு', 'செலுத்திட்டேன்',
        'நேத்து கட்டினேன்', 'online transfer பண்ணிட்டேன்',
        'UPI பண்ணிட்டேன்', 'GPay-ல போட்டேன்', 'PhonePe-ல போட்டேன்', 'bank-ல போட்டேன்',
      ],
      tokenKeywords: ['கட்டிட்டேன்', 'கட்டாச்சு', 'போட்டாச்சு', 'paid'],
      responses: [
        'நன்றி {{customerName}} சார்! Payment receive ஆனதும் update பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார்.',
        'Thank you சார். எங்க accounts team verify பண்ணிடுவாங்க சார். நன்றி சார்.',
      ],
    },
    {
      intent: 'callback_request',
      label: 'Callback request — அப்புறம் call பண்ணுங்க',
      sortOrder: 13,
      minScore: 1,
      action: 'end_call',
      phraseKeywords: [
        'அப்புறம் call பண்ணுங்க', 'later call', 'பின்னாடி call', 'இப்போ busy',
        'meeting-ல இருக்கேன்', 'busy-ஆ இருக்கேன்', 'driving', 'drive பண்றேன்',
        'கொஞ்ச நேரம் கழிச்சு', 'evening call பண்ணுங்க', 'tomorrow call',
        'நாளைக்கு call', 'free-ஆ இருக்கும்போது', 'அப்புறம் பேசுவோம்',
      ],
      tokenKeywords: ['busy', 'later', 'driving', 'tomorrow', 'நாளைக்கு'],
      responses: [
        'சரி {{customerName}} சார்! அப்புறம் call பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்.',
        'ஓகே சார். Convenient-ஆ இருக்கும்போது call பண்றோம் சார். நன்றி சார்.',
      ],
    },
    {
      intent: 'payment_date_inquiry',
      label: 'Due date inquiry — எப்போ கட்டணும்',
      sortOrder: 14,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'எப்போ கட்டணும்', 'due date', 'எந்த தேதி', 'last date', 'due date என்ன',
        'எப்போ pay', 'deadline', 'அடுத்த due எப்போ', 'எந்த date-க்குள்ள',
        'late-ஆ கட்டினா', 'fine வருமா', 'penalty',
      ],
      tokenKeywords: ['deadline', 'penalty', 'fine'],
      responses: [
        '{{nextDueDate}} தேதிக்குள்ள கட்டிடணும் சார். Due amount ₹{{dueAmount}} சார். Time-க்கு கட்டுங்க சார்.',
        'அடுத்த due date {{nextDueDate}} சார். ₹{{dueAmount}} ready-ஆ வைங்க சார்.',
      ],
    },
    {
      intent: 'chit_value_inquiry',
      label: 'Chit value — சீட் value என்ன',
      sortOrder: 15,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'சீட் value என்ன', 'எவ்ளோ சீட்', 'chit value', 'எவ்ளோ amount சீட்',
        'scheme details', 'plan details', 'scheme என்ன', 'plan என்ன',
        'total value', 'மொத்தம் எவ்ளோ',
      ],
      tokenKeywords: ['scheme', 'plan', 'value'],
      responses: [
        'உங்க சீட் value {{chitValue}} சார். {{currentDue}}வது due — ₹{{dueAmount}} சார். {{nextDueDate}} last date சார்.',
        '{{chitValue}} சீட் சார். Total {{totalDues}} dues-ல {{currentDue}}வது due போய்ட்டு இருக்கு சார்.',
      ],
    },
    {
      intent: 'payment_mode',
      label: 'Payment mode — எப்படி கட்டணும்',
      sortOrder: 16,
      minScore: 1,
      action: 'continue',
      phraseKeywords: [
        'எப்படி கட்டணும்', 'online pay', 'account number', 'account details',
        'bank details', 'QR code', 'payment link', 'payment method',
        'எந்த account', 'எந்த bank', 'how to pay',
      ],
      tokenKeywords: ['UPI', 'GPay', 'PhonePe', 'NEFT', 'account', 'bank'],
      responses: [
        'சார், office-ல direct-ஆ cash கட்டலாம் அல்லது bank transfer/UPI பண்ணலாம் சார். Account details-க்கு எங்க office-ஐ contact பண்ணுங்க சார்.',
        'Cash, UPI, NEFT எதுவேணும்னாலும் okay சார். Exact bank details-க்கு எங்க accounts team-கிட்ட check பண்ணுங்க சார்.',
      ],
    },
  ];

  const allPairs = [...pairs, ...newPairs];
  for (let i = 0; i < allPairs.length; i++) {
    await QaTemplate.create(allPairs[i]);
  }
  logger.info(`✅ Q&A templates seeded (${allPairs.length} pairs)`);
}

async function seedPromptTemplates() {
  const PromptTemplate = require('../models/PromptTemplate');
  const count = await PromptTemplate.count();
  if (count > 0) return;

  const prompts = [
    {
      key: 'GREETING',
      label: 'Greeting — call திறக்கும்போது',
      description: 'சமுத்ரா customer-ஐ முதலில் greet பண்ணும் வாக்கியம். {{customerName}} வருகிறது.',
      text: 'வணக்கம் சார்! நான் சமுத்ரா பேசுறேன் சார், Automystic Company-யிட இருந்து. {{customerName}} சார்ங்களா சார்?',
    },
    {
      key: 'GREETING_REPEAT',
      label: 'Greeting — மறுபடியும் கேக்கணும்',
      description: 'கேட்கல / silence-ஆ இருந்தா மறுபடியும் greet பண்ணும்.',
      text: 'ஒரு நிமிஷம் சார் — சரியா கேட்கல. மறுபடியும் சொல்லுங்களா சார்?',
    },
    {
      key: 'FALLBACK_LOW_CONFIDENCE',
      label: 'Fallback — புரியல',
      description: 'Intent detect ஆகல / confidence குறைவா இருந்தா.',
      text: 'ஒரு நிமிஷம் சார் — சரியா புரியல. கொஞ்சம் மறுபடியும் சொல்லுங்களா சார்?',
    },
    {
      key: 'FALLBACK_SILENCE',
      label: 'Fallback — Silence',
      description: 'Customer பேசவே இல்லன்னா.',
      text: 'ஹலோ சார்? கேக்குறீங்களா? மறுபடியும் பேசுங்களா சார்?',
    },
    {
      key: 'FALLBACK_REPEATED',
      label: 'Fallback — மூணு முறை புரியல — Escalate',
      description: '3+ consecutive low-confidence turns-ஆ இருந்தா senior-கிட்ட transfer.',
      text: 'சரி சார், இந்த விஷயத்தை எங்க senior-கிட்ட பாக்குறோம். இப்போ transfer பண்றேன் சார்.',
    },
    {
      key: 'ESCALATION_MESSAGE',
      label: 'Escalation — Senior-கிட்ட transfer',
      description: 'Human escalation request-க்கு.',
      text: 'சரி சார், நான் உங்களை எங்க senior-கிட்ட transfer பண்றேன். ஒரு நிமிஷம் இருங்க சார்.',
    },
    {
      key: 'HUMAN_REQUESTED',
      label: 'Human requested — Manager வேணும்',
      description: 'Customer direct-ஆ human-கிட்ட பேசணும்னு கேக்கும்போது.',
      text: 'சரி சார், உடனே ஒரு senior member-கிட்ட line போடுறேன். ஒரு நிமிஷம் இருங்க சார்.',
    },
    {
      key: 'GOODBYE',
      label: 'Goodbye — Call End',
      description: 'Call முடியும்போது.',
      text: 'நன்றி சார்! உங்களோட நேரம் எடுத்ததுக்கு மன்னிக்கணும் சார். நல்லா இருங்க சார். வணக்கம்!',
    },
    {
      key: 'RECORDING_CONSENT',
      label: 'Recording Consent',
      description: 'Call record ஆகும்னு customer-கிட்ட சொல்லும்.',
      text: 'இந்த call quality improvement-க்காக record ஆகும் சார். தொடர்ந்தா agree பண்றீங்கன்னு அர்த்தம்.',
    },
  ];

  for (const p of prompts) {
    await PromptTemplate.create(p);
  }
  logger.info(`✅ Prompt templates seeded (${prompts.length} prompts)`);
}

async function migrateSettingsToDb() {
  try {
    const AppSetting = require('../models/AppSetting');
    const existing = await AppSetting.findByPk('main');
    if (!existing) {
      const settingsFile = path.join(__dirname, '../../config/app-settings.json');
      let data = {};
      try { data = JSON.parse(require('fs').readFileSync(settingsFile, 'utf-8')); } catch {}
      await AppSetting.create({ key: 'main', data });
      logger.info('✅ App settings migrated from file to DB');
    }
  } catch (err) {
    logger.warn('Settings DB migration skipped:', err.message);
  }
}

module.exports = { sequelize, initDatabase };
