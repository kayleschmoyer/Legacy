import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// ─── Input Types ──────────────────────────────────────────

const ConsentTypeEnum = builder.enumType('ConsentType', {
  values: [
    'data_processing',
    'marketing_emails',
    'analytics',
    'third_party_sharing',
  ] as const,
});

const RecordConsentInput = builder.inputType('RecordConsentInput', {
  fields: (t) => ({
    consentType: t.field({ type: ConsentTypeEnum, required: true }),
    ipAddress: t.string({ required: false }),
    userAgent: t.string({ required: false }),
  }),
});

// ─── Object Types ─────────────────────────────────────────

const UserConsentRef = builder.objectRef<{
  id: number;
  userId: number;
  consentType: string;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>('UserConsent');

UserConsentRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    consentType: t.exposeString('consentType'),
    status: t.exposeString('status'),
    ipAddress: t.exposeString('ipAddress', { nullable: true }),
    grantedAt: t.string({
      resolve: (parent) => parent.grantedAt.toISOString(),
    }),
    revokedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.revokedAt ? parent.revokedAt.toISOString() : null,
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
  }),
});

const DataRequestRef = builder.objectRef<{
  id: number;
  userId: number;
  requestType: string;
  status: string;
  requestedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  exportUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}>('DataRequest');

DataRequestRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    requestType: t.exposeString('requestType'),
    status: t.exposeString('status'),
    requestedAt: t.string({
      resolve: (parent) => parent.requestedAt.toISOString(),
    }),
    processedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.processedAt ? parent.processedAt.toISOString() : null,
    }),
    completedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.completedAt ? parent.completedAt.toISOString() : null,
    }),
    exportUrl: t.exposeString('exportUrl', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
  }),
});

const UserDataExportRef = builder.objectRef<{
  user: {
    id: number;
    email: string;
    username: string | null;
    createdAt: string;
    privacyPolicyAcceptedAt: string | null;
  };
  consentsJson: string;
  leaguesJson: string;
  teamsJson: string;
  dataRequestsJson: string;
}>('UserDataExport');

UserDataExportRef.implement({
  fields: (t) => ({
    userEmail: t.string({ resolve: (parent) => parent.user.email }),
    userUsername: t.string({
      nullable: true,
      resolve: (parent) => parent.user.username,
    }),
    userCreatedAt: t.string({ resolve: (parent) => parent.user.createdAt }),
    privacyPolicyAcceptedAt: t.string({
      nullable: true,
      resolve: (parent) => parent.user.privacyPolicyAcceptedAt,
    }),
    consentsJson: t.exposeString('consentsJson'),
    leaguesJson: t.exposeString('leaguesJson'),
    teamsJson: t.exposeString('teamsJson'),
    dataRequestsJson: t.exposeString('dataRequestsJson'),
  }),
});

const PrivacyPolicyStatusRef = builder.objectRef<{
  accepted: boolean;
  acceptedAt: string | null;
}>('PrivacyPolicyStatus');

PrivacyPolicyStatusRef.implement({
  fields: (t) => ({
    accepted: t.exposeBoolean('accepted'),
    acceptedAt: t.exposeString('acceptedAt', { nullable: true }),
  }),
});

// ─── Queries ──────────────────────────────────────────────

builder.queryField('myConsents', (t) =>
  t.field({
    type: [UserConsentRef],
    description: 'Get all consent records for the authenticated user',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return dbService.gdpr.getUserConsents(context.user.id);
    },
  }),
);

builder.queryField('myDataRequests', (t) =>
  t.field({
    type: [DataRequestRef],
    description:
      'Get all data export/deletion requests for the authenticated user',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return dbService.gdpr.getUserDataRequests(context.user.id);
    },
  }),
);

builder.queryField('privacyPolicyStatus', (t) =>
  t.field({
    type: PrivacyPolicyStatusRef,
    description:
      'Check if the authenticated user has accepted the privacy policy',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const accepted = await dbService.gdpr.hasAcceptedPrivacyPolicy(
        context.user.id,
      );
      if (accepted) {
        return { accepted: true, acceptedAt: new Date().toISOString() };
      }
      return { accepted: false, acceptedAt: null };
    },
  }),
);

// ─── Mutations ────────────────────────────────────────────

builder.mutationField('recordConsent', (t) =>
  t.field({
    type: UserConsentRef,
    description: 'Record user consent for a specific data processing type',
    args: {
      input: t.arg({ type: RecordConsentInput, required: true }),
    },
    resolve: async (parent, { input }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return dbService.gdpr.recordConsent({
        userId: context.user.id,
        consentType: input.consentType,
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
      });
    },
  }),
);

builder.mutationField('revokeConsent', (t) =>
  t.field({
    type: UserConsentRef,
    nullable: true,
    description: 'Revoke a previously granted consent',
    args: {
      consentType: t.arg({ type: ConsentTypeEnum, required: true }),
    },
    resolve: async (parent, { consentType }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return dbService.gdpr.revokeConsent(context.user.id, consentType);
    },
  }),
);

builder.mutationField('acceptPrivacyPolicy', (t) =>
  t.field({
    type: PrivacyPolicyStatusRef,
    description: 'Record that the user has accepted the privacy policy',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      await dbService.gdpr.acceptPrivacyPolicy(context.user.id);
      return { accepted: true, acceptedAt: new Date().toISOString() };
    },
  }),
);

builder.mutationField('requestDataExport', (t) =>
  t.field({
    type: DataRequestRef,
    description:
      'Request an export of all personal data (GDPR Art. 15 - Right of Access)',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return dbService.gdpr.requestDataExport(context.user.id);
    },
  }),
);

builder.mutationField('requestDataDeletion', (t) =>
  t.field({
    type: DataRequestRef,
    description:
      'Request deletion of all personal data (GDPR Art. 17 - Right to Erasure)',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      return dbService.gdpr.requestDataDeletion(context.user.id);
    },
  }),
);

builder.queryField('exportMyData', (t) =>
  t.field({
    type: UserDataExportRef,
    description:
      'Get a complete export of all personal data for the authenticated user',
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const data = await dbService.gdpr.collectUserData(context.user.id);
      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          username: data.user.username,
          createdAt: data.user.createdAt.toISOString(),
          privacyPolicyAcceptedAt: data.user.privacyPolicyAcceptedAt
            ? data.user.privacyPolicyAcceptedAt.toISOString()
            : null,
        },
        consentsJson: JSON.stringify(data.consents),
        leaguesJson: JSON.stringify(data.leagues),
        teamsJson: JSON.stringify(data.teams),
        dataRequestsJson: JSON.stringify(data.dataRequests),
      };
    },
  }),
);
