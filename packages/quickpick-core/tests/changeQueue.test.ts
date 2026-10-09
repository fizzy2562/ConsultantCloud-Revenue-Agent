import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {ChangeQueue} from "../src/changeQueue";
import type {ConfigurationChange, ConfigurationState} from "../src/types";
const state: ConfigurationState = {sessionId:"q:r",rootProductId:"r",rootProductName:"R",transactionContext:{},groups:[],isComplete:true,lastUpdatedAt:"1"};
const qty=(n:number):ConfigurationChange=>({type:"set-quantity",groupId:"g",optionId:"p",quantity:n});
beforeEach(()=>vi.useFakeTimers()); afterEach(()=>vi.useRealTimers());
it("flushes quantity immediately and resolves every debounced caller",async()=>{
 const apply=vi.fn(async()=>({state,error:null}));
 const queue=new ChangeQueue(state,apply,()=>{},()=>{});
 const a=queue.enqueue([qty(2)],700),b=queue.enqueue([qty(3)],700);
 await queue.flush();await Promise.all([a,b]);
 expect(apply).toHaveBeenCalledExactlyOnceWith([qty(3)]);
 await vi.runAllTimersAsync();expect(apply).toHaveBeenCalledTimes(1);
});
it("preserves atomic swaps and serializes dependent same-group edits",async()=>{
 const apply=vi.fn(async()=>({state,error:null}));const queue=new ChangeQueue(state,apply,()=>{},()=>{});
 const swap:ConfigurationChange[]=[{type:"deselect-option",groupId:"g",optionId:"a"},{type:"select-option",groupId:"g",optionId:"p"}];
 const a=queue.enqueue(swap),b=queue.enqueue([qty(4)]);await Promise.all([queue.flush(),a,b]);
 expect(apply.mock.calls.map(c=>c[0])).toEqual([swap,[qty(4)]]);
});
it("shares the flush lock and reconciles pending optimistic edits",async()=>{
 let finish!:(value:any)=>void;
 const apply=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({state,error:null});
 const reconcile=vi.fn();const queue=new ChangeQueue(state,apply,reconcile,()=>{});
 const a=queue.enqueue([qty(2)]);const flush=queue.flush();await Promise.resolve();
 const b=queue.enqueue([qty(3)]);expect(queue.flush()).toBe(flush);
 finish({state,error:null});await Promise.all([flush,a,b]);
 expect(reconcile.mock.calls[0][1]).toEqual([qty(3)]);expect(apply).toHaveBeenCalledTimes(2);
});
it("returns failure and cancels dependent jobs rather than replaying them",async()=>{
 const apply=vi.fn(async()=>({state,error:"Rejected"}));const queue=new ChangeQueue(state,apply,()=>{},()=>{});
 const a=queue.enqueue([qty(2)]),b=queue.enqueue([qty(3),{type:"deselect-option",groupId:"g",optionId:"x"}]);
 expect((await queue.flush()).error).toBe("Rejected");expect((await a).error).toBe("Rejected");expect((await b).error).toBe("Rejected");expect(apply).toHaveBeenCalledTimes(1);
});
it("disposal settles queued work and suppresses obsolete response reconciliation",async()=>{
 let finish!:(value:any)=>void;const reconcile=vi.fn();
 const queue=new ChangeQueue(state,()=>new Promise(resolve=>{finish=resolve}),reconcile,()=>{});
 const a=queue.enqueue([qty(2)]);const flush=queue.flush();await Promise.resolve();
 const b=queue.enqueue([qty(4)]);queue.dispose();expect((await b).error).toBeTruthy();
 finish({state,error:null});await flush;expect((await a).error).toBeTruthy();expect(reconcile).not.toHaveBeenCalled();
});
