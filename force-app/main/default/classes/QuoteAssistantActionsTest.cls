@IsTest
private class QuoteAssistantActionsTest {
    @TestSetup
    static void setup() {
        ProductSellingModel oneTime = new ProductSellingModel(Name = 'QA Test One Time', SellingModelType = 'OneTime', Status = 'Active');
        insert oneTime;
        Product2 bundle = new Product2(Name = 'QA Test Bundle', Type = 'Bundle', IsActive = true);
        Product2 laptop = new Product2(Name = 'QA Test Laptop', IsActive = true);
        insert new List<Product2>{ bundle, laptop };
        insert new List<ProductSellingModelOption>{
            new ProductSellingModelOption(Product2Id = bundle.Id, ProductSellingModelId = oneTime.Id),
            new ProductSellingModelOption(Product2Id = laptop.Id, ProductSellingModelId = oneTime.Id)
        };
        Id standard = Test.getStandardPricebookId();
        PricebookEntry bundlePrice = new PricebookEntry(Pricebook2Id = standard, Product2Id = bundle.Id, UnitPrice = 1000, IsActive = true, ProductSellingModelId = oneTime.Id);
        PricebookEntry laptopPrice = new PricebookEntry(Pricebook2Id = standard, Product2Id = laptop.Id, UnitPrice = 800, IsActive = true, ProductSellingModelId = oneTime.Id);
        insert new List<PricebookEntry>{ bundlePrice, laptopPrice };
        ProductRelationshipType relType = new ProductRelationshipType(Name = 'QA Test Component', MainProductRoleCat = 'Bundle', AssociatedProductRoleCat = 'BundleComponent');
        insert relType;

        Quote quote = new Quote(Name = 'QA Test Quote', Pricebook2Id = standard);
        insert quote;
        QuoteLineItem root = new QuoteLineItem(QuoteId = quote.Id, Product2Id = bundle.Id, PricebookEntryId = bundlePrice.Id, Quantity = 1, UnitPrice = 1000);
        QuoteLineItem child = new QuoteLineItem(QuoteId = quote.Id, Product2Id = laptop.Id, PricebookEntryId = laptopPrice.Id, Quantity = 2, UnitPrice = 800);
        insert new List<QuoteLineItem>{ root, child };
        insert new QuoteLineRelationship(
            MainQuoteLineId = root.Id, AssociatedQuoteLineId = child.Id,
            ProductRelationshipTypeId = relType.Id, AssociatedQuoteLinePricing = 'NotIncludedInBundlePrice'
        );
    }

    private static String quoteNumber() {
        return [SELECT QuoteNumber FROM Quote WHERE Name = 'QA Test Quote' LIMIT 1].QuoteNumber;
    }

    @IsTest
    static void describesBundlesWithComponents() {
        QuoteAssistantGetQuote.Request request = new QuoteAssistantGetQuote.Request();
        request.quoteNumber = String.valueOf(Integer.valueOf(quoteNumber()));
        QuoteAssistantGetQuote.Response response = QuoteAssistantGetQuote.getQuote(new List<QuoteAssistantGetQuote.Request>{ request })[0];
        Assert.isTrue(response.found);
        Assert.areEqual(quoteNumber(), response.quoteNumber, 'short number is padded');
        Assert.isTrue(response.contents.contains('QA Test Bundle'), response.contents);
        Assert.isTrue(response.contents.contains('1 components: QA Test Laptop x2'), response.contents);
        Assert.isFalse(response.contents.startsWith('- QA Test Laptop'), 'components are not listed as top-level lines');
    }

    @IsTest
    static void reportsMissingQuote() {
        QuoteAssistantGetQuote.Request request = new QuoteAssistantGetQuote.Request();
        request.quoteNumber = '99999999';
        QuoteAssistantGetQuote.Response response = QuoteAssistantGetQuote.getQuote(new List<QuoteAssistantGetQuote.Request>{ request })[0];
        Assert.isFalse(response.found);
    }

    @IsTest
    static void normalisesShortForms() {
        Assert.areEqual('00000049', QuoteAssistantGetQuote.normalise('Q-49'));
        Assert.areEqual('00000049', QuoteAssistantGetQuote.normalise(' 49 '));
    }

    @IsTest
    static void listsRecentQuotes() {
        QuoteAssistantRecentQuotes.Request request = new QuoteAssistantRecentQuotes.Request();
        request.howMany = 3;
        QuoteAssistantRecentQuotes.Response response = QuoteAssistantRecentQuotes.listRecent(new List<QuoteAssistantRecentQuotes.Request>{ request })[0];
        Assert.isTrue(response.quotes.contains('QA Test Quote'), response.quotes);
    }
}
