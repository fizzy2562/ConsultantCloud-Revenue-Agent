import { expect, it } from 'vitest';
import { mapToConfigurationState } from '../src/mapping';
import { applyOptimistically } from '../../quickpick-core/src/optimistic';
const component=(id:string, prc:string, required=false):any=>({id,name:id,nodeType:'simpleProduct',isConfigurable:true,attributeCategories:[],prices:[],productComponentGroups:[],productRelatedComponent:{id:prc,isComponentRequired:required}});
const group=(id:string,components:any[],min:number|null=1):any=>({id,name:id,sequence:1,minBundleComponents:min,maxBundleComponents:null,components});
const catalog=(groups:any[]):any=>({id:'bundle',name:'Bundle',nodeType:'bundleProduct',attributeCategories:[],prices:[],productComponentGroups:groups});
const line=(id:string,product:string)=>({id,product2Id:product,quantity:1});
const rel=(lineId:string,prc:string)=>({id:'rel-'+prc,mainQuoteLineId:'root',associatedQuoteLineId:lineId,productRelatedComponentId:prc});
it('one selected occurrence is counted only in two different groups',()=>{
 const state=mapToConfigurationState('quote','root',catalog([group('g1',[component('ssd','prc1')]),group('g2',[component('ssd','prc2')])]),[line('c1','ssd')],[rel('c1','prc1')],[],[]);
 expect(state.groups.map(g=>g.options[0].selected)).toEqual([true,false]);
 expect(state.isComplete).toBe(false);
 const next=applyOptimistically(state,{type:'deselect-option',groupId:'g1',optionId:'ssd'});
 expect(next.groups.map(g=>g.options[0].selected)).toEqual([false,false]);
});
it('an optional component cannot substitute for an absent required component in completeness',()=>{
 const state=mapToConfigurationState('quote','root',catalog([group('g',[component('required','prc1',true),component('optional','prc2')],null)]),[line('c2','optional')],[rel('c2','prc2')],[],[]);
 expect(state.groups[0].options[0].selected).toBe(false);
 expect(state.isComplete).toBe(false);
});
it('missing required attribute produces incomplete status',()=>{
 const c=component('cpu','prc1');c.attributeCategories=[{id:'attrs',name:'attrs',attributes:[{id:'serial',name:'Serial',label:'Serial',dataType:'Text',isRequired:true}]}];
 const state=mapToConfigurationState('quote','root',catalog([group('g',[c])]),[line('c','cpu')],[rel('c','prc1')],[],[]);
 expect(state.groups[0].options[0].attributes[0].currentValue).toBe(null);
 expect(state.isComplete).toBe(false);
});

it('rejects ambiguous legacy identities rather than selecting both copies',()=>{
 expect(()=>mapToConfigurationState('quote','root',catalog([group('g1',[component('ssd','prc1')]),group('g2',[component('ssd','prc2')])]),[line('c','ssd')],[{...rel('c','prc1'),productRelatedComponentId:null}],[],[])).toThrow(/Ambiguous/);
});
it('accepts zero and false as supplied required values',()=>{
 for (const value of ['0','false']) {
  const c=component('cpu','prc');c.attributeCategories=[{id:'attrs',name:'attrs',attributes:[{id:'a',name:'A',label:'A',dataType:'Text',isRequired:true}]}];
  const state=mapToConfigurationState('quote','root',catalog([group('g',[c])]),[line('c','cpu')],[rel('c','prc')],[{id:'attr',quoteLineItemId:'c',attributeDefinitionId:'a',attributeValue:value}],[]);
  expect(state.isComplete).toBe(true);
 }
});
