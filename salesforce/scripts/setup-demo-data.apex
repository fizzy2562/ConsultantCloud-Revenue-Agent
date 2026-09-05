// Idempotent demo data setup for ConsultantCloud Revenue Agent.
// Run via: sf apex run --file salesforce/scripts/setup-demo-data.apex --target-org <alias>
//
// Known gap: newly created Product2 records are not immediately visible to
// the RLM "ProductDiscovery Service" that quotingAI__addQuoteLineItemToQuote
// depends on, even after being linked to a ProductCategory (see the category
// linkage block near the end of this script). This was observed to still be
// unresolved after 10+ minutes in a fresh Trailhead org. Quote-line addition
// against these products will fail with "Could not find product with ID..."
// until that indexing completes or an administrator publishes the catalog
// through the Setup UI. find_account, search_products, get_quote_summary,
// and quote/opportunity creation are unaffected and verified working live.
List<Account> existingAcme = [SELECT Id FROM Account WHERE Name = 'Acme University' LIMIT 1];
Account acmeAcct;
if (existingAcme.isEmpty()) {
    acmeAcct = new Account(Name = 'Acme University', Industry = 'Education');
    insert acmeAcct;
} else {
    acmeAcct = existingAcme[0];
}

List<Account> existingGreenfield = [SELECT Id FROM Account WHERE Name = 'Greenfield Health' LIMIT 1];
Account greenfieldAcct;
if (existingGreenfield.isEmpty()) {
    greenfieldAcct = new Account(Name = 'Greenfield Health', Industry = 'Healthcare');
    insert greenfieldAcct;
} else {
    greenfieldAcct = existingGreenfield[0];
}

Map<String, Decimal> productPrices = new Map<String, Decimal>{
    'Cloud Essentials' => 1200,
    'Cloud Pro' => 2400,
    'Premium Support' => 800
};

Map<String, Id> productIds = new Map<String, Id>();
for (String prodName : productPrices.keySet()) {
    List<Product2> existingProd = [SELECT Id FROM Product2 WHERE Name = :prodName LIMIT 1];
    Id prodId;
    if (existingProd.isEmpty()) {
        Product2 p = new Product2(
            Name = prodName,
            IsActive = true,
            IsSerialized = false,
            IsAssetizable = true,
            IsSoldOnlyWithOtherProds = false
        );
        insert p;
        prodId = p.Id;
    } else {
        prodId = existingProd[0].Id;
    }
    productIds.put(prodName, prodId);
}

Pricebook2 stdPb = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
for (String prodName : productPrices.keySet()) {
    List<PricebookEntry> existingPbe = [SELECT Id FROM PricebookEntry WHERE Product2Id = :productIds.get(prodName) AND Pricebook2Id = :stdPb.Id LIMIT 1];
    if (existingPbe.isEmpty()) {
        insert new PricebookEntry(
            Product2Id = productIds.get(prodName),
            Pricebook2Id = stdPb.Id,
            UnitPrice = productPrices.get(prodName),
            IsActive = true
        );
    }
}

List<ProductSellingModel> existingPsm = [SELECT Id FROM ProductSellingModel WHERE SellingModelType = 'TermDefined' AND PricingTerm = 1 AND PricingTermUnit = 'Annual' LIMIT 1];
Id psmId;
if (existingPsm.isEmpty()) {
    ProductSellingModel psm = new ProductSellingModel(
        Name = 'Annual Term',
        SellingModelType = 'TermDefined',
        Status = 'Active',
        PricingTerm = 1,
        PricingTermUnit = 'Annual'
    );
    insert psm;
    psmId = psm.Id;
} else {
    psmId = existingPsm[0].Id;
}

for (String prodName : productPrices.keySet()) {
    List<ProductSellingModelOption> existingOpt = [SELECT Id FROM ProductSellingModelOption WHERE Product2Id = :productIds.get(prodName) AND ProductSellingModelId = :psmId LIMIT 1];
    if (existingOpt.isEmpty()) {
        insert new ProductSellingModelOption(
            Product2Id = productIds.get(prodName),
            ProductSellingModelId = psmId,
            IsDefault = true
        );
    }
}

// Best-effort category linkage, to give newly created products a chance of
// being picked up by ProductDiscovery. This alone was NOT sufficient to
// resolve the indexing gap noted above during testing - kept because it is
// still a correct, necessary step (existing seeded products are all
// categorized), just not a complete fix on its own.
List<ProductCategory> softwareCategories = [SELECT Id FROM ProductCategory WHERE Name = 'Productivity Software' LIMIT 1];
if (!softwareCategories.isEmpty()) {
    Id categoryId = softwareCategories[0].Id;
    for (Id prodId : productIds.values()) {
        List<ProductCategoryProduct> existingLink = [SELECT Id FROM ProductCategoryProduct WHERE ProductId = :prodId AND ProductCategoryId = :categoryId LIMIT 1];
        if (existingLink.isEmpty()) {
            insert new ProductCategoryProduct(ProductId = prodId, ProductCategoryId = categoryId);
        }
    }
}

// Known gap: this directly-inserted Asset will NOT be recognized as
// "Active" or "Renewable" by quotingAI__getAccountAssets, because fields
// like LifecycleEndDate / HasLifecycleManagement are system-managed and
// only populated by the real quote -> contract -> asset activation
// pipeline, not by a direct Asset insert. Kept as a best-effort fixture
// (useful for direct SOQL/reporting) but do not expect it to satisfy the
// renewal flow's asset lookup until a real quote has been run through
// activation for this account.
List<Asset> existingAsset = [SELECT Id FROM Asset WHERE AccountId = :acmeAcct.Id AND Product2Id = :productIds.get('Cloud Pro') LIMIT 1];
if (existingAsset.isEmpty()) {
    insert new Asset(
        Name = 'Cloud Pro - Acme University',
        AccountId = acmeAcct.Id,
        Product2Id = productIds.get('Cloud Pro'),
        Quantity = 100,
        PurchaseDate = Date.today().addYears(-1),
        UsageEndDate = Date.today().addDays(45),
        Status = 'Purchased'
    );
}

List<Opportunity> existingOpp = [SELECT Id FROM Opportunity WHERE AccountId = :greenfieldAcct.Id LIMIT 1];
if (existingOpp.isEmpty()) {
    insert new Opportunity(
        Name = 'Greenfield Health - Initial Deal',
        AccountId = greenfieldAcct.Id,
        StageName = 'Qualification',
        CloseDate = Date.today().addDays(30)
    );
}

System.debug('ACME_ID=' + acmeAcct.Id);
System.debug('GREENFIELD_ID=' + greenfieldAcct.Id);
System.debug('CLOUD_ESSENTIALS_ID=' + productIds.get('Cloud Essentials'));
System.debug('CLOUD_PRO_ID=' + productIds.get('Cloud Pro'));
System.debug('PREMIUM_SUPPORT_ID=' + productIds.get('Premium Support'));
System.debug('PSM_ID=' + psmId);
System.debug('SETUP_COMPLETE');
