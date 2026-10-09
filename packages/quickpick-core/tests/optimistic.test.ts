import {it, expect} from "vitest";
import {applyOptimistically} from "../src/optimistic";
import type {ConfigurationState} from "../src/types";
it("scopes a product edit to its group", () => {
 const state:ConfigurationState={sessionId:"s",rootProductId:"r",rootProductName:"Root",transactionContext:{},isComplete:true,lastUpdatedAt:"now",groups:["a","b"].map(id=>({id,apiName:id,label:id,sequence:1,cardinality:{min:0,max:null},status:"complete",options:[{id:"p",productId:"p",name:"P",selected:true,attributes:[]}]}))};
 const next=applyOptimistically(state,{type:"deselect-option",groupId:"a",optionId:"p"});
 expect(next.groups.map(g=>g.options[0].selected)).toEqual([false,true]);
});
