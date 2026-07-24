import assert from 'node:assert/strict';
import test from 'node:test';

import { compileToolPackages } from '../scripts/tools/compiler.mjs';
import { assertSafeToolContent, toolDefinitionSchema, toolManifestSchema } from '../scripts/tools/contracts.mjs';

test('five public tool packages compile from the accepted release without provider calls',()=>{
  const payload=compileToolPackages();
  assert.equal(payload.tools.length,5);
  for(const tool of payload.tools){
    assert.equal(tool.publicationStatus,'published');
    assert.equal(tool.visibility,'public');
    assert.equal(tool.noJavaScriptFallback,'complete-static-table');
    assert.equal(tool.definition.providerCallsOnPageLoad,false);
    assert.equal(tool.definition.transmitsInput,false);
    assert.ok(tool.rows.length>0);
    assert.ok(tool.sourceNotes.length>0);
  }
});

test('tool runtime contracts reject personal transmission and executable content',()=>{
  const payload=compileToolPackages();
  const tool=payload.tools[0];
  const {
    definition, content, rows, releaseId, releaseDigest, sourceNotes, sourceKind, sourcePath,
    packageDigest, draft, preview, thin, redirectState, retirementState, kind, ...manifest
  }=tool;
  assert.equal(toolManifestSchema.safeParse(manifest).success,true);
  const canonicalDefinition={...definition,inputs:definition.inputs.map(({options,...input})=>input)};
  assert.equal(toolDefinitionSchema.safeParse(canonicalDefinition).success,true);
  assert.throws(()=>assertSafeToolContent('<script>alert(1)</script> substantive unsafe content','fixture'),/raw HTML/);
  const unsafe={...canonicalDefinition,transmitsInput:true};
  assert.equal(toolDefinitionSchema.safeParse(unsafe).success,false);
});
