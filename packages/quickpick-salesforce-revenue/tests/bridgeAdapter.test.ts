import {it,expect,vi} from "vitest";
import {BridgeRevenueAdapter} from "../src/bridgeAdapter";
import type {RevenuePickerBridge} from "../src/bridge";
const summary={id:"q",quoteNumber:"Q",status:"Draft",totalPrice:1200};
const pricing={lineItems:[],totalPrice:200};
const state={rootLineId:"r",configureJson:JSON.stringify({catalogProducts:[{id:"bundle",name:"Bundle",productComponentGroups:[],prices:[],attributeCategories:[]}],success:true,errors:[]}),lines:[],relationships:[],attributes:[]};
it("never manufactures a zero total when pricing is unavailable",async()=>{
 const bridge={getQuoteSummary:async()=>summary,getPricing:async()=>{throw new Error("Price unavailable");}} as unknown as RevenuePickerBridge;
 expect((await new BridgeRevenueAdapter(bridge).createQuote("q:r")).ok).toBe(false);
});
it("confirms the whole quote total, not the currently open bundle total",async()=>{
 const bridge={getQuoteSummary:async()=>summary,getPricing:async()=>pricing} as unknown as RevenuePickerBridge;
 const result=await new BridgeRevenueAdapter(bridge).createQuote("q:r");expect(result.ok && result.data.totalPrice).toBe("1200.00");
});
it("does not fall back to a bundle total on an older server",async()=>{
 const bridge={getQuoteSummary:async()=>({...summary,totalPrice:undefined}),getPricing:async()=>pricing} as unknown as RevenuePickerBridge;
 expect((await new BridgeRevenueAdapter(bridge).createQuote("q:r")).ok).toBe(false);
});
it("reads fresh persisted completeness even when cached state was complete",async()=>{
 const fresh={...state,configureJson:JSON.stringify({catalogProducts:[{id:"bundle",name:"Bundle",productComponentGroups:[{id:"g",name:"Required",sequence:1,minBundleComponents:1,maxBundleComponents:1,components:[]}]}],success:true,errors:[]})};
 const bridge={startSession:async()=>state,validate:vi.fn(async()=>({success:true,errors:[]})),validateTransaction:vi.fn(async()=>fresh)} as unknown as RevenuePickerBridge;
 const adapter=new BridgeRevenueAdapter(bridge);await adapter.startSession({quoteId:"q",productId:"bundle"});
 const result=await adapter.validateTransaction("q:r");expect(result.ok && result.data.valid).toBe(false);
 expect(bridge.validateTransaction).toHaveBeenCalledOnce();expect(bridge.validate).not.toHaveBeenCalled();
});
it("forwards group identity on quantity updates",async()=>{
 const bridge={applyChangeAndGetState:vi.fn(async()=>state)} as unknown as RevenuePickerBridge;
 await new BridgeRevenueAdapter(bridge).applyChange("q:r",{type:"set-quantity",groupId:"group-b",optionId:"ssd",quantity:3});
 expect(bridge.applyChangeAndGetState).toHaveBeenCalledWith("q","r","set-quantity","group-b","ssd",null,null,3,true);
});
