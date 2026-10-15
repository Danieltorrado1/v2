import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import * as ts from 'typescript';

const roots=['src/modules/cobertura','src/scripts','src/tests'];
const files=roots.flatMap(root=>readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile()&&/^phase48.*\.ts$/.test(entry.name)).map(entry=>join(root,entry.name)));
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
 if(ts.isElementAccessExpression(node))return hashLike(node.expression)||!!node.argumentExpression&&/sha256|hash|digest/i.test(node.argumentExpression.getText());
 return false;
}

test('Phase 48 identity hashes use the shared SHA-256 comparator at every call site',()=>{
 const violations:string[]=[];
 for(const file of files){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const visit=(node:ts.Node)=>{
   if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)&&(hashLike(node.left)||hashLike(node.right))){
    const derOid=file.replaceAll('\\','/')==='src/modules/cobertura/phase48-readonly-tls.ts'&&node.getText(source).includes("toString('hex')===oid");
    if(!derOid)violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}`);
   }
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['includes','indexOf','startsWith','endsWith','equals'].includes(node.expression.name.text)&&hashLike(node.expression.expression))violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}:partial-or-buffer-comparison`);
   ts.forEachChild(node,visit);
  };
  visit(source);
 }
 assert.deepEqual(violations,[]);
});
