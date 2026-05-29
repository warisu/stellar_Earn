const { runAll: runOrphanedScriptTests } = require('./check-orphaned-scripts.test');
const { runAll: runContractChangelogDisciplineTests } = require('./check-contract-changelog-discipline.test');

try {
  runOrphanedScriptTests();
  runContractChangelogDisciplineTests();
  console.log('All tests passed');
  process.exit(0);
} catch (e) {
  console.error('Tests failed:', e && e.stack ? e.stack : e);
  process.exit(1);
}
