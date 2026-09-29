/**
 * Backs the quoteAssistantChat Lightning component: a chat with the published Quote Assistant
 * Agentforce agent over the Agent API (api.salesforce.com/einstein/ai-agent/v1).
 *
 * Auth goes through the Quote_Assistant_Agent_API Named Credential, which must hold a JWT-based
 * token from an External Client App with the chatbot_api and sfap_api scopes (see
 * docs/quote-assistant-lightning.md). Nothing here stores or sees a secret.
 */
public with sharing class QuoteAssistantChatController {
    @TestVisible static final String NAMED_CREDENTIAL = 'callout:Quote_Assistant_Agent_API';
    @TestVisible static final String AGENT_NAME = 'Quote_Assistant';
    static final String BASE = '/einstein/ai-agent/v1';

    public class ChatReply {
        @AuraEnabled public String sessionId;
        @AuraEnabled public List<String> messages = new List<String>();
    }

    @AuraEnabled
    public static ChatReply startSession() {
        List<BotDefinition> bots = [SELECT Id FROM BotDefinition WHERE DeveloperName = :AGENT_NAME LIMIT 1];
        if (bots.isEmpty()) throw error('The Quote Assistant agent is not deployed in this org.');
        Map<String, Object> body = new Map<String, Object>{
            'externalSessionKey' => UUID.randomUUID().toString(),
            'instanceConfig' => new Map<String, Object>{ 'endpoint' => URL.getOrgDomainUrl().toExternalForm() },
            'streamingCapabilities' => new Map<String, Object>{ 'chunkTypes' => new List<String>{ 'Text' } },
            'bypassUser' => true
        };
        Map<String, Object> response = call('POST', BASE + '/agents/' + bots[0].Id + '/sessions', body, null);
        ChatReply reply = toReply(response);
        reply.sessionId = (String) response.get('sessionId');
        return reply;
    }

    /** `context` (e.g. "The user is viewing quote 00000049.") is prefixed so "this quote" resolves. */
    @AuraEnabled
    public static ChatReply sendMessage(String sessionId, String text, String context) {
        if (String.isBlank(sessionId) || String.isBlank(text)) throw error('Nothing to send.');
        String message = String.isBlank(context) ? text : '(' + context + ') ' + text;
        Map<String, Object> body = new Map<String, Object>{
            'message' => new Map<String, Object>{ 'sequenceId' => Datetime.now().getTime(), 'type' => 'Text', 'text' => message },
            'variables' => new List<Object>()
        };
        ChatReply reply = toReply(call('POST', BASE + '/sessions/' + EncodingUtil.urlEncode(sessionId, 'UTF-8') + '/messages', body, null));
        reply.sessionId = sessionId;
        return reply;
    }

    @AuraEnabled
    public static void endSession(String sessionId) {
        if (String.isBlank(sessionId)) return;
        try {
            call('DELETE', BASE + '/sessions/' + EncodingUtil.urlEncode(sessionId, 'UTF-8'), null, new Map<String, String>{ 'x-session-end-reason' => 'UserRequest' });
        } catch (Exception e) {
            // Ending is best-effort: an expired session is already over.
        }
    }

    private static Map<String, Object> call(String method, String path, Object body, Map<String, String> headers) {
        HttpRequest request = new HttpRequest();
        request.setMethod(method);
        request.setEndpoint(NAMED_CREDENTIAL + path);
        request.setTimeout(120000);
        request.setHeader('Content-Type', 'application/json');
        request.setHeader('x-attributed-client', 'no-builder');
        if (headers != null) for (String name : headers.keySet()) request.setHeader(name, headers.get(name));
        if (body != null) request.setBody(JSON.serialize(body));
        HttpResponse response;
        try {
            response = new Http().send(request);
        } catch (CalloutException e) {
            throw error('Could not reach the Agent API: ' + e.getMessage());
        }
        String raw = response.getBody();
        if (response.getStatusCode() >= 300) {
            throw error('The agent returned HTTP ' + response.getStatusCode() + (String.isBlank(raw) ? '' : ': ' + raw.abbreviate(300)));
        }
        return String.isBlank(raw) ? new Map<String, Object>() : (Map<String, Object>) JSON.deserializeUntyped(raw);
    }

    private static ChatReply toReply(Map<String, Object> response) {
        ChatReply reply = new ChatReply();
        Object messages = response.get('messages');
        if (messages instanceof List<Object>) {
            for (Object m : (List<Object>) messages) {
                Object text = ((Map<String, Object>) m).get('message');
                if (text != null && String.isNotBlank(String.valueOf(text))) reply.messages.add(String.valueOf(text));
            }
        }
        return reply;
    }

    private static AuraHandledException error(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}
