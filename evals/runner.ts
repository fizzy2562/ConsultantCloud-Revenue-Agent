import { scenarios } from "./cases/scenarios.js";
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  const allResultsInOrder: Array<{
    passed: boolean;
    skipped?: boolean;
    notes?: string;
  }> = [];

  for (const scenario of scenarios) {
    process.stdout.write(`${scenario.id} ${scenario.name} ... `);
    const result = await scenario.run();
    allResultsInOrder.push(result);

    if (result.skipped) {
      process.stdout.write(`SKIP - ${result.notes ?? ""}\n`);
    } else if (result.passed) {
      process.stdout.write("PASS\n");
    } else {
      process.stdout.write(`FAIL - ${result.notes ?? ""}\n`);
    }
  }

  const total = scenarios.length;
  const passed = allResultsInOrder.filter((r) => r.passed && !r.skipped).length;
  const skipped = allResultsInOrder.filter((r) => r.skipped).length;
  const failed = total - passed - skipped;

  process.stdout.write(
    `${passed} passed, ${failed} failed, ${skipped} skipped (of ${total})\n`
  );

  const resultsObj = {
    runAt: new Date().toISOString(),
    results: scenarios.map((s, i) => ({
      id: s.id,
      name: s.name,
      input: s.input,
      ...allResultsInOrder[i],
    })),
    summary: { total, passed, failed, skipped },
  };

  mkdirSync("results", { recursive: true });
  writeFileSync("results/latest.json", JSON.stringify(resultsObj, null, 2));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
