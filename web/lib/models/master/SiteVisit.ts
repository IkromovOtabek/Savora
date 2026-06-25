import { Schema } from 'mongoose';

export interface IVisitEvent {
  type: 'page' | 'api' | 'modal_show' | 'modal_dismiss';
  path: string;
  method?: string;
  at: Date;
}

export interface ISiteVisit {
  visitorId: string;
  sessionId: string;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  referrerHost?: string;
  landingPage: string;
  currentPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  startedAt: Date;
  lastSeenAt: Date;
  activeSeconds: number;
  signupPromptEligible: boolean;
  signupModalShown: boolean;
  signupModalDismissed: boolean;
  signedUp: boolean;
  signedUpAt?: Date;
  organizationSlug?: string;
  organizationId?: string;
  events: IVisitEvent[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const siteVisitSchema = new Schema<ISiteVisit>(
  {
    visitorId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    referrer: { type: String, trim: true },
    referrerHost: { type: String, trim: true, index: true },
    landingPage: { type: String, required: true, trim: true },
    currentPage: { type: String, trim: true },
    utmSource: { type: String, trim: true },
    utmMedium: { type: String, trim: true },
    utmCampaign: { type: String, trim: true },
    startedAt: { type: Date, required: true, default: Date.now, index: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    activeSeconds: { type: Number, default: 0 },
    signupPromptEligible: { type: Boolean, default: false },
    signupModalShown: { type: Boolean, default: false },
    signupModalDismissed: { type: Boolean, default: false },
    signedUp: { type: Boolean, default: false, index: true },
    signedUpAt: { type: Date },
    organizationSlug: { type: String, trim: true },
    organizationId: { type: String, trim: true },
    events: {
      type: [
        {
          type: { type: String, enum: ['page', 'api', 'modal_show', 'modal_dismiss'], required: true },
          path: { type: String, required: true },
          method: { type: String },
          at: { type: Date, required: true, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'site_visits' },
);

siteVisitSchema.index({ lastSeenAt: -1 });
