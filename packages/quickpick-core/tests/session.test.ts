import { describe, expect, it } from "vitest";
import { ConfigurationSession } from "../src/session";
import type { RevenueConfigurator } from "../src/adapter";
import type { ConfigurationState } from "../src/types";

function makeState(overrides: Partial<ConfigurationState> = {}): ConfigurationState {
  return {
    sessionId: "sess-1",
    rootProductId: "prod-root",
    rootProductName: "CloudForge Pro PC",
    transactionContext: {},
    groups: [],
    isComplete: true,
    lastUpdatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

function makeAdapter(overrides: Partial<RevenueConfigurator> = {}): RevenueConfigurator {
  return {
    startSession: async () => ({ ok: true, data: makeState() }),
    getState: async () => ({ ok: true, data: makeState() }),
    applyChange: async () => ({ ok: true, data: makeState({ lastUpdatedAt: "2026-09-21T00:01:00.000Z" }) }),
    completeGroup: async () => ({ ok: true, data: makeState() }),
    getPricing: async () => ({
      ok: true,
      data: { sessionId: "sess-1", lineItems: [], totalPrice: "0.00", currencyIsoCode: "USD", calculatedAt: "now" },
    }),
    validateTransaction: async () => ({
      ok: true,
      data: { sessionId: "sess-1", valid: true, validatedAt: "now", issues: [] },
    }),
    createQuote: async () => ({
      ok: true,
      data: { quoteId: "q-1", quoteNumber: "Q-0001", status: "Draft", totalPrice: "0.00" },
    }),
    ...overrides,
  };
}

describe("ConfigurationSession", () => {
  it("refuses to create a quote before any validation has run", async () => {
    const session = new ConfigurationSession(makeAdapter());
    await session.start({ productId: "prod-root" });

    const result = await session.createQuote();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_NOT_CURRENT");
  });

  it("allows Send Quote once validation passes and nothing has changed since", async () => {
    const session = new ConfigurationSession(makeAdapter());
    await session.start({ productId: "prod-root" });

    const state = makeState();
    await session.validateTransaction(state);
    expect(session.canSendQuote).toBe(true);

    const result = await session.createQuote();
    expect(result.ok).toBe(true);
  });

  it("invalidates Send Quote as soon as the configuration changes after a passing validation", async () => {
    const session = new ConfigurationSession(makeAdapter());
    await session.start({ productId: "prod-root" });

    await session.validateTransaction(makeState());
    expect(session.canSendQuote).toBe(true);

    await session.applyChange({ type: "select-option", groupId: "g1", optionId: "o1" });
    expect(session.canSendQuote).toBe(false);

    const result = await session.createQuote();
    expect(result.ok).toBe(false);
  });

  it("does not allow Send Quote when validation itself reports invalid", async () => {
    const adapter = makeAdapter({
      validateTransaction: async () => ({
        ok: true,
        data: { sessionId: "sess-1", valid: false, validatedAt: "now", issues: [{ message: "GPU no longer available" }] },
      }),
    });
    const session = new ConfigurationSession(adapter);
    await session.start({ productId: "prod-root" });

    await session.validateTransaction(makeState());
    expect(session.canSendQuote).toBe(false);
  });
});


it("blocks confirmation while a mutation is pending", async () => {
  let finish!: (value: any) => void;
  const session = new ConfigurationSession(makeAdapter({applyChange: () => new Promise(resolve => {finish = resolve;})}));
  await session.start({productId: "root"}); await session.validateTransaction(makeState());
  const pending = session.applyChange({type:"select-option",groupId:"g",optionId:"p"});
  const result = await session.createQuote();
  finish({ok:true,data:makeState()}); await pending;
  expect(result.ok).toBe(false);
});
it("clears a prior pass when validation fails", async () => {
  let fail = false;
  const session = new ConfigurationSession(makeAdapter({validateTransaction: async () => fail
    ? {ok:false,error:{code:"TIMEOUT",message:"Timeout",retryable:true}}
    : {ok:true,data:{sessionId:"sess-1",valid:true,validatedAt:"now",issues:[]}}}));
  await session.start({productId:"root"}); await session.validateTransaction(makeState()); fail = true;
  await session.validateTransaction(makeState()); expect(session.canSendQuote).toBe(false);
});

it("queued edits invalidate before they reach the adapter", async () => {
 const session=new ConfigurationSession(makeAdapter());await session.start({productId:"root"});await session.validateTransaction(makeState());
 session.markDirty();expect(session.canSendQuote).toBe(false);
});
it("ignores a successful validation response after another edit",async()=>{
 let finish!:(value:any)=>void;const session=new ConfigurationSession(makeAdapter({validateTransaction:()=>new Promise(resolve=>{finish=resolve})}));
 await session.start({productId:"root"});const pending=session.validateTransaction(makeState());session.markDirty();
 finish({ok:true,data:{sessionId:"sess-1",valid:true,issues:[],validatedAt:"now"}});
 expect((await pending).ok).toBe(false);expect(session.canSendQuote).toBe(false);
});
it("resumes the requested root without creating or finding a different bundle",async()=>{
 const session=new ConfigurationSession(makeAdapter({getState:async id=>({ok:true,data:makeState({sessionId:id})})}));
 await session.resume("quote:second-root");expect(session.id).toBe("quote:second-root");
});
