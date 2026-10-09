import { describe, expect, it } from "vitest";
import { mapToConfigurationState } from "../src/mapping";
import type { ConfiguratorComponent } from "../src/client";

const CATALOG_ROOT: ConfiguratorComponent = {
  id: "01tBUNDLE",
  name: "Laptop Basic Bundle",
  nodeType: "bundleProduct",
  isConfigurable: true,
  attributeCategories: [],
  prices: [{ unitPrice: 1100, isSelected: true, isDefault: true }],
  productComponentGroups: [
    {
      id: "0y7PROTECTION",
      name: "Computer Protection",
      sequence: 2,
      minBundleComponents: null,
      maxBundleComponents: null,
      components: [
        {
          id: "01tANTIVIRUS",
          name: "Antivirus",
          nodeType: "simpleProduct",
          isConfigurable: true,
          attributeCategories: [],
          prices: [{ unitPrice: 99.99, isSelected: true, isDefault: true }],
          productComponentGroups: [],
          productRelatedComponent: {
            id: "0dSANTIVIRUS",
            parentProductId: "01tBUNDLE",
            childProductId: "01tANTIVIRUS",
            productComponentGroupId: "0y7PROTECTION",
            productRelationshipTypeId: "0yoTYPE",
            doesBundlePriceIncludeChild: true,
            isComponentRequired: true,
          },
        },
      ],
    },
    {
      id: "0y7LAPTOP",
      name: "Laptop",
      sequence: 1,
      minBundleComponents: null,
      maxBundleComponents: null,
      components: [
        {
          id: "01tLAPTOP",
          name: "Laptop",
          nodeType: "simpleProduct",
          isConfigurable: true,
          attributeCategories: [
            {
              id: "0v3PROCESSOR",
              name: "Processor",
              attributes: [
                {
                  id: "0tjPROCESSOR",
                  name: "Processor",
                  label: "Processor",
                  dataType: "Picklist",
                  isRequired: true,
                  isPriceImpacting: true,
                  isConfigurable: false,
                  attributePicklist: {
                    id: "0v5PROCESSOR",
                    values: [
                      { code: "i5-CPU 4.4GHz", displayValue: "i5-CPU 4.4GHz", id: "0v6I5", sequence: 1, status: "Active" },
                      { code: "i7-CPU 4.7GHz", displayValue: "i7-CPU 4.7GHz", id: "0v6I7", sequence: 2, status: "Active" },
                    ],
                  },
                },
              ],
            },
          ],
          prices: [{ unitPrice: 1049, isSelected: true, isDefault: true }],
          productComponentGroups: [],
          productRelatedComponent: {
            id: "0dSLAPTOP",
            parentProductId: "01tBUNDLE",
            childProductId: "01tLAPTOP",
            productComponentGroupId: "0y7LAPTOP",
            productRelationshipTypeId: "0yoTYPE",
            doesBundlePriceIncludeChild: true,
            isComponentRequired: true,
          },
        },
      ],
    },
  ],
};

describe("mapToConfigurationState", () => {
  it("orders groups by sequence and marks nothing selected when no lines exist yet", () => {
    const state = mapToConfigurationState("0Q0QUOTE", "0QLROOT", CATALOG_ROOT, [], [], [], []);
    expect(state.groups.map((g) => g.label)).toEqual(["Laptop", "Computer Protection"]);
    expect(state.groups.every((g) => g.options.every((o) => !o.selected))).toBe(true);
    expect(state.isComplete).toBe(false);
    expect(state.groups[0]?.status).toBe("current");
  });

  it("marks an option selected and exposes its attribute's current value when a matching line + relationship + attribute exist", () => {
    const state = mapToConfigurationState(
      "0Q0QUOTE",
      "0QLROOT",
      CATALOG_ROOT,
      [
        { id: "0QLROOT", product2Id: "01tBUNDLE", quantity: 1 },
        { id: "0QLLAPTOP", product2Id: "01tLAPTOP", quantity: 1 },
      ],
      [{ id: "0dRREL1", mainQuoteLineId: "0QLROOT", associatedQuoteLineId: "0QLLAPTOP", productRelatedComponentId: "0dSLAPTOP" }],
      [{ id: "0AZATTR1", quoteLineItemId: "0QLLAPTOP", attributeDefinitionId: "0tjPROCESSOR", attributeValue: "i7-CPU 4.7GHz" }],
      []
    );

    const laptopGroup = state.groups.find((g) => g.label === "Laptop");
    const laptopOption = laptopGroup?.options.find((o) => o.id === "01tLAPTOP");
    expect(laptopOption?.selected).toBe(true);
    expect(laptopOption?.attributes[0]?.currentValue).toBe("i7-CPU 4.7GHz");

    const protectionGroup = state.groups.find((g) => g.label === "Computer Protection");
    expect(protectionGroup?.options[0]?.selected).toBe(false);
    expect(state.isComplete).toBe(false);
  });

  it("is complete once every required-component group has its selection, and marks a group with a related message as attention", () => {
    const lines = [
      { id: "0QLROOT", product2Id: "01tBUNDLE", quantity: 1 },
      { id: "0QLLAPTOP", product2Id: "01tLAPTOP", quantity: 1 },
      { id: "0QLAV", product2Id: "01tANTIVIRUS", quantity: 1 },
    ];
    const rels = [
      { id: "0dRREL1", mainQuoteLineId: "0QLROOT", associatedQuoteLineId: "0QLLAPTOP", productRelatedComponentId: "0dSLAPTOP" },
      { id: "0dRREL2", mainQuoteLineId: "0QLROOT", associatedQuoteLineId: "0QLAV", productRelatedComponentId: "0dSANTIVIRUS" },
    ];

    const attrs = [{ id: "attr", quoteLineItemId: "0QLLAPTOP", attributeDefinitionId: "0tjPROCESSOR", attributeValue: "i5-CPU 4.4GHz" }];
    const complete = mapToConfigurationState("0Q0QUOTE", "0QLROOT", CATALOG_ROOT, lines, rels, attrs, []);
    expect(complete.isComplete).toBe(true);
    expect(complete.groups.every((g) => g.status === "complete")).toBe(true);

    const withWarning = mapToConfigurationState("0Q0QUOTE", "0QLROOT", CATALOG_ROOT, lines, rels, attrs, [
      { category: "bundlevalidation", messageType: "warning", message: "Needs review", relatedRecordId: "0QLAV" },
    ]);
    const protectionGroup = withWarning.groups.find((g) => g.label === "Computer Protection");
    expect(protectionGroup?.status).toBe("attention");
  });
});
