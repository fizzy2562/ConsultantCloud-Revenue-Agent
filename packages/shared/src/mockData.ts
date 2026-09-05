import type { AccountSummary, AccountAsset, ProductSummary } from "../types/index.js";

export const ACME_UNIVERSITY_ID = "001000000000001AAA";
export const GREENFIELD_HEALTH_ID = "001000000000002AAA";

export const accounts: AccountSummary[] = [
  {
    id: ACME_UNIVERSITY_ID,
    name: "Acme University",
    industry: "Education",
    existingDiscountPercent: 12,
  },
  {
    id: GREENFIELD_HEALTH_ID,
    name: "Greenfield Health",
    industry: "Healthcare",
    existingDiscountPercent: null,
  },
];

export const products: ProductSummary[] = [
  {
    id: "01t000000000001AAA",
    name: "Cloud Essentials",
    listPrice: 1200,
  },
  {
    id: "01t000000000002AAA",
    name: "Cloud Pro",
    listPrice: 2400,
  },
  {
    id: "01t000000000003AAA",
    name: "Premium Support",
    listPrice: 800,
  },
];

export const accountAssets: Record<string, AccountAsset[]> = {
  [ACME_UNIVERSITY_ID]: [
    {
      id: "02i000000000001AAA",
      productName: "Cloud Pro",
      quantity: 100,
      status: "Active",
    },
  ],
  [GREENFIELD_HEALTH_ID]: [],
};
