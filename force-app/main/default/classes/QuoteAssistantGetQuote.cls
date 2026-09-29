/**
 * Agentforce action for the Quote Assistant demo agent: looks up one Revenue Cloud quote by its
 * number and describes what is on it, bundle by bundle, with live totals.
 */
public with sharing class QuoteAssistantGetQuote {
    public class Request {
        @InvocableVariable(required=true label='Quote Number' description='The quote number, e.g. 00000049. A short form such as 49 also works.')
        public String quoteNumber;
    }

    public class Response {
        @InvocableVariable(label='Found' description='True when a quote with this number exists.')
        public Boolean found;
        @InvocableVariable(label='Quote Number' description='The full quote number.')
        public String quoteNumber;
        @InvocableVariable(label='Quote Name' description='The quote name.')
        public String quoteName;
        @InvocableVariable(label='Account' description='The account the quote is for, if any.')
        public String accountName;
        @InvocableVariable(label='Status' description='The quote status, e.g. Draft.')
        public String status;
        @InvocableVariable(label='Grand Total' description='The quote grand total.')
        public Decimal grandTotal;
        @InvocableVariable(label='Currency' description='ISO currency code for all amounts.')
        public String currencyCode;
        @InvocableVariable(label='Contents' description='What is on the quote: one line per bundle or product with its total and its components.')
        public String contents;
    }

    @InvocableMethod(label='Get Quote Details' description='Look up a Revenue Cloud quote by number and describe its bundles, components and totals.')
    public static List<Response> getQuote(List<Request> requests) {
        List<Response> responses = new List<Response>();
        for (Request request : requests) {
            responses.add(describe(normalise(request.quoteNumber)));
        }
        return responses;
    }

    /** "49" or "Q-49" becomes "00000049"; anything else is used as given. */
    @TestVisible
    private static String normalise(String raw) {
        String value = raw == null ? '' : raw.trim();
        String digits = value.replaceAll('[^0-9]', '');
        return String.isNotBlank(digits) && digits.length() <= 8 ? digits.leftPad(8, '0') : value;
    }

    private static Response describe(String quoteNumber) {
        Response response = new Response();
        response.quoteNumber = quoteNumber;
        response.currencyCode = UserInfo.getDefaultCurrency();
        List<Quote> quotes = [
            SELECT Id, QuoteNumber, Name, Status, GrandTotal, Account.Name
            FROM Quote WHERE QuoteNumber = :quoteNumber LIMIT 1
        ];
        if (quotes.isEmpty()) {
            response.found = false;
            response.contents = 'No quote found with number ' + quoteNumber + '.';
            return response;
        }
        Quote quote = quotes[0];
        response.found = true;
        response.quoteName = quote.Name;
        response.accountName = quote.Account?.Name;
        response.status = quote.Status;
        response.grandTotal = quote.GrandTotal == null ? null : quote.GrandTotal.setScale(2);
        response.contents = contents(quote.Id);
        return response;
    }

    /**
     * Bundles are trees of quote lines joined by QuoteLineRelationship; lines with no parent are the top level.
     * Lines are read in system mode: the agent user's license has no access to Revenue Cloud line objects, and
     * the quote itself was already found with the user's own access above. Read-only.
     */
    private static String contents(Id quoteId) {
        Map<Id, QuoteLineItem> lines = new Map<Id, QuoteLineItem>([
            SELECT Id, Product2.Name, Quantity, NetTotalPrice
            FROM QuoteLineItem WHERE QuoteId = :quoteId WITH SYSTEM_MODE ORDER BY LineNumber
        ]);
        if (lines.isEmpty()) return 'The quote has no lines yet.';

        Map<Id, List<Id>> children = new Map<Id, List<Id>>();
        Set<Id> hasParent = new Set<Id>();
        for (QuoteLineRelationship rel : [
            SELECT MainQuoteLineId, AssociatedQuoteLineId
            FROM QuoteLineRelationship WHERE MainQuoteLineId IN :lines.keySet() WITH SYSTEM_MODE
        ]) {
            if (!children.containsKey(rel.MainQuoteLineId)) children.put(rel.MainQuoteLineId, new List<Id>());
            children.get(rel.MainQuoteLineId).add(rel.AssociatedQuoteLineId);
            hasParent.add(rel.AssociatedQuoteLineId);
        }

        List<String> out = new List<String>();
        for (QuoteLineItem line : lines.values()) {
            if (hasParent.contains(line.Id)) continue;
            List<String> components = new List<String>();
            Decimal total = subtreeTotal(line.Id, lines, children, components);
            String entry = '- ' + line.Product2.Name + (line.Quantity > 1 ? ' x' + line.Quantity.stripTrailingZeros() : '')
                + ': ' + total.setScale(2).toPlainString();
            if (!components.isEmpty()) entry += ' (' + components.size() + ' components: ' + String.join(components, ', ') + ')';
            out.add(entry);
        }
        return String.join(out, '\n');
    }

    private static Decimal subtreeTotal(Id lineId, Map<Id, QuoteLineItem> lines, Map<Id, List<Id>> children, List<String> names) {
        QuoteLineItem line = lines.get(lineId);
        Decimal total = line?.NetTotalPrice == null ? 0 : line.NetTotalPrice;
        if (children.containsKey(lineId)) {
            for (Id childId : children.get(lineId)) {
                QuoteLineItem child = lines.get(childId);
                if (child == null) continue;
                names.add(child.Product2.Name + (child.Quantity > 1 ? ' x' + child.Quantity.stripTrailingZeros() : ''));
                total += subtreeTotal(childId, lines, children, names);
            }
        }
        return total;
    }
}
