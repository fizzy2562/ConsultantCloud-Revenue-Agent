# ConsultantCloud Revenue Agent

Resume-ready Agentforce authoring bundle for `cc-revenue-org`. The AgentScript contains all 12 revenue actions backed by `ConsultantCloudRevenueTools` and validates successfully in the target org.

Validate before publishing:

```sh
sf agent validate authoring-bundle --api-name ConsultantCloud_Revenue_Agent --target-org cc-revenue-org
```

Publish when Salesforce resolves the authoring defect:

```sh
sf agent publish authoring-bundle --api-name ConsultantCloud_Revenue_Agent --target-org cc-revenue-org
```

The agent runs as the dedicated Einstein Agent User recorded in the script. Do not replace its generated `complex_data_type_name` values: Salesforce confirms they are required for the External Service contract.

Current blocker: a pristine no-action agent publishes, while a pristine agent with only `externalService://ConsultantCloudRevenueTools.find_account` returns an internal HTTP 500 at `/v1.1/authoring/agents`. The full source validates successfully but cannot currently be committed.
