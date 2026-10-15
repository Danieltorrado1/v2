import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import * as ts from 'typescript';

const roots=['src/modules/cobertura','src/scripts','src/tests'];
const files=roots.flatMap(root=>readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile()&&/phase48/i.test(entry.name)&&/\.(?:ts|cjs|js)$/.test(entry.name)).map(entry=>join(root,entry.name)));
// Documented non-SHA comparisons: TLS compares a DER object identifier string;
// schema-build-scope compares raw SQL text stored under the legacy name definition_hash.
const excludedMetric=/(?:count|entries|fields|keys|names|order|algorithm|digests|comparison|length)$/i;
function hashLike(node:ts.Node):boolean{
 if(ts.isParenthesizedExpression(node))return hashLike(node.expression);
 if(ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isNonNullExpression(node))return hashLike(node.expression);
 if(ts.isCallExpression(node)){
  const callee=node.expression.getText();
  if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='toString'&&node.arguments.some(arg=>arg.kind===ts.SyntaxKind.StringLiteral&&arg.getText().replace(/['"]/g,'')==='hex'))return true;
  if(/(?:sha|hash|digest)/i.test(callee))return true;
  return ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='toLowerCase'&&hashLike(node.expression.expression);
 }
 if(ts.isIdentifier(node))return /(?:sha256|_sha|hash|digest)/i.test(node.text)&&!excludedMetric.test(node.text);
 if(ts.isPropertyAccessExpression(node))return /(?:sha256|_sha|hash|digest)/i.test(node.name.text)&&!excludedMetric.test(node.name.text);
 if(ts.isElementAccessExpression(node)){
  if(hashLike(node.expression)||!!node.argumentExpression&&/sha256|hash|digest/i.test(node.argumentExpression.getText()))return true;
  if(node.argumentExpression&&ts.isIdentifier(node.argumentExpression)){
   let current:ts.Node=node;
   while(current.parent){current=current.parent;if(ts.isForOfStatement(current)&&current.initializer.getText().includes(node.argumentExpression.text)&&/(?:HASHES|DIGESTS)/i.test(current.expression.getText()))return true;}
  }
 }
 return false;
}

test('Phase 48 identity hashes use the shared SHA-256 comparator at every call site',()=>{
 const violations:string[]=[];
 for(const file of files){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
  const visit=(node:ts.Node)=>{
   if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)&&(hashLike(node.left)||hashLike(node.right))){
    const text=node.getText(source);
    const derOid=file.replaceAll('\\','/')==='src/modules/cobertura/phase48-readonly-tls.ts'&&text.includes("toString('hex')===oid");
    const rawSchemaDefinition=file.replaceAll('\\','/')==='src/scripts/phase48-schema-build-scope.cjs'&&text.includes('current.definition!==dep.definition_hash');
    if(!derOid&&!rawSchemaDefinition)violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}`);
   }
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['includes','indexOf','startsWith','endsWith','equals'].includes(node.expression.name.text)&&hashLike(node.expression.expression))violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}:partial-or-buffer-comparison`);
   ts.forEachChild(node,visit);
  };
  visit(source);
 }
 assert.deepEqual(violations,[]);
});
