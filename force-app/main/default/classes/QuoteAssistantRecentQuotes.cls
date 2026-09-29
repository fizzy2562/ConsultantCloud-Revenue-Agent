/** Agentforce action for the Quote Assistant demo agent: the most recently changed quotes. */
public with sharing class QuoteAssistantRecentQuotes {
    public class Request {
        @InvocableVariable(label='How Many' description='How many quotes to return, 1 to 20. Defaults to 5.')
        public Decimal howMany;
    }

    public class Response {
        @InvocableVariable(label='Quotes' description='One line per quote: number, name, account, status and grand total, most recent first.')
        public String quotes;
        @InvocableVariable(label='Currency' description='ISO currency code for the totals.')
        public String currencyCode;
    }

    @InvocableMethod(label='List Recent Quotes' description='List the most recently changed Revenue Cloud quotes with their status and totals.')
    public static List<Response> listRecent(List<Request> requests) {
        Integer howMany = requests.isEmpty() || requests[0].howMany == null ? 5 : Math.max(1, Math.min(20, requests[0].howMany.intValue()));
        List<String> rows = new List<String>();
        for (Quote q : [
            SELECT QuoteNumber, Name, Status, GrandTotal, Account.Name
            FROM Quote ORDER BY LastModifiedDate DESC LIMIT :howMany
        ]) {
            rows.add('- ' + q.QuoteNumber + ' "' + q.Name + '"' + (q.Account?.Name == null ? '' : ' for ' + q.Account.Name)
                + ', ' + q.Status + ', total ' + (q.GrandTotal == null ? '0.00' : q.GrandTotal.setScale(2).toPlainString()));
        }
        Response response = new Response();
        response.quotes = rows.isEmpty() ? 'There are no quotes yet.' : String.join(rows, '\n');
        response.currencyCode = UserInfo.getDefaultCurrency();
        List<Response> responses = new List<Response>();
        for (Integer i = 0; i < requests.size(); i++) responses.add(response);
        return responses;
    }
}
