/**
 * pnpm test:org: the org checks (apps/web/lib/orgChecks.ts) from the command line, against a
 * running app. The Connection tab's "Run org checks" button runs the same checks.
 *
 *   APP_URL=http://localhost:3000 TOOLS_API_KEY=<the app's key> pnpm test:org
 */
import { runOrgChecks } from "../apps/web/lib/orgChecks";

const toolsKey = process.env.TOOLS_API_KEY;
if (!toolsKey) {
  console.error("Set TOOLS_API_KEY to the running app's tools API key.");
  process.exit(2);
}

runOrgChecks({
  baseUrl: process.env.APP_URL ?? "http://localhost:3000",
  toolsKey,
  onCheck: (c) => console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` - ${c.detail}` : ""}`),
}).then((results) => {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
});
