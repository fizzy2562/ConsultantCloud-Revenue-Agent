import { LightningElement, api, wire } from "lwc";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import QUOTE_NUMBER from "@salesforce/schema/Quote.QuoteNumber";
import startSession from "@salesforce/apex/QuoteAssistantChatController.startSession";
import sendMessage from "@salesforce/apex/QuoteAssistantChatController.sendMessage";
import endSession from "@salesforce/apex/QuoteAssistantChatController.endSession";

let nextId = 0;

/**
 * Chat with the Quote Assistant Agentforce agent. On a Quote record page the agent is told which
 * quote is open, so "what's on this quote?" needs no quote number.
 */
export default class QuoteAssistantChat extends LightningElement {
    @api recordId;
    @api objectApiName;
    @api cardTitle = "Quote Assistant";

    messages = [];
    draft = "";
    sessionId;
    busy = false;
    error;
    contextSent = false;

    @wire(getRecord, { recordId: "$quoteRecordId", fields: [QUOTE_NUMBER] })
    quote;

    get quoteRecordId() {
        return this.objectApiName === "Quote" ? this.recordId : undefined;
    }

    get quoteNumber() {
        return this.quote?.data ? getFieldValue(this.quote.data, QUOTE_NUMBER) : null;
    }

    get suggestions() {
        return this.quoteNumber
            ? ["What's on this quote?", "Which bundle costs the most?"]
            : ["Which quotes changed recently?", "What's on quote 49?"];
    }

    get showSuggestions() {
        return !this.busy && this.messages.filter((m) => m.outbound).length === 0;
    }

    get sendDisabled() {
        return this.busy || !this.draft.trim();
    }

    connectedCallback() {
        this.begin();
    }

    disconnectedCallback() {
        if (this.sessionId) endSession({ sessionId: this.sessionId }).catch(() => {});
    }

    async begin() {
        this.busy = true;
        this.error = undefined;
        try {
            const reply = await startSession();
            this.sessionId = reply.sessionId;
            this.contextSent = false;
            reply.messages.forEach((text) => this.add(text, false));
        } catch (e) {
            this.error = this.describe(e);
        } finally {
            this.busy = false;
        }
    }

    handleInput(event) {
        this.draft = event.target.value;
    }

    handleKeyUp(event) {
        if (event.key === "Enter" && !this.sendDisabled) this.send(this.draft);
    }

    handleSend() {
        this.send(this.draft);
    }

    handleSuggestion(event) {
        this.send(event.target.dataset.text);
    }

    handleRestart() {
        if (this.sessionId) endSession({ sessionId: this.sessionId }).catch(() => {});
        this.sessionId = undefined;
        this.messages = [];
        this.begin();
    }

    async send(text) {
        const trimmed = (text || "").trim();
        if (!trimmed || this.busy) return;
        if (!this.sessionId) await this.begin();
        if (!this.sessionId) return;
        this.draft = "";
        this.add(trimmed, true);
        this.busy = true;
        this.error = undefined;
        const context = this.quoteNumber && !this.contextSent ? `The user is viewing quote ${this.quoteNumber}.` : null;
        try {
            const reply = await sendMessage({ sessionId: this.sessionId, text: trimmed, context });
            if (context) this.contextSent = true;
            reply.messages.forEach((m) => this.add(m, false));
        } catch (e) {
            this.error = this.describe(e);
        } finally {
            this.busy = false;
        }
    }

    add(text, outbound) {
        this.messages = [
            ...this.messages,
            {
                id: ++nextId,
                text,
                outbound,
                itemClass: `slds-chat-listitem ${outbound ? "slds-chat-listitem_outbound" : "slds-chat-listitem_inbound"}`,
                bubbleClass: `slds-chat-message__text ${outbound ? "slds-chat-message__text_outbound" : "slds-chat-message__text_inbound"}`
            }
        ];
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        requestAnimationFrame(() => {
            const log = this.refs.log;
            if (log) log.scrollTop = log.scrollHeight;
        });
    }

    describe(e) {
        return e?.body?.message || e?.message || "Something went wrong talking to the agent.";
    }
}
