import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Base44 SDK entity.filter(query, sort, limit): a numeric second argument is an
// invalid sort value, not a limit. It can cause HTTP 400/500 in live functions.
const roots = ['base44/functions', 'src'];
const failures = [];
let checkedFiles = 0;
let checkedCalls = 0;

function inspect(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspect(file); continue; }
    if (!/\.(?:ts|js|jsx)$/.test(entry.name)) continue;
    checkedFiles++;
    const source = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
      file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'filter'
        && node.expression.expression.getText(tree).includes('.entities.')) {
        checkedCalls++;
        if (node.arguments.length > 1 && ts.isNumericLiteral(node.arguments[1])) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
          failures.push(`${file}:${line} has numeric sort=${node.arguments[1].getText(tree)}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
}
for (const root of roots) inspect(root);
if (failures.length) {
  console.error('FAIL invalid Base44 SDK entity.filter signatures:');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`PASS SDK entity.filter(query, sort, limit): ${checkedCalls} calls in ${checkedFiles} files; 0 numeric sort arguments`);
