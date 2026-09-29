@IsTest
private class QuoteAssistantChatControllerTest {
    private class AgentApiMock implements HttpCalloutMock {
        Integer status;
        AgentApiMock(Integer status) { this.status = status; }
        public HttpResponse respond(HttpRequest request) {
            Assert.isTrue(request.getEndpoint().startsWith(QuoteAssistantChatController.NAMED_CREDENTIAL), request.getEndpoint());
            HttpResponse response = new HttpResponse();
            response.setStatusCode(status);
            if (status >= 300) {
                response.setBody('{"message":"nope"}');
            } else if (request.getMethod() == 'DELETE') {
                response.setBody('');
                Assert.areEqual('UserRequest', request.getHeader('x-session-end-reason'));
            } else if (request.getEndpoint().endsWith('/sessions')) {
                response.setBody('{"sessionId":"s-1","messages":[{"type":"Inform","message":"Hi, I\'m the Quote Assistant."}]}');
            } else {
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(request.getBody());
                String text = (String) ((Map<String, Object>) body.get('message')).get('text');
                response.setBody('{"messages":[{"type":"Inform","message":"You said: ' + text.replace('"', '') + '"}]}');
            }
            return response;
        }
    }

    // BotDefinition can't be inserted in a test, so session start is exercised only when the agent exists.
    @IsTest
    static void startsSessionWhenAgentExists() {
        Test.setMock(HttpCalloutMock.class, new AgentApiMock(200));
        Boolean deployed = ![SELECT Id FROM BotDefinition WHERE DeveloperName = :QuoteAssistantChatController.AGENT_NAME].isEmpty();
        Test.startTest();
        try {
            QuoteAssistantChatController.ChatReply reply = QuoteAssistantChatController.startSession();
            Assert.isTrue(deployed);
            Assert.areEqual('s-1', reply.sessionId);
            Assert.areEqual(1, reply.messages.size());
        } catch (AuraHandledException e) {
            Assert.isFalse(deployed, e.getMessage());
        }
        Test.stopTest();
    }

    @IsTest
    static void sendsMessageWithQuoteContext() {
        Test.setMock(HttpCalloutMock.class, new AgentApiMock(200));
        Test.startTest();
        QuoteAssistantChatController.ChatReply reply = QuoteAssistantChatController.sendMessage('s-1', 'What is on this quote?', 'The user is viewing quote 00000049.');
        Test.stopTest();
        Assert.areEqual('s-1', reply.sessionId);
        Assert.isTrue(reply.messages[0].contains('(The user is viewing quote 00000049.) What is on this quote?'), reply.messages[0]);
    }

    @IsTest
    static void surfacesAgentApiErrors() {
        Test.setMock(HttpCalloutMock.class, new AgentApiMock(401));
        Test.startTest();
        try {
            QuoteAssistantChatController.sendMessage('s-1', 'hello', null);
            Assert.fail('expected an error');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('HTTP 401'), e.getMessage());
        }
        Test.stopTest();
    }

    @IsTest
    static void endsSessionQuietly() {
        Test.setMock(HttpCalloutMock.class, new AgentApiMock(200));
        Test.startTest();
        QuoteAssistantChatController.endSession('s-1');
        QuoteAssistantChatController.endSession(null);
        Test.stopTest();
    }

    @IsTest
    static void rejectsEmptyMessages() {
        try {
            QuoteAssistantChatController.sendMessage('s-1', '  ', null);
            Assert.fail('expected an error');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('Nothing to send'));
        }
    }
}
